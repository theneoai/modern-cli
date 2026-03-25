/**
 * useRawInput — POSIX 原始终端输入
 *
 * 直接从 process.stdin 读字节流，自己完整解析 ANSI/VT100 序列。
 * 不经过 Node.js readline 的归一化层，不依赖 Ink 的 useInput。
 * 行为等价于 vim/htop 等直接使用 termios 的 C 程序。
 *
 * 设计要点:
 *   - 残余缓冲区：跨 chunk 的不完整序列正确拼接
 *   - ESC 去抖：50ms 超时区分裸 ESC 和 ESC 序列前缀
 *   - 完整 F1-F12：覆盖 SS3 / CSI tilde / xterm-216 三种编码
 *   - 退出清理：进程退出时还原终端到熟化(cooked)模式
 *   - 非 TTY 兜底：stdin 非 TTY 时静默降级，不崩溃
 */

import { useEffect, useRef } from 'react';

// ── Key event ─────────────────────────────────────────────────────────────────

export interface RawKey {
  // 方向键
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  // 定位键
  home: boolean;
  end: boolean;
  pageUp: boolean;
  pageDown: boolean;
  insert: boolean;
  // 编辑键
  backspace: boolean;   // \x7f 或 \x08 — macOS Terminal/iTerm2/Linux 统一映射至此
  delete: boolean;      // \x1b[3~ — 前向删除 (Fn+Delete / Del键)
  tab: boolean;
  return: boolean;
  escape: boolean;
  space: boolean;
  // 功能键 F1-F12 (char = 'F1'…'F12')
  // 修饰键
  ctrl: boolean;
  meta: boolean;    // Alt / Option (需终端启用 "Use Option as Meta Key")
  shift: boolean;
  /**
   * 可打印字符或功能键名。
   * - 普通字符: 'a', 'A', '1', '中', …
   * - ctrl+字母: 'a'–'z' (永远小写，可直接与字面量比较)
   * - 功能键: 'F1'–'F12'
   * - 其余情况: ''
   */
  char: string;
  /** 原始终端字节序列，用于调试 */
  sequence: string;
}

function emptyKey(): RawKey {
  return {
    up: false, down: false, left: false, right: false,
    home: false, end: false, pageUp: false, pageDown: false, insert: false,
    backspace: false, delete: false, tab: false, return: false,
    escape: false, space: false,
    ctrl: false, meta: false, shift: false,
    char: '', sequence: '',
  };
}

// ── 完整 ANSI/VT100 序列表 ────────────────────────────────────────────────────

// CSI ~功能键  \x1b[Ps~
// 参考: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html  表 3
const CSI_TILDE_MAP: ReadonlyMap<number, (k: RawKey) => void> = new Map([
  [1,  k => { k.home    = true; }],
  [2,  k => { k.insert  = true; }],
  [3,  k => { k.delete  = true; }],
  [4,  k => { k.end     = true; }],
  [5,  k => { k.pageUp  = true; }],
  [6,  k => { k.pageDown = true; }],
  [7,  k => { k.home    = true; }],  // rxvt
  [8,  k => { k.end     = true; }],  // rxvt
  // F1-F4 (xterm CSI tilde 旧编码)
  [11, k => { k.char = 'F1'; }],
  [12, k => { k.char = 'F2'; }],
  [13, k => { k.char = 'F3'; }],
  [14, k => { k.char = 'F4'; }],
  // F5-F12  (注意: 没有 16, 没有 22)
  [15, k => { k.char = 'F5';  }],
  [17, k => { k.char = 'F6';  }],
  [18, k => { k.char = 'F7';  }],
  [19, k => { k.char = 'F8';  }],
  [20, k => { k.char = 'F9';  }],
  [21, k => { k.char = 'F10'; }],
  [23, k => { k.char = 'F11'; }],
  [24, k => { k.char = 'F12'; }],
]);

// SS3 序列  \x1bO<byte>
const SS3_MAP: ReadonlyMap<number, (k: RawKey) => void> = new Map([
  [0x41, k => { k.up    = true; }],
  [0x42, k => { k.down  = true; }],
  [0x43, k => { k.right = true; }],
  [0x44, k => { k.left  = true; }],
  [0x46, k => { k.end   = true; }],
  [0x48, k => { k.home  = true; }],
  [0x50, k => { k.char = 'F1'; }],
  [0x51, k => { k.char = 'F2'; }],
  [0x52, k => { k.char = 'F3'; }],
  [0x53, k => { k.char = 'F4'; }],
]);

