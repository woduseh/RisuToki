// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkForAppUpdates,
  fetchLatestReleaseVersion,
  type AppUpdateManagerDeps,
  type InstalledUpdateClient,
} from './app-update-manager';

function createFixture(overrides: Partial<AppUpdateManagerDeps> = {}) {
  let promptedVersion: string | null = null;
  const updater: InstalledUpdateClient = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    checkForUpdates: vi.fn(async () => ({ isUpdateAvailable: true, updateInfo: { version: '3.1.0' } })),
    downloadUpdate: vi.fn(async () => ['RisuToki.Setup.3.1.0.exe']),
  };
  const deps: AppUpdateManagerDeps = {
    isPackaged: true,
    isPortable: false,
    currentVersion: '3.0.1',
    promptStore: {
      read: vi.fn(() => promptedVersion),
      write: vi.fn((version) => {
        promptedVersion = version;
      }),
    },
    installedUpdater: updater,
    fetchLatestReleaseVersion: vi.fn(async () => '3.1.0'),
    confirmInstalledUpdate: vi.fn(async () => false),
    confirmPortableUpdate: vi.fn(async () => false),
    notifyInstalledUpdateReady: vi.fn(async () => undefined),
    notifyInstalledUpdateError: vi.fn(),
    openLatestRelease: vi.fn(async () => undefined),
    logError: vi.fn(),
    ...overrides,
  };
  return { deps, updater };
}

describe('application update manager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing outside a packaged build', async () => {
    const { deps, updater } = createFixture({ isPackaged: false });
    await checkForAppUpdates(deps);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(deps.fetchLatestReleaseVersion).not.toHaveBeenCalled();
  });

  it('opens only the latest release page when a portable user accepts', async () => {
    const { deps, updater } = createFixture({
      isPortable: true,
      confirmPortableUpdate: vi.fn(async () => true),
    });
    await checkForAppUpdates(deps);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(deps.promptStore.write).toHaveBeenCalledWith('3.1.0');
    expect(deps.openLatestRelease).toHaveBeenCalledOnce();
  });

  it('does not repeat a portable prompt for the same latest release', async () => {
    const { deps } = createFixture({
      isPortable: true,
      promptStore: { read: () => '3.1.0', write: vi.fn() },
    });
    await checkForAppUpdates(deps);
    expect(deps.confirmPortableUpdate).not.toHaveBeenCalled();
  });

  it('does not download an installed update until the user accepts', async () => {
    const { deps, updater } = createFixture();
    await checkForAppUpdates(deps);
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('downloads an accepted installed update and schedules it for normal app exit', async () => {
    const { deps, updater } = createFixture({ confirmInstalledUpdate: vi.fn(async () => true) });
    await checkForAppUpdates(deps);
    expect(updater.downloadUpdate).toHaveBeenCalledOnce();
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(deps.notifyInstalledUpdateReady).toHaveBeenCalledWith('3.1.0');
  });

  it('keeps automatic installation disabled when the download fails', async () => {
    const { deps, updater } = createFixture({ confirmInstalledUpdate: vi.fn(async () => true) });
    vi.mocked(updater.downloadUpdate).mockRejectedValueOnce(new Error('network unavailable'));
    await checkForAppUpdates(deps);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(deps.notifyInstalledUpdateError).toHaveBeenCalledWith('network unavailable');
  });
});

describe('latest GitHub release lookup', () => {
  it('returns a normalized stable tag', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ tag_name: 'v3.1.0' }), { status: 200 }));
    await expect(fetchLatestReleaseVersion(fetchImpl as typeof fetch)).resolves.toBe('3.1.0');
  });

  it('rejects malformed or prerelease latest tags', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ tag_name: 'v3.1.0-beta.1' }), { status: 200 }));
    await expect(fetchLatestReleaseVersion(fetchImpl as typeof fetch)).rejects.toThrow(
      'Unsupported latest release tag',
    );
  });
});
