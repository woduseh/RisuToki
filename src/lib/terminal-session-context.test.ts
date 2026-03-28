import { describe, expect, it } from 'vitest';
import { TerminalSessionContext } from './terminal-session-context';

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
  });
});
