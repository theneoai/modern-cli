/**
 * Voice System - Speech recognition and synthesis
 */

import { spawn } from 'child_process';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getDataDir } from '../core/config/paths.js';
import { events } from '../core/events/index.js';

export interface VoiceConfig {
  provider: 'whisper' | 'google' | 'azure' | 'elevenlabs' | 'local';
  apiKey?: string;
  language?: string;
  voice?: string;
  model?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export interface TTSResult {
  audioPath: string;
  duration: number;
  format: string;
}

// Speech to Text
export async function speechToText(
  audioPath: string,
  config: VoiceConfig = { provider: 'whisper' }
): Promise<TranscriptionResult> {
  switch (config.provider) {
    case 'whisper':
      return whisperTranscribe(audioPath, config);
    case 'google':
      return googleTranscribe(audioPath, config);
    default:
      throw new Error(`Provider ${config.provider} not implemented`);
  }
}

// Whisper transcription
async function whisperTranscribe(audioPath: string, config: VoiceConfig): Promise<TranscriptionResult> {
  // Check if whisper CLI is available
  return new Promise((resolve, reject) => {
    const child = spawn('whisper', [
      audioPath,
      '--model', config.model || 'base',
      '--language', config.language || 'en',
      '--output_format', 'json',
    ]);

    let output = '';
    let error = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Whisper failed: ${error}`));
        return;
      }

      try {
        // Whisper outputs JSON file
        const jsonPath = audioPath.replace(/\.[^/.]+$/, '.json');
        const result = JSON.parse(await readFile(jsonPath, 'utf-8'));
        
        resolve({
          text: result.text,
          confidence: result.segments?.[0]?.avg_logprob || 0.9,
          language: result.language,
          segments: result.segments?.map((s: any) => ({
            start: s.start,
            end: s.end,
            text: s.text,
          })),
        });
      } catch (e) {
        resolve({
          text: output.trim(),
          confidence: 0.8,
        });
      }
    });
  });
}

// Google Speech-to-Text
async function googleTranscribe(audioPath: string, config: VoiceConfig): Promise<TranscriptionResult> {
  const apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Google API key not configured');

  // Read audio file as base64
  const audioData = await readFile(audioPath);
  const base64Audio = audioData.toString('base64');

  const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: config.language || 'en-US',
      },
      audio: {
        content: base64Audio,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Google API error: ${response.statusText}`);
  }

  const data = await response.json();
  const result = data.results?.[0];

  return {
    text: result?.alternatives?.[0]?.transcript || '',
    confidence: result?.alternatives?.[0]?.confidence || 0,
    language: config.language,
  };
}

// Text to Speech
export async function textToSpeech(
  text: string,
  outputPath: string,
  config: VoiceConfig = { provider: 'elevenlabs' }
): Promise<TTSResult> {
  switch (config.provider) {
    case 'elevenlabs':
      return elevenLabsTTS(text, outputPath, config);
    case 'azure':
      return azureTTS(text, outputPath, config);
    case 'local':
      return localTTS(text, outputPath, config);
    default:
      throw new Error(`Provider ${config.provider} not implemented`);
  }
}

// ElevenLabs TTS
async function elevenLabsTTS(text: string, outputPath: string, config: VoiceConfig): Promise<TTSResult> {
  const apiKey = config.apiKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ElevenLabs API key not configured');

  const voiceId = config.voice || '21m00Tcm4TlvDq8ikWAM'; // Default voice

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.statusText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  await writeFile(outputPath, Buffer.from(audioBuffer));

  events.emit('voice.tts.completed', { text: text.slice(0, 100), outputPath });

  return {
    audioPath: outputPath,
    duration: text.length * 0.1, // Rough estimate
    format: 'mp3',
  };
}

// Azure TTS
async function azureTTS(text: string, outputPath: string, config: VoiceConfig): Promise<TTSResult> {
  const apiKey = config.apiKey || process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'eastus';
  
  if (!apiKey) throw new Error('Azure Speech key not configured');

  const ssml = `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${config.language || 'en-US'}">
      <voice name="${config.voice || 'en-US-JennyNeural'}">
        ${text}
      </voice>
    </speak>
  `;

  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
    },
    body: ssml,
  });

  if (!response.ok) {
    throw new Error(`Azure API error: ${response.statusText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  await writeFile(outputPath, Buffer.from(audioBuffer));

  return {
    audioPath: outputPath,
    duration: text.length * 0.1,
    format: 'mp3',
  };
}

// Local TTS using system command
async function localTTS(text: string, outputPath: string, config: VoiceConfig): Promise<TTSResult> {
  return new Promise((resolve, reject) => {
    // macOS say command
    const child = spawn('say', [
      '-o', outputPath,
      '--data-format=LEF32@22050',
      text,
    ]);

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Local TTS failed with code ${code}`));
        return;
      }

      resolve({
        audioPath: outputPath,
        duration: text.length * 0.1,
        format: 'wav',
      });
    });

    child.on('error', reject);
  });
}

