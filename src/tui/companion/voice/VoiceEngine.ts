/**
 * VoiceEngine.ts — 语音合成引擎
 *
 * 提供商优先级 (自动检测):
 *   1. Edge TTS  — Microsoft Neural TTS, 免费无需 key
 *                  中文音色极佳，媲美豆包语音
 *                  依赖: pip install edge-tts  (Python)
 *   2. OpenAI TTS — tts-1-hd, 使用已有 OpenAI key
 *   3. System TTS — macOS say / Linux espeak-ng (降级)
 *
 * 中文音色 (Edge TTS):
 *   zh-CN-XiaoxiaoNeural  晓晓 — 温柔知性，多情感风格 ★推荐
 *   zh-CN-XiaoyiNeural    晓伊 — 活泼少女
 *   zh-CN-XiaohanNeural   晓涵 — 冷静干练
 *   zh-CN-XiaomoNeural    晓墨 — 知性沉稳
 *   zh-CN-YunxiNeural     云希 — 阳光男声
 *   zh-CN-YunyangNeural   云扬 — 专业播报
 *
 * SSML 情感风格: chat / affectionate / cheerful / gentle / sad / excited
 */

import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir, platform } from 'os';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { keyStore } from '../../../ai/keystore.js';

const execFileAsync = promisify(execFile);

// ── Types ─────────────────────────────────────────────────────────────────────

export type VoiceProvider = 'edge' | 'openai' | 'system' | 'none';

export type EdgeVoice =
  | 'zh-CN-XiaoxiaoNeural'
  | 'zh-CN-XiaoyiNeural'
  | 'zh-CN-XiaohanNeural'
  | 'zh-CN-XiaomoNeural'
  | 'zh-CN-YunxiNeural'
  | 'zh-CN-YunyangNeural'
  | 'zh-CN-XiaochenNeural'
  | 'zh-CN-XiaoshuangNeural';

export type SSMLStyle =
  | 'chat' | 'affectionate' | 'cheerful' | 'gentle'
  | 'sad' | 'excited' | 'calm' | 'serious';

export interface VoiceConfig {
  enabled: boolean;
  voice: EdgeVoice;
  rate: string;    // '+0%' / '+20%' / '-10%'
  pitch: string;   // '+0Hz' / '+5Hz'
  style: SSMLStyle;
  autoSpeak: boolean; // speak companion replies automatically
}

export const EDGE_VOICES: Record<EdgeVoice, string> = {
  'zh-CN-XiaoxiaoNeural':  '晓晓 (温柔知性)',
  'zh-CN-XiaoyiNeural':    '晓伊 (活泼少女)',
  'zh-CN-XiaohanNeural':   '晓涵 (冷静干练)',
  'zh-CN-XiaomoNeural':    '晓墨 (知性沉稳)',
  'zh-CN-YunxiNeural':     '云希 (阳光男声)',
  'zh-CN-YunyangNeural':   '云扬 (专业播报)',
  'zh-CN-XiaochenNeural':  '晓辰 (活力青春)',
  'zh-CN-XiaoshuangNeural':'晓双 (亲切邻居)',
};

const DEFAULT_CONFIG: VoiceConfig = {
  enabled: false,
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: '+0%',
  pitch: '+0Hz',
  style: 'chat',
  autoSpeak: true,
};

// ── Text preprocessing ────────────────────────────────────────────────────────

