/**
 * Lightweight structured logger for RisuToki.
 *
 * Centralises console output behind a minimal API so that:
 * 1. Every log line carries a `[module]` prefix.
 * 2. An optional `onWarn`/`onError` callback can forward messages to the UI
 *    (e.g. status bar) without coupling modules to the DOM layer.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LoggerCallbacks {
  onWarn?: (module: string, message: string) => void;
  onError?: (module: string, message: string) => void;
}

let _callbacks: LoggerCallbacks = {};

/** Register global UI callbacks (typically called once at app init). */
export function setLoggerCallbacks(cb: LoggerCallbacks): void {
  _callbacks = cb;
}

/** Create a module-scoped logger. */
export function createLogger(module: string) {
  const prefix = `[${module}]`;
  return {
    info(message: string, ...args: unknown[]): void {
      console.log(prefix, message, ...args);
    },
    warn(message: string, ...args: unknown[]): void {
      console.warn(prefix, message, ...args);
      _callbacks.onWarn?.(module, message);
    },
    error(message: string, ...args: unknown[]): void {
      console.error(prefix, message, ...args);
      _callbacks.onError?.(module, message);
    },
  };
}