// Voice assistant - continuous listening
export class VoiceAssistant {
  private isListening = false;
  private config: VoiceConfig;
  private onCommand: (text: string) => Promise<void>;

  constructor(config: VoiceConfig, onCommand: (text: string) => Promise<void>) {
    this.config = config;
    this.onCommand = onCommand;
  }

  async start(): Promise<void> {
    if (this.isListening) return;
    this.isListening = true;

    console.log('🎤 Voice assistant started. Say "Hey Hyper" to activate...');

    // In a real implementation, this would use continuous streaming
    // For now, simulate with polling
    while (this.isListening) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  stop(): void {
    this.isListening = false;
    console.log('🎤 Voice assistant stopped');
  }

  async processAudio(audioPath: string): Promise<void> {
    try {
      const transcription = await speechToText(audioPath, this.config);
      console.log(`🗣️ Heard: ${transcription.text}`);

      if (transcription.text.toLowerCase().includes('hyper')) {
        await this.onCommand(transcription.text);
      }
    } catch (error) {
      console.error('Voice processing error:', error);
    }
  }
}

// Voice memo system
export interface VoiceMemo {
  id: string;
  title: string;
  audioPath: string;
  transcription?: string;
  createdAt: Date;
  duration: number;
}

export async function createVoiceMemo(audioPath: string, title?: string): Promise<VoiceMemo> {
  const id = Date.now().toString();
  const memoDir = join(getDataDir(), 'voice-memos');
  await mkdir(memoDir, { recursive: true });

  const targetPath = join(memoDir, `${id}.wav`);
  
  // Copy/move audio file
  const audioData = await readFile(audioPath);
  await writeFile(targetPath, audioData);

  // Transcribe
  let transcription: string | undefined;
  try {
    const result = await speechToText(targetPath, { provider: 'whisper' });
    transcription = result.text;
  } catch {
    // Ignore transcription errors
  }

  const memo: VoiceMemo = {
    id,
    title: title || `Memo ${new Date().toLocaleString()}`,
    audioPath: targetPath,
    transcription,
    createdAt: new Date(),
    duration: audioData.length / 32000, // Rough estimate for 16kHz mono
  };

  // Save metadata
  const db = getDB();
  db.prepare(`
    INSERT INTO voice_memos (id, title, audio_path, transcription, created_at, duration)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    memo.id,
    memo.title,
    memo.audioPath,
    memo.transcription,
    memo.createdAt.toISOString(),
    memo.duration
  );

  events.emit('voice.memo.created', { memoId: memo.id });
  return memo;
}

// Read voice memos
export function getVoiceMemos(): VoiceMemo[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM voice_memos ORDER BY created_at DESC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    audioPath: row.audio_path,
    transcription: row.transcription,
    createdAt: new Date(row.created_at),
    duration: row.duration,
  }));
}

// Initialize tables
import { getDB } from '../core/db/index.js';
export function initVoiceTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_memos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      audio_path TEXT NOT NULL,
      transcription TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      duration REAL
    );
  `);
}