function preprocessText(text: string, maxLen = 180): string {
  let t = text
    .replace(/```[\s\S]*?```/g, '')             // code blocks
    .replace(/`[^`\n]+`/g, '')                  // inline code
    .replace(/https?:\/\/\S+/g, '')             // URLs
    .replace(/\*\*([^*]+)\*\*/g, '$1')          // bold
    .replace(/\*([^*\n]+)\*/g, '$1')            // italic
    .replace(/^#{1,6}\s+/gm, '')               // headers
    .replace(/^[-*+]\s+/gm, '')               // bullets
    .replace(/[■□▪▫◆◇→←↑↓]/g, '')           // box chars
    .replace(/\s+/g, ' ')
    .trim();

  if (t.length > maxLen) {
    // Try to cut at sentence boundary
    const cut = t.search(/[。！？!?]/);
    t = (cut > 15 && cut < maxLen) ? t.slice(0, cut + 1) : t.slice(0, maxLen) + '…';
  }
  return t;
}

// ── Audio playback ────────────────────────────────────────────────────────────

async function playFile(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    const plat = platform();
    const players =
      plat === 'darwin' ? [['afplay', [filePath]]] :
      plat === 'win32'  ? [['powershell', ['-c', `(New-Object Media.SoundPlayer "${filePath}").PlaySync()`]]] :
      // Linux: try in order
      [
        ['mpg123',   ['-q', filePath]],
        ['ffplay',   ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath]],
        ['mplayer',  ['-really-quiet', filePath]],
        ['aplay',    [filePath]],   // wav only — fallback
      ];

    function tryNext(idx: number) {
      if (idx >= players.length) { resolve(); return; }
      const [cmd, args] = players[idx] as [string, string[]];
      const child = spawn(cmd, args, { stdio: 'ignore' });
      child.on('close', (code) => { if (code === 0) resolve(); else tryNext(idx + 1); });
      child.on('error', () => tryNext(idx + 1));
    }
    tryNext(0);
  });
}

async function playAndCleanup(filePath: string): Promise<void> {
  try { await playFile(filePath); } finally { try { unlinkSync(filePath); } catch {} }
}

// ── Edge TTS (via edge-tts Python CLI) ────────────────────────────────────────

let edgeTTSAvailable: boolean | null = null;

async function checkEdgeTTS(): Promise<boolean> {
  if (edgeTTSAvailable !== null) return edgeTTSAvailable;
  try {
    await execFileAsync('edge-tts', ['--version'], { timeout: 3000 });
    edgeTTSAvailable = true;
  } catch {
    edgeTTSAvailable = false;
  }
  return edgeTTSAvailable;
}

async function synthesizeEdgeTTS(
  text: string,
  voice: EdgeVoice,
  style: SSMLStyle,
  rate: string,
  pitch: string,
): Promise<string> {
  const outFile = join(tmpdir(), `neo_voice_${randomUUID()}.mp3`);
  const ssml = [
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'`,
    ` xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='zh-CN'>`,
    `<voice name='${voice}'>`,
    `<mstts:express-as style='${style}'>`,
    `<prosody rate='${rate}' pitch='${pitch}'>${text.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]!))}</prosody>`,
    `</mstts:express-as></voice></speak>`,
  ].join('');

  await execFileAsync('edge-tts', ['--write-media', outFile, '--ssml', ssml], { timeout: 20000 });
  return outFile;
}

// ── OpenAI TTS ────────────────────────────────────────────────────────────────

async function synthesizeOpenAI(text: string, _style: SSMLStyle): Promise<string | null> {
  // Get OpenAI or compatible key from keystore
  const key = keyStore.getKey('openai') ?? keyStore.getKey('anthropic');
  if (!key) return null;

  try {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text,
        voice: 'nova',  // warm, natural female voice
        speed: 1.0,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const outFile = join(tmpdir(), `neo_voice_oai_${Date.now()}.mp3`);
    writeFileSync(outFile, Buffer.from(buf));
    return outFile;
  } catch {
    return null;
  }
}

// ── System TTS ────────────────────────────────────────────────────────────────

