import { describe, expect, it } from 'vitest';
import { TerminalSessionContext, isCopilotLaunchCommand } from './terminal-session-context';

describe('TerminalSessionContext', () => {
  describe('cwd tracking', () => {
    it('starts with null cwd when no initial cwd provided', () => {
      const ctx = new TerminalSessionContext();
      expect(ctx.cwd).toBeNull();
    });

    it('starts with initial cwd when provided', () => {
      const ctx = new TerminalSessionContext('C:\\Users');
      expect(ctx.cwd).toBe('C:\\Users');
    });

    it('tracks simple cd command', () => {
      const ctx = new TerminalSessionContext('C:\\');
      ctx.feedInput('cd C:\\repo\r');
      expect(ctx.cwd).toBe('C:\\repo');
    });

    it('tracks cd with quoted path', () => {
      const ctx = new TerminalSessionContext('C:\\');
      ctx.feedInput('cd "C:\\My Documents\\project"\r');
      expect(ctx.cwd).toBe('C:\\My Documents\\project');
    });

    it('tracks cd with single-quoted path', () => {
      const ctx = new TerminalSessionContext('C:\\');
      ctx.feedInput("cd 'C:\\My Folder'\r");
      expect(ctx.cwd).toBe('C:\\My Folder');
    });

    it('tracks Set-Location command', () => {
      const ctx = new TerminalSessionContext('C:\\');
      ctx.feedInput('Set-Location C:\\Users\\dev\r');
      expect(ctx.cwd).toBe('C:\\Users\\dev');
    });

    it('tracks Set-Location with -Path parameter', () => {
      const ctx = new TerminalSessionContext('C:\\');
      ctx.feedInput('Set-Location -Path C:\\temp\r');
      expect(ctx.cwd).toBe('C:\\temp');
    });

    it('tracks Set-Location case-insensitively', () => {
      const ctx = new TerminalSessionContext('C:\\');
      ctx.feedInput('set-location C:\\temp\r');
      expect(ctx.cwd).toBe('C:\\temp');
    });

    it('tracks pushd command', () => {
      const ctx = new TerminalSessionContext('C:\\');
      ctx.feedInput('pushd C:\\temp\r');
      expect(ctx.cwd).toBe('C:\\temp');
    });

    it('tracks popd restores previous directory', () => {
      const ctx = new TerminalSessionContext('C:\\Users');
      ctx.feedInput('pushd C:\\temp\r');
      expect(ctx.cwd).toBe('C:\\temp');
      ctx.feedInput('popd\r');
      expect(ctx.cwd).toBe('C:\\Users');
    });

    it('popd with empty stack leaves cwd unchanged', () => {
      const ctx = new TerminalSessionContext('C:\\Users');
      ctx.feedInput('popd\r');
      expect(ctx.cwd).toBe('C:\\Users');
    });

    it('tracks nested pushd/popd', () => {
      const ctx = new TerminalSessionContext('C:\\');
      ctx.feedInput('pushd C:\\a\r');
      ctx.feedInput('pushd C:\\b\r');
      expect(ctx.cwd).toBe('C:\\b');
      ctx.feedInput('popd\r');
      expect(ctx.cwd).toBe('C:\\a');
      ctx.feedInput('popd\r');
      expect(ctx.cwd).toBe('C:\\');
    });

    it('non-cwd commands leave cwd unchanged', () => {
      const ctx = new TerminalSessionContext('C:\\Users');
      ctx.feedInput('echo hello\r');
      expect(ctx.cwd).toBe('C:\\Users');
      ctx.feedInput('git status\r');
      expect(ctx.cwd).toBe('C:\\Users');
      ctx.feedInput('npm install\r');
      expect(ctx.cwd).toBe('C:\\Users');
    });

    it('resolves relative cd path against current cwd', () => {
      const ctx = new TerminalSessionContext('C:\\Users\\dev');
      ctx.feedInput('cd projects\r');
      expect(ctx.cwd).toBe('C:\\Users\\dev\\projects');
    });

    it('resolves cd .. to parent directory', () => {
      const ctx = new TerminalSessionContext('C:\\Users\\dev\\projects');
      ctx.feedInput('cd ..\r');
      expect(ctx.cwd).toBe('C:\\Users\\dev');
    });

    it('resolves chained cd ../.. correctly', () => {
      const ctx = new TerminalSessionContext('C:\\Users\\dev\\projects');
      ctx.feedInput('cd ../..\r');
      expect(ctx.cwd).toBe('C:\\Users');
    });

    it('handles cd with forward slashes', () => {
      const ctx = new TerminalSessionContext('C:\\');
      ctx.feedInput('cd C:/Users/dev\r');
      expect(ctx.cwd).toBe('C:\\Users\\dev');
    });

    it('cd without argument leaves cwd unchanged', () => {
      const ctx = new TerminalSessionContext('C:\\Users');
      ctx.feedInput('cd\r');
      expect(ctx.cwd).toBe('C:\\Users');
    });
  });

  describe('line buffer', () => {
    it('accumulates typed characters', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('hel');
      ctx.feedInput('lo');
      expect(ctx.lineBuffer).toBe('hello');
    });

    it('clears on carriage return', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('hello\r');
      expect(ctx.lineBuffer).toBe('');
    });

    it('handles backspace', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('helo\x7f');
      expect(ctx.lineBuffer).toBe('hel');
    });

    it('backspace on empty line does nothing', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('\x7f');
      expect(ctx.lineBuffer).toBe('');
    });

    it('filters arrow-key escape sequences from line buffer', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('hello');
      // Up arrow: ESC [ A
      ctx.feedInput('\x1b[A');
      expect(ctx.lineBuffer).toBe('hello');
    });

    it('filters down/left/right arrow sequences', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('abc');
      ctx.feedInput('\x1b[B'); // down
      ctx.feedInput('\x1b[C'); // right
      ctx.feedInput('\x1b[D'); // left
      expect(ctx.lineBuffer).toBe('abc');
    });

    it('filters CSI sequences with parameters (e.g. cursor movement)', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('hi');
      // CSI 3 ~ = Delete key
      ctx.feedInput('\x1b[3~');
      expect(ctx.lineBuffer).toBe('hi');
    });

    it('filters SS3 sequences (ESC O)', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('test');
      // SS3 P = F1 in some terminals
      ctx.feedInput('\x1bOP');
      expect(ctx.lineBuffer).toBe('test');
    });

    it('filters ESC + single char (Alt-key sequences)', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('word');
      // Alt+b = ESC b (backward-word in many shells)
      ctx.feedInput('\x1bb');
      expect(ctx.lineBuffer).toBe('word');
    });

    it('still works normally after escape sequence ends', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('ab');
      ctx.feedInput('\x1b[A'); // up arrow
      ctx.feedInput('cd');
      expect(ctx.lineBuffer).toBe('abcd');
    });
  });

  describe('command records', () => {
    it('records completed commands', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('echo hello\r');
      expect(ctx.completedCommands).toHaveLength(1);
      expect(ctx.completedCommands[0].line).toBe('echo hello');
    });

    it('records multiple commands in order', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('cd C:\\repo\r');
      ctx.feedInput('git status\r');
      expect(ctx.completedCommands).toHaveLength(2);
      expect(ctx.completedCommands[0].line).toBe('cd C:\\repo');
      expect(ctx.completedCommands[1].line).toBe('git status');
    });

    it('does not record empty commands', () => {
      const ctx = new TerminalSessionContext();
      ctx.feedInput('\r');
      expect(ctx.completedCommands).toHaveLength(0);
    });

    it('timestamps completed commands', () => {
      const before = Date.now();
      const ctx = new TerminalSessionContext();
      ctx.feedInput('ls\r');
      const after = Date.now();
      expect(ctx.completedCommands[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(ctx.completedCommands[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('command history cap', () => {
    it('caps completed commands at 200 entries', () => {
      const ctx = new TerminalSessionContext();
      for (let i = 0; i < 210; i++) {
        ctx.feedInput(`cmd${i}\r`);
      }
      expect(ctx.completedCommands).toHaveLength(200);
      // The oldest 10 should have been evicted
      expect(ctx.completedCommands[0].line).toBe('cmd10');
      expect(ctx.completedCommands[199].line).toBe('cmd209');
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const ctx = new TerminalSessionContext('C:\\Users');
      ctx.feedInput('cd C:\\temp\r');
      ctx.feedInput('partial');
      ctx.reset();
      expect(ctx.cwd).toBeNull();
      expect(ctx.lineBuffer).toBe('');
      expect(ctx.completedCommands).toHaveLength(0);
    });

    it('reset with new initial cwd', () => {
      const ctx = new TerminalSessionContext('C:\\old');
      ctx.feedInput('cd C:\\temp\r');
      ctx.reset('C:\\new');
      expect(ctx.cwd).toBe('C:\\new');
    });
    it('reset clears in-progress escape state', () => {
      const ctx = new TerminalSessionContext('C:\\Users');
      // Start an ESC sequence but don't finish it
      ctx.feedInput('\x1b');
      ctx.reset('C:\\new');
      // After reset, typing should work normally (not consumed as ESC seq)
      ctx.feedInput('hello');
      expect(ctx.lineBuffer).toBe('hello');
    });
  });

  describe('isCopilotLaunchCommand', () => {
    it('matches bare "copilot"', () => {
      expect(isCopilotLaunchCommand('copilot')).toBe(true);
    });

    it('matches "copilot --experimental"', () => {
      expect(isCopilotLaunchCommand('copilot --experimental')).toBe(true);
    });

    it('matches "copilot.ps1"', () => {
      expect(isCopilotLaunchCommand('copilot.ps1')).toBe(true);
    });

    it('matches "copilot.cmd"', () => {
      expect(isCopilotLaunchCommand('copilot.cmd')).toBe(true);
    });

    it('matches with arbitrary flags', () => {
      expect(isCopilotLaunchCommand('copilot.ps1 --experimental --verbose')).toBe(true);
    });

    it('matches with leading/trailing whitespace', () => {
      expect(isCopilotLaunchCommand('  copilot  ')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isCopilotLaunchCommand('COPILOT')).toBe(true);
      expect(isCopilotLaunchCommand('Copilot.PS1')).toBe(true);
      expect(isCopilotLaunchCommand('COPILOT.CMD')).toBe(true);
    });

    it('does not match copilot-other-tool', () => {
      expect(isCopilotLaunchCommand('copilot-setup')).toBe(false);
    });

    it('does not match commands containing copilot as substring', () => {
      expect(isCopilotLaunchCommand('npm run copilot')).toBe(false);
    });

    it('does not match empty string', () => {
      expect(isCopilotLaunchCommand('')).toBe(false);
    });

    it('does not match whitespace only', () => {
      expect(isCopilotLaunchCommand('   ')).toBe(false);
    });

    it('does not match copilot.exe or other extensions', () => {
      expect(isCopilotLaunchCommand('copilot.exe')).toBe(false);
      expect(isCopilotLaunchCommand('copilot.bat')).toBe(false);
    });
  });
});
