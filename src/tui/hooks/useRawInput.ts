/**
 * useRawInput — POSIX 原始终端输入
 *
 * 直接从 process.stdin 读字节，自己解析 ANSI/VT100 序列。
 * 不经过 Node.js readline 的归一化，也不依赖 Ink 的 useInput。
 * 行为与 vim/htop 等 C 程序完全一致，跨终端、跨平台稳定。
 *
 * 用法:
 *   useRawInput((key) => {
 *     if (key.ctrl && key.char === 'a') ...  // 永远可靠
 *     if (key.backspace) ...                 // \x7f 和 \x08 都映射到此
 *   }, isActive);
 */

import { useEffect, useRef } from 'react';

// ── Key event ─────────────────────────────────────────────────────────────────

export interface RawKey {
  // 方向键
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  // 功能键
  home: boolean;
  end: boolean;
  pageUp: boolean;
  pageDown: boolean;
  insert: boolean;
  // 编辑键
  backspace: boolean;   // \x7f 或 \x08 — macOS Terminal/iTerm2/Linux 统一为此
  delete: boolean;      // \x1b[3~ — 前向删除
  tab: boolean;
  return: boolean;
  escape: boolean;
  space: boolean;
  // 修饰键
  ctrl: boolean;
  meta: boolean;        // Alt / Option
  shift: boolean;
  // 可打印字符 (已去除修饰前缀)
  // ctrl=true 时 char 是字母 'a'-'z'，可以直接比较
  char: string;
  // 原始序列 (调试用)
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

// ── ANSI/VT100 序列解析器 ─────────────────────────────────────────────────────
//
// 参考: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
//       https://www.xfree86.org/current/ctlseqs.html

// CSI 功能键序列 → 键名
const CSI_TILDE: Record<number, keyof RawKey> = {
  1: 'home', 2: 'insert', 3: 'delete', 4: 'end',
  5: 'pageUp', 6: 'pageDown', 7: 'home', 8: 'end',
};

// CSI 修饰符编码 (1=shift, 2=alt, 3=shift+alt, 4=ctrl, 5=shift+ctrl, …)
function applyModifier(key: RawKey, mod: number) {
  const m = mod - 1;
  if (m & 1) key.shift = true;
  if (m & 2) key.meta = true;
  if (m & 4) key.ctrl = true;
}

export function parseBuffer(buf: Buffer): RawKey[] {
  const keys: RawKey[] = [];
  let i = 0;

  while (i < buf.length) {
    const b = buf[i]!;

    // ── ESC sequences ──────────────────────────────────────────────────────
    if (b === 0x1b) {
      // 裸 ESC (序列末尾或唯一字节)
      if (i + 1 >= buf.length) {
        keys.push({ ...emptyKey(), escape: true, sequence: '\x1b' });
        i++;
        continue;
      }

      const next = buf[i + 1]!;

      // CSI: ESC [
      if (next === 0x5b) {
        const seqStart = i;
        i += 2;
        // 读取参数字节 (0x30–0x3f) 和中间字节 (0x20–0x2f)
        let params = '';
        while (i < buf.length && buf[i]! >= 0x20 && buf[i]! < 0x40) {
          params += String.fromCharCode(buf[i]!);
          i++;
        }
        const final = i < buf.length ? buf[i]! : 0;
        i++;

        const key = emptyKey();
        key.sequence = buf.slice(seqStart, i).toString('binary');

        // 解析 CSI Ps ; Pm 字符
        const parts = params.split(';');
        const p1 = parseInt(parts[0] || '0', 10) || 0;
        const p2 = parseInt(parts[1] || '1', 10) || 1;

        switch (final) {
          case 0x41: key.up = true;    break; // A
          case 0x42: key.down = true;  break; // B
          case 0x43: key.right = true; break; // C
          case 0x44: key.left = true;  break; // D
          case 0x46: key.end = true;   break; // F
          case 0x48: key.home = true;  break; // H
          case 0x5a: key.tab = true; key.shift = true; break; // Z (Shift+Tab)
          case 0x7e: { // ~ 功能键
            const mapped = CSI_TILDE[p1];
            if (mapped) (key as unknown as Record<string, unknown>)[mapped] = true;
            if (p2 > 1) applyModifier(key, p2);
            break;
          }
          default: break;
        }
        // CSI 1 ; mod A/B/C/D 形式的带修饰符方向键
        if ([0x41, 0x42, 0x43, 0x44].includes(final) && parts.length === 2) {
          applyModifier(key, p2);
        }
        keys.push(key);
        continue;
      }

      // SS3: ESC O
      if (next === 0x4f) {
        i += 2;
        const final2 = i < buf.length ? buf[i]! : 0;
        i++;
        const key = emptyKey();
        key.sequence = buf.slice(i - 3, i).toString('binary');
        switch (final2) {
          case 0x41: key.up = true;    break;
          case 0x42: key.down = true;  break;
          case 0x43: key.right = true; break;
          case 0x44: key.left = true;  break;
          case 0x46: key.end = true;   break;
          case 0x48: key.home = true;  break;
          case 0x50: key.char = 'F1';  break;
          case 0x51: key.char = 'F2';  break;
          case 0x52: key.char = 'F3';  break;
          case 0x53: key.char = 'F4';  break;
        }
        keys.push(key);
        continue;
      }

      // Alt + 单字节: ESC <key>
      {
        i += 2;
        const altBuf = buf.slice(i - 1, i);
        const altKeys = parseBuffer(altBuf);
        for (const k of altKeys) {
          k.meta = true;
          k.sequence = '\x1b' + k.sequence;
        }
        keys.push(...altKeys);
        continue;
      }
    }

    // ── 单字节 ─────────────────────────────────────────────────────────────

    const key = emptyKey();
    key.sequence = String.fromCharCode(b);

    // Backspace: DEL (\x7f) 或 BS (\x08)
    if (b === 0x7f || b === 0x08) {
      key.backspace = true;
      keys.push(key);
      i++;
      continue;
    }

    // Enter
    if (b === 0x0d || b === 0x0a) {
      key.return = true;
      keys.push(key);
      i++;
      continue;
    }

    // Tab
    if (b === 0x09) {
      key.tab = true;
      keys.push(key);
      i++;
      continue;
    }

    // Ctrl+A … Ctrl+Z  (\x01–\x1a)
    if (b >= 0x01 && b <= 0x1a) {
      key.ctrl = true;
      key.char = String.fromCharCode(b + 0x60); // → 'a'–'z'
      keys.push(key);
      i++;
      continue;
    }

    // Ctrl+\ Ctrl+] Ctrl+^ Ctrl+_  (\x1c–\x1f)
    if (b >= 0x1c && b <= 0x1f) {
      key.ctrl = true;
      key.char = String.fromCharCode(b + 0x40);
      keys.push(key);
      i++;
      continue;
    }

    // Space
    if (b === 0x20) {
      key.space = true;
      key.char = ' ';
      keys.push(key);
      i++;
      continue;
    }

    // ASCII 可打印字符
    if (b >= 0x21 && b <= 0x7e) {
      key.char = String.fromCharCode(b);
      keys.push(key);
      i++;
      continue;
    }

    // UTF-8 多字节字符 — 读完整个码点
    if (b >= 0x80) {
      // 判断 UTF-8 字节数
      const byteCount =
        b >= 0xf0 ? 4 :
        b >= 0xe0 ? 3 :
        b >= 0xc0 ? 2 : 1;
      const charBuf = buf.slice(i, i + byteCount);
      key.char = charBuf.toString('utf8');
      key.sequence = charBuf.toString('binary');
      keys.push(key);
      i += byteCount;
      continue;
    }

    // 无法识别，跳过
    i++;
  }

  return keys;
}

// ── 全局 stdin 监听 (单例) ────────────────────────────────────────────────────
// 只注册一次 'data' 监听器，所有 useRawInput 实例共享，避免重复触发。

type KeyListener = (key: RawKey) => void;
const listeners = new Set<KeyListener>();
let attached = false;

function ensureAttached() {
  if (attached) return;
  attached = true;

  // Ink 会在某处调用 process.stdin.setRawMode(true)。
  // 我们作为保险也显式设置，确保即使 Ink 未激活也能工作。
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  process.stdin.on('data', (chunk: Buffer | string) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string, 'binary');
    const keys = parseBuffer(buf);
    for (const key of keys) {
      for (const listener of listeners) {
        listener(key);
      }
    }
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useRawInput(handler, isActive?)
 *
 * 直接从 stdin 字节流解析键盘事件，行为等价于 C 语言的 termios 原始模式读取。
 * 与 Ink 的 useInput 完全独立，不受 Ink/readline 版本影响。
 */
export function useRawInput(
  handler: (key: RawKey) => void,
  isActive = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!isActive) return;

    ensureAttached();

    const listener: KeyListener = (key) => handlerRef.current(key);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [isActive]);
}