async function synthesizeSystem(text: string): Promise<void> {
  return new Promise((resolve) => {
    const plat = platform();
    const cmd = plat === 'darwin' ? 'say' : 'espeak-ng';
    const args = plat === 'darwin'
      ? ['-v', 'Ting-Ting', '-r', '180', text]
      : ['-v', 'cmn', '-s', '150', text];

    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

// ── VoiceEngine ───────────────────────────────────────────────────────────────

export class VoiceEngine {
  private cfg: VoiceConfig = { ...DEFAULT_CONFIG };
  private queue: Array<{ text: string; style: SSMLStyle }> = [];
  private processing = false;
  private detectedProvider: VoiceProvider | null = null;
  private detectInProgress = false;

  // ── Config ─────────────────────────────────────────────────────────────────

  get isEnabled() { return this.cfg.enabled; }
  get isPlaying() { return this.processing; }
  get config(): VoiceConfig { return { ...this.cfg }; }

  updateConfig(patch: Partial<VoiceConfig>) {
    Object.assign(this.cfg, patch);
    if (!this.cfg.enabled) this.stop();
  }

  // ── Control ────────────────────────────────────────────────────────────────

  toggle() {
    this.cfg.enabled = !this.cfg.enabled;
    if (!this.cfg.enabled) this.stop();
    return this.cfg.enabled;
  }

  stop() {
    this.queue = [];
    this.processing = false;
  }

  // ── Speak ──────────────────────────────────────────────────────────────────

  speak(text: string, style?: SSMLStyle): void {
    if (!this.cfg.enabled) return;
    const clean = preprocessText(text);
    if (!clean) return;
    // Max queue 2 — drop oldest if backed up
    if (this.queue.length >= 2) this.queue.shift();
    this.queue.push({ text: clean, style: style ?? this.cfg.style });
    if (!this.processing) void this.drain();
  }

  private async drain(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      await this.synthesize(item.text, item.style).catch(() => {});
    }
    this.processing = false;
  }

  private async synthesize(text: string, style: SSMLStyle): Promise<void> {
    const provider = await this.getProvider();

    if (provider === 'edge') {
      const file = await synthesizeEdgeTTS(text, this.cfg.voice, style, this.cfg.rate, this.cfg.pitch);
      await playAndCleanup(file);
      return;
    }

    if (provider === 'openai') {
      const file = await synthesizeOpenAI(text, style);
      if (file) { await playAndCleanup(file); return; }
    }

    if (provider === 'system') {
      await synthesizeSystem(text);
    }
  }

  // ── Provider detection ─────────────────────────────────────────────────────

  async getProvider(): Promise<VoiceProvider> {
    if (this.detectedProvider !== null) return this.detectedProvider;
    if (this.detectInProgress) return 'none';
    this.detectInProgress = true;

    try {
      if (await checkEdgeTTS()) {
        this.detectedProvider = 'edge';
        return 'edge';
      }
      // OpenAI TTS check
      const key = keyStore.getKey('openai');
      if (key) {
        this.detectedProvider = 'openai';
        return 'openai';
      }
      // System TTS
      if (platform() === 'darwin' || platform() === 'linux') {
        this.detectedProvider = 'system';
        return 'system';
      }
    } catch {}

    this.detectedProvider = 'none';
    return 'none';
  }

  /** Force re-detect (e.g. after user installs edge-tts) */
  resetProvider() {
    edgeTTSAvailable = null;
    this.detectedProvider = null;
    this.detectInProgress = false;
  }

  /** Human-readable provider name */
  providerLabel(): string {
    switch (this.detectedProvider) {
      case 'edge':   return 'Edge TTS (Neural)';
      case 'openai': return 'OpenAI TTS';
      case 'system': return platform() === 'darwin' ? 'macOS say' : 'espeak-ng';
      default:       return '未检测到语音引擎';
    }
  }

  /** Map companion mood to SSML style */
  static moodToStyle(mood: number): SSMLStyle {
    if (mood > 0.6) return 'cheerful';
    if (mood > 0.2) return 'chat';
    if (mood < -0.4) return 'sad';
    return 'gentle';
  }
}

export const voiceEngine = new VoiceEngine();
