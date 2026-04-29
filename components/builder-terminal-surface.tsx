'use client';

import '@xterm/xterm/css/xterm.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type XTermTerminal = import('@xterm/xterm').Terminal;
type XTermFitAddon = import('@xterm/addon-fit').FitAddon;

const TERMINAL_THEME = {
  background: '#09090d',
  foreground: '#d7dde7',
  cursor: '#7dd3fc',
  cursorAccent: '#09090d',
  black: '#151821',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#67e8f9',
  white: '#e5e7eb',
  brightBlack: '#52525b',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#a5f3fc',
  brightWhite: '#f8fafc',
  selectionBackground: '#1f2937',
} satisfies import('@xterm/xterm').ITheme;

function normalizeTerminalText(value: string) {
  return value.replace(/\r?\n/g, '\r\n');
}

function buildTerminalFrame(value: string) {
  return `\u001b[2J\u001b[3J\u001b[H${value}`;
}

function normalizeTerminalPaste(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

function isPrintableTerminalCharacter(value: string) {
  return value >= ' ' && value !== '\u007f';
}

type BuilderTerminalSurfaceProps = {
  active?: boolean;
  buffer: string;
  className?: string;
  cwd?: string;
  input?: string;
  isBusy?: boolean;
  readOnly?: boolean;
  onHistoryNavigate?: (direction: 'up' | 'down') => void;
  onInputChange?: (value: string) => void;
  onStop?: () => void;
  onSubmit?: (value?: string) => void;
  promptLabel?: string;
};

export function BuilderTerminalSurface({
  active = true,
  buffer,
  className,
  cwd,
  input = '',
  isBusy = false,
  readOnly = false,
  onHistoryNavigate,
  onInputChange,
  onStop,
  onSubmit,
  promptLabel = 'indexblue',
}: BuilderTerminalSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTermTerminal | null>(null);
  const fitAddonRef = useRef<XTermFitAddon | null>(null);
  const renderedValueRef = useRef('');
  const [isTerminalReady, setIsTerminalReady] = useState(false);

  const prompt = useMemo(() => {
    const resolvedCwd = cwd?.trim() || '/';
    return `${promptLabel}:${resolvedCwd}$`;
  }, [cwd, promptLabel]);

  const renderedBuffer = useMemo(() => {
    if (readOnly || isBusy) {
      return buffer;
    }

    const prefix = buffer.length > 0 && !buffer.endsWith('\n') ? '\n' : '';
    return `${buffer}${prefix}${prompt} ${input}`;
  }, [buffer, input, isBusy, prompt, readOnly]);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let animationFrameId: number | null = null;

    const scheduleFit = () => {
      if (disposed || !containerRef.current || !fitAddonRef.current) return;
      if (containerRef.current.clientWidth <= 0 || containerRef.current.clientHeight <= 0) return;

      if (animationFrameId != null) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        if (disposed || !fitAddonRef.current || !containerRef.current) return;
        if (containerRef.current.clientWidth <= 0 || containerRef.current.clientHeight <= 0) return;

        try {
          fitAddonRef.current.fit();
        } catch {
          // xterm can briefly report incomplete layout info during mount.
        }
      });
    };

    const boot = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (disposed || !containerRef.current) return;

      const terminal = new Terminal({
        allowTransparency: true,
        convertEol: false,
        cursorBlink: true,
        cursorStyle: 'block',
        disableStdin: readOnly,
        fontFamily: 'Menlo, Monaco, "Cascadia Code", "SFMono-Regular", monospace',
        fontSize: 12,
        lineHeight: 1.5,
        macOptionIsMeta: true,
        scrollback: 5000,
        theme: TERMINAL_THEME,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      setIsTerminalReady(true);

      scheduleFit();

      resizeObserver = new ResizeObserver(() => {
        scheduleFit();
      });

      resizeObserver.observe(containerRef.current);
    };

    void boot();

    return () => {
      disposed = true;
      if (animationFrameId != null) {
        cancelAnimationFrame(animationFrameId);
      }
      resizeObserver?.disconnect();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      renderedValueRef.current = '';
      setIsTerminalReady(false);
    };
  }, [readOnly]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !isTerminalReady) return;

    terminal.options.disableStdin = readOnly || isBusy;

    const serialized = normalizeTerminalText(renderedBuffer);
    if (renderedValueRef.current === serialized) {
      if (active) {
        terminal.focus();
      }
      return;
    }

    renderedValueRef.current = serialized;
    terminal.write(buildTerminalFrame(serialized));
    requestAnimationFrame(() => {
      terminal.scrollToBottom();
    });

    if (active) {
      terminal.focus();
    }
  }, [active, isBusy, isTerminalReady, readOnly, renderedBuffer]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !isTerminalReady || readOnly) return;

    const disposable = terminal.onData((chunk) => {
      if (chunk === '\u0003') {
        if (isBusy) {
          onStop?.();
        } else {
          onInputChange?.('');
        }
        return;
      }

      if (chunk === '\x1b[A') {
        onHistoryNavigate?.('up');
        return;
      }

      if (chunk === '\x1b[B') {
        onHistoryNavigate?.('down');
        return;
      }

      if (chunk === '\r') {
        if (!isBusy) {
          onSubmit?.(input);
        }
        return;
      }

      if (chunk === '\u007f') {
        if (!isBusy && input.length > 0) {
          onInputChange?.(input.slice(0, -1));
        }
        return;
      }

      if (isBusy) return;

      if (chunk.length > 1 && /[\r\n]/.test(chunk)) {
        onInputChange?.(`${input}${normalizeTerminalPaste(chunk)}`);
        return;
      }

      let nextValue = input;
      for (const character of chunk) {
        if (character === '\r' || character === '\n') {
          onSubmit?.(nextValue);
          return;
        }

        if (character === '\u007f') {
          nextValue = nextValue.slice(0, -1);
          continue;
        }

        if (isPrintableTerminalCharacter(character)) {
          nextValue += character;
        }
      }

      if (nextValue !== input) {
        onInputChange?.(nextValue);
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [input, isBusy, isTerminalReady, onHistoryNavigate, onInputChange, onStop, onSubmit, readOnly]);

  return <div ref={containerRef} className={cn('h-full w-full min-w-0', className)} />;
}
