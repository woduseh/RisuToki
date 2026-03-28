/**
 * Terminal session context tracker.
 *
 * Consumes raw human terminal input (xterm onData) and maintains:
 *  - current line buffer (what the user is typing)
 *  - resolved terminal cwd (best-effort, from cd/Set-Location/pushd/popd)
 *  - completed command records
 *
 * This is a renderer-side heuristic tracker — it does NOT interact with the
 * actual PTY process.  The real shell cwd may diverge if the user runs
 * scripts that change directories internally.
 */

import { resolve, normalize } from 'path';

/** A record of a completed terminal command line. */
export interface CompletedCommand {
  /** The raw command line text (trimmed). */
  line: string;
  /** Unix-epoch ms when the command was submitted. */
  timestamp: number;
}

// Matches: cd <path>, cd "<path>", cd '<path>'
// Also handles chdir as an alias.
const CD_RE = /^(?:cd|chdir)\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/i;

// cd with no argument (just "cd" or "cd  ")
const CD_BARE_RE = /^(?:cd|chdir)\s*$/i;

// Matches: Set-Location [-Path] <path>
const SET_LOCATION_RE = /^set-location\s+(?:-(?:path|literalpath)\s+)?(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/i;

// Matches: pushd <path>
const PUSHD_RE = /^pushd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/i;

// Matches: popd (no args)
const POPD_RE = /^popd\s*$/i;

/** Extract the first non-undefined capture group from a regex match. */
function extractPath(match: RegExpMatchArray): string {
  return (match[1] ?? match[2] ?? match[3] ?? '').replace(/\//g, '\\');
}

export class TerminalSessionContext {
  private _cwd: string | null;
  private _lineBuffer = '';
  private _completedCommands: CompletedCommand[] = [];
  private _dirStack: string[] = [];

  constructor(initialCwd?: string) {
    this._cwd = initialCwd ?? null;
  }

  /** Current best-effort terminal working directory, or null if unknown. */
  get cwd(): string | null {
    return this._cwd;
  }

  /** Characters the user has typed on the current (uncommitted) line. */
  get lineBuffer(): string {
    return this._lineBuffer;
  }

  /** All commands that have been submitted (Enter pressed). */
  get completedCommands(): readonly CompletedCommand[] {
    return this._completedCommands;
  }

  /**
   * Feed raw terminal input data (from xterm onData).
   * Handles printable characters, backspace (\x7f), and Enter (\r).
   */
  feedInput(data: string): void {
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        this._commitLine();
      } else if (ch === '\x7f' || ch === '\b') {
        // Backspace
        if (this._lineBuffer.length > 0) {
          this._lineBuffer = this._lineBuffer.slice(0, -1);
        }
      } else if (ch.charCodeAt(0) >= 32) {
        // Printable character
        this._lineBuffer += ch;
      }
      // Ignore other control characters (arrows, escape sequences, etc.)
    }
  }

  /** Reset all tracked state. Optionally set a new initial cwd. */
  reset(initialCwd?: string): void {
    this._cwd = initialCwd ?? null;
    this._lineBuffer = '';
    this._completedCommands = [];
    this._dirStack = [];
  }

  // ---- private ----

  private _commitLine(): void {
    const line = this._lineBuffer.trim();
    this._lineBuffer = '';

    if (line.length === 0) return;

    this._completedCommands.push({ line, timestamp: Date.now() });
    this._tryUpdateCwd(line);
  }

  private _tryUpdateCwd(line: string): void {
    // cd / chdir (bare — no argument)
    if (CD_BARE_RE.test(line)) return;

    // cd / chdir <path>
    let m = line.match(CD_RE);
    if (m) {
      this._setCwd(extractPath(m));
      return;
    }

    // Set-Location [-Path] <path>
    m = line.match(SET_LOCATION_RE);
    if (m) {
      this._setCwd(extractPath(m));
      return;
    }

    // pushd <path>
    m = line.match(PUSHD_RE);
    if (m) {
      if (this._cwd !== null) {
        this._dirStack.push(this._cwd);
      }
      this._setCwd(extractPath(m));
      return;
    }

    // popd
    if (POPD_RE.test(line)) {
      const prev = this._dirStack.pop();
      if (prev !== undefined) {
        this._cwd = prev;
      }
    }
  }

  private _setCwd(rawPath: string): void {
    if (!rawPath) return;
    const normalized = rawPath.replace(/\//g, '\\');

    // Absolute path (e.g. C:\..., \\server\...)
    if (/^[A-Za-z]:[\\/]/.test(normalized) || normalized.startsWith('\\\\')) {
      this._cwd = normalize(normalized);
    } else if (this._cwd) {
      // Relative path — resolve against current cwd
      this._cwd = resolve(this._cwd, normalized);
    }
    // If cwd is null and path is relative, we can't resolve — leave null
  }
}