// CSI 修饰符编码: \x1b[1;<mod>A 形式
// mod=2 shift, mod=3 alt, mod=4 shift+alt, mod=5 ctrl, mod=6 shift+ctrl, mod=7 ctrl+alt …
function applyModifier(key: RawKey, mod: number): void {
  const m = mod - 1;
  if (m & 1) key.shift = true;
  if (m & 2) key.meta  = true;
  if (m & 4) key.ctrl  = true;
}

// ── 解析结果 ──────────────────────────────────────────────────────────────────

interface ParseResult {
  keys: RawKey[];
  /**
   * 本次 chunk 末尾未完成的序列字节。
   * 引擎会将其前置到下一个 chunk 重新解析。
   */
  residual: Buffer;
}

// ── 序列解析器 (无状态纯函数) ─────────────────────────────────────────────────

/**
 * 将一段原始字节解析为 RawKey 数组。
 * 如果 buf 末尾有不完整序列，将其放入 residual 由调用方处理。
 */
export function parseBuffer(buf: Buffer): ParseResult {
  const keys: RawKey[] = [];
  let i = 0;

  while (i < buf.length) {
    const b = buf[i]!;

    // ── ESC 序列 ───────────────────────────────────────────────────────────
    if (b === 0x1b) {
      // 序列未完成 (ESC 在 chunk 末尾) — 交给引擎做 50ms 去抖
      if (i + 1 >= buf.length) {
        return { keys, residual: buf.slice(i) };
      }

      const next = buf[i + 1]!;

      // ── CSI: ESC [ ────────────────────────────────────────────────────
      if (next === 0x5b) {
        const seqStart = i;
        i += 2;

        // 读参数字节 0x30–0x3f，中间字节 0x20–0x2f
        while (i < buf.length && buf[i]! >= 0x20 && buf[i]! < 0x40) i++;

        // chunk 末尾序列不完整 — 残余
        if (i >= buf.length) {
          return { keys, residual: buf.slice(seqStart) };
        }

        const finalByte = buf[i]!;
        i++;
        const paramStr = buf.slice(seqStart + 2, i - 1).toString('ascii');
        const key = emptyKey();
        key.sequence = buf.slice(seqStart, i).toString('binary');

        const parts = paramStr.split(';');
        // 严格验证参数范围，避免 parseInt 返回 NaN/Infinity
        const p1 = clampInt(parts[0] ?? '', 0, 9999, 0);
        const p2 = clampInt(parts[1] ?? '', 1, 9999, 1);

        switch (finalByte) {
          case 0x41: key.up    = true; break;  // A
          case 0x42: key.down  = true; break;  // B
          case 0x43: key.right = true; break;  // C
          case 0x44: key.left  = true; break;  // D
          case 0x46: key.end   = true; break;  // F
          case 0x48: key.home  = true; break;  // H
          case 0x5a: key.tab = true; key.shift = true; break; // Z: Shift+Tab
          case 0x7e: {                          // ~: 功能键
            const apply = CSI_TILDE_MAP.get(p1);
            if (apply) apply(key);
            if (p2 > 1) applyModifier(key, p2);
            break;
          }
          default: break; // 未知 CSI 序列，生成空键 (不崩溃)
        }

        // CSI 1;<mod> 方向键
        const isArrow = finalByte >= 0x41 && finalByte <= 0x44;
        if (isArrow && parts.length >= 2 && p2 > 1) {
          applyModifier(key, p2);
        }

        keys.push(key);
        continue;
      }

      // ── SS3: ESC O ────────────────────────────────────────────────────
      if (next === 0x4f) {
        // 需要再一个字节
        if (i + 2 >= buf.length) {
          return { keys, residual: buf.slice(i) };
        }
        const finalByte = buf[i + 2]!;
        const key = emptyKey();
        key.sequence = buf.slice(i, i + 3).toString('binary');
        const apply = SS3_MAP.get(finalByte);
        if (apply) apply(key);
        keys.push(key);
        i += 3;
        continue;
      }

      // ── 双 ESC: \x1b\x1b — 第一个是裸 ESC，第二个重新进入循环 ───────
      if (next === 0x1b) {
        const escKey = emptyKey();
        escKey.escape = true;
        escKey.sequence = '\x1b';
        keys.push(escKey);
        i++; // 只跳过第一个 ESC，第二个在下轮循环处理
        continue;
      }

      // ── Alt + 单字节: ESC <key> ───────────────────────────────────────
      {
        const altCharBuf = buf.slice(i + 1, i + 2); // 紧跟 ESC 的字节
        const inner = parseBuffer(altCharBuf);
        // inner 不会有 residual (单字节输入)
        for (const k of inner.keys) {
          k.meta = true;
          k.sequence = '\x1b' + k.sequence;
        }
        keys.push(...inner.keys);
        i += 2;
        continue;
      }
    }

    // ── 单字节 ─────────────────────────────────────────────────────────────

    const key = emptyKey();
    key.sequence = String.fromCharCode(b);

    // Backspace: DEL (0x7f) 或 BS (0x08)
    if (b === 0x7f || b === 0x08) {
      key.backspace = true;
      keys.push(key); i++; continue;
    }

    // Enter: CR (0x0d) 或 LF (0x0a)
    // 注意: Ctrl+M = 0x0d = Enter，在 POSIX 层面无法区分
    if (b === 0x0d || b === 0x0a) {
      key.return = true;
      keys.push(key); i++; continue;
    }

    // Tab
    if (b === 0x09) {
      key.tab = true;
      keys.push(key); i++; continue;
    }

    // Ctrl+A … Ctrl+Z  (0x01–0x1a)
    // char 统一为小写字母，与字面量直接比较即可
    if (b >= 0x01 && b <= 0x1a) {
      key.ctrl = true;
      key.char = String.fromCharCode(b + 0x60); // 0x01 → 'a', …, 0x1a → 'z'
      keys.push(key); i++; continue;
    }

    // Ctrl+\ Ctrl+] Ctrl+^ Ctrl+_  (0x1c–0x1f)
    if (b >= 0x1c && b <= 0x1f) {
      key.ctrl = true;
      key.char = String.fromCharCode(b + 0x40); // 0x1c → '\', …
      keys.push(key); i++; continue;
    }

    // Space (0x20)
    if (b === 0x20) {
      key.space = true; key.char = ' ';
      keys.push(key); i++; continue;
    }

    // ASCII 可打印字符 (0x21–0x7e)
    if (b >= 0x21 && b <= 0x7e) {
      key.char = String.fromCharCode(b);
      keys.push(key); i++; continue;
    }

    // UTF-8 多字节字符 (0x80–0xff)
    if (b >= 0x80) {
      const byteCount =
        b >= 0xf0 ? 4 :
        b >= 0xe0 ? 3 :
        b >= 0xc0 ? 2 : 1;  // 0x80–0xbf: 续字节，作为单字节兜底

      // chunk 末尾字节不够 — 残余，等下一块
      if (i + byteCount > buf.length) {
        return { keys, residual: buf.slice(i) };
      }

      // 验证续字节 (0x80–0xbf)
      let valid = true;
      for (let j = 1; j < byteCount; j++) {
        const cb = buf[i + j]!;
        if (cb < 0x80 || cb > 0xbf) { valid = false; break; }
      }

      if (valid) {
        const charBuf = buf.slice(i, i + byteCount);
        key.char = charBuf.toString('utf8');
        key.sequence = charBuf.toString('binary');
        keys.push(key);
        i += byteCount;
      } else {
        // 非法序列，跳过首字节
        i++;
      }
      continue;
    }

    // 其他控制字符 — 静默丢弃
    i++;
  }

  return { keys, residual: Buffer.alloc(0) };
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function clampInt(s: string, min: number, max: number, fallback: number): number {
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ── RawInputEngine — 有状态单例 ───────────────────────────────────────────────

type KeyListener = (key: RawKey) => void;

/**
 * 管理 stdin 监听、残余缓冲、ESC 去抖、退出清理。
 * 全局单例，生命周期与进程相同。
 */
class RawInputEngine {
  private readonly listeners = new Set<KeyListener>();
  private residual = Buffer.alloc(0);
  private residualTimer: ReturnType<typeof setTimeout> | null = null;
  private escTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEsc: RawKey | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    if (!process.stdin.isTTY) {
      // 非 TTY (管道/重定向) — 不启用原始模式，直接返回
      // 键盘事件不会触发，但应用不会崩溃
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (chunk: Buffer | string) => this.handleChunk(chunk));

    // ── 退出时还原终端 ────────────────────────────────────────────────────
    // 三路兜底：正常退出 / SIGINT (Ctrl+C) / SIGTERM
    // 如果不还原，终端会停留在 raw mode，用户看到的字符不回显、无行缓冲，
    // 需要手动执行 `reset` 恢复，体验极差。
    const restore = () => {
      try {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
      } catch { /* ignore, process is exiting */ }
    };
    process.once('exit',   restore);
    process.once('SIGINT',  () => { restore(); process.exit(0); });
    process.once('SIGTERM', () => { restore(); process.exit(0); });
  }

  addListener(fn: KeyListener): void    { this.listeners.add(fn);    }
  removeListener(fn: KeyListener): void { this.listeners.delete(fn); }

  private handleChunk(chunk: Buffer | string): void {
    // 新数据到达 — 取消待处理的残余 ESC 定时器（残余将与新数据合并重解析）
    if (this.residualTimer !== null) {
      clearTimeout(this.residualTimer);
      this.residualTimer = null;
    }

    const incoming = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as string, 'utf8');

    // 前置上次残余字节
    const buf = this.residual.length > 0
      ? Buffer.concat([this.residual, incoming])
      : incoming;
    this.residual = Buffer.alloc(0);

    const { keys, residual } = parseBuffer(buf);

    // 保存新的残余 (不完整序列末尾)
    // Buffer.from() 复制出独立 ArrayBuffer，避免 slice 持有大 chunk 引用阻碍 GC
    this.residual = residual.length > 0 ? Buffer.from(residual) : Buffer.alloc(0);

    for (const key of keys) {
      this.deliver(key);
    }

    // 残余以 ESC 开头 → 启动 50ms 定时器，超时后作为裸 ESC 投递
    // （若 50ms 内有新 chunk 到达，上面的 clearTimeout 会取消此定时器）
    if (this.residual.length > 0 && this.residual[0] === 0x1b) {
      this.residualTimer = setTimeout(() => this.flushResidual(), 50);
    }
  }

  private flushResidual(): void {
    this.residualTimer = null;
    if (this.residual.length === 0) return;

    // 取出残余并清空，避免后续 handleChunk 重复处理
    const residual = this.residual;
    this.residual = Buffer.alloc(0);

    // 将首字节（ESC）作为裸 Escape 键投递
    const esc = emptyKey();
    esc.escape = true;
    esc.sequence = '\x1b';
    this.deliver(esc);

    // 解析 ESC 之后的剩余字节（如果有）
    if (residual.length > 1) {
      const { keys, residual: rest } = parseBuffer(Buffer.from(residual.slice(1)));
      this.residual = rest.length > 0 ? Buffer.from(rest) : Buffer.alloc(0);
      for (const key of keys) this.deliver(key);
      // 若仍有 ESC 残余，重启定时器
      if (this.residual.length > 0 && this.residual[0] === 0x1b) {
        this.residualTimer = setTimeout(() => this.flushResidual(), 50);
      }
    }
  }

  private deliver(key: RawKey): void {
    // ── ESC 去抖逻辑 ───────────────────────────────────────────────────────
    // 问题: 当 ESC 字节单独出现在 chunk 末尾时，不知道后续字节是否还在路上。
    //   可能是: 用户按了 Escape (裸 ESC)
    //   可能是: ESC+[+A (上箭头) 被分成了两个 TCP/串口包
    //
    // 解法: 缓存首个 ESC，等待 50ms。
    //   - 若 50ms 内有更多数据到达并开始了 ANSI 序列 → 已由 handleChunk 合并，正常到达
    //   - 若 50ms 超时无后续 → 裸 ESC，投递给监听器
    //
    // 注意: 现代本地终端(iTerm2/macOS Terminal/Alacritty)几乎总是原子发送完整序列，
    //       去抖主要处理 SSH 慢链路和极少数情况。
    if (key.escape && !key.meta) {
      // 如果已有一个 pending ESC 在等待，先投递它
      if (this.pendingEsc) this.flushPendingEsc();

      this.pendingEsc = key;
      this.escTimer = setTimeout(() => this.flushPendingEsc(), 50);
      return;
    }

    // 收到非 ESC 键 → 先把 pending ESC 投递出去
    if (this.pendingEsc) this.flushPendingEsc();

    this.emit(key);
  }

  private flushPendingEsc(): void {
    if (!this.pendingEsc) return;
    if (this.escTimer !== null) {
      clearTimeout(this.escTimer);
      this.escTimer = null;
    }
    const esc = this.pendingEsc;
    this.pendingEsc = null;
    this.emit(esc);
  }

  private emit(key: RawKey): void {
    for (const listener of this.listeners) {
      try { listener(key); }
      catch { /* single listener error doesn't affect others */ }
    }
  }
}

const engine = new RawInputEngine();

// ── React Hook ────────────────────────────────────────────────────────────────

/**
 * useRawInput(handler, isActive?)
 *
 * 直接从 stdin 字节流解析键盘事件。
 * handler 通过 ref 持有，每次 render 自动使用最新闭包，无 stale closure。
 *
 * @param handler - 接收 RawKey 事件的回调
 * @param isActive - false 时暂停监听，组件 unmount 时自动清理
 */
export function useRawInput(
  handler: (key: RawKey) => void,
  isActive = true,
): void {
  // 通过 ref 持有最新 handler，避免 stale closure 而不需要重建 listener
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!isActive) return;

    engine.start();

    // 稳定的 listener 函数，始终调用 ref 中的最新 handler
    const listener: KeyListener = (key) => handlerRef.current(key);
    engine.addListener(listener);
    return () => engine.removeListener(listener);
  }, [isActive]);
}
