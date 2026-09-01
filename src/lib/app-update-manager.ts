import * as fs from 'fs';
import * as path from 'path';

import { normalizeStableVersion, shouldPromptForUpdate } from './app-update-policy';

export const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/woduseh/RisuToki/releases/latest';
export const LATEST_RELEASE_PAGE_URL = 'https://github.com/woduseh/RisuToki/releases/latest';

interface UpdateCheckResult {
  isUpdateAvailable: boolean;
  updateInfo: { version: string };
}

export interface InstalledUpdateClient {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  checkForUpdates(): Promise<UpdateCheckResult | null>;
  downloadUpdate(): Promise<string[]>;
}

export interface UpdatePromptStore {
  read(): string | null;
  write(version: string): void;
}

export interface AppUpdateManagerDeps {
  isPackaged: boolean;
  isPortable: boolean;
  currentVersion: string;
  promptStore: UpdatePromptStore;
  installedUpdater: InstalledUpdateClient;
  fetchLatestReleaseVersion(): Promise<string>;
  confirmInstalledUpdate(latestVersion: string, currentVersion: string): Promise<boolean>;
  confirmPortableUpdate(latestVersion: string, currentVersion: string): Promise<boolean>;
  notifyInstalledUpdateReady(latestVersion: string): Promise<void>;
  notifyInstalledUpdateError(message: string): void;
  openLatestRelease(): Promise<void>;
  logError(message: string, error: unknown): void;
}

const UPDATE_PROMPT_STATE_FILE = 'update-prompt-state.json';

export function createUpdatePromptStore(userDataPath: string): UpdatePromptStore {
  const statePath = path.join(userDataPath, UPDATE_PROMPT_STATE_FILE);
  return {
    read() {
      try {
        const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { lastPromptedVersion?: unknown };
        return typeof parsed.lastPromptedVersion === 'string' ? parsed.lastPromptedVersion : null;
      } catch {
        return null;
      }
    },
    write(version) {
      try {
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        fs.writeFileSync(statePath, `${JSON.stringify({ lastPromptedVersion: version }, null, 2)}\n`, 'utf8');
      } catch (error) {
        console.warn('[update] Failed to persist update prompt state:', error);
      }
    },
  };
}

export async function fetchLatestReleaseVersion(
  fetchImpl: typeof fetch,
  apiUrl = LATEST_RELEASE_API_URL,
): Promise<string> {
  const response = await fetchImpl(apiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'RisuToki-update-checker',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub latest release request failed (${response.status})`);

  const payload = (await response.json()) as { tag_name?: unknown };
  if (typeof payload.tag_name !== 'string') throw new Error('GitHub latest release response has no tag_name');
  const version = normalizeStableVersion(payload.tag_name);
  if (!version) throw new Error(`Unsupported latest release tag: ${payload.tag_name}`);
  return version;
}

async function checkPortableUpdate(deps: AppUpdateManagerDeps): Promise<void> {
  const latestVersion = await deps.fetchLatestReleaseVersion();
  if (
    !shouldPromptForUpdate({
      latestVersion,
      currentVersion: deps.currentVersion,
      lastPromptedVersion: deps.promptStore.read(),
    })
  ) {
    return;
  }

  deps.promptStore.write(latestVersion);
  if (await deps.confirmPortableUpdate(latestVersion, deps.currentVersion)) {
    await deps.openLatestRelease();
  }
}

async function checkInstalledUpdate(deps: AppUpdateManagerDeps): Promise<void> {
  const updater = deps.installedUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;

  const result = await updater.checkForUpdates();
  if (
    !result?.isUpdateAvailable ||
    !shouldPromptForUpdate({
      latestVersion: result.updateInfo.version,
      currentVersion: deps.currentVersion,
      lastPromptedVersion: deps.promptStore.read(),
    })
  ) {
    return;
  }

  const latestVersion = normalizeStableVersion(result.updateInfo.version)!;
  deps.promptStore.write(latestVersion);
  if (!(await deps.confirmInstalledUpdate(latestVersion, deps.currentVersion))) return;

  try {
    await updater.downloadUpdate();
    updater.autoInstallOnAppQuit = true;
    await deps.notifyInstalledUpdateReady(latestVersion);
  } catch (error) {
    updater.autoInstallOnAppQuit = false;
    deps.logError('Failed to download application update', error);
    deps.notifyInstalledUpdateError(error instanceof Error ? error.message : String(error));
  }
}

export async function checkForAppUpdates(deps: AppUpdateManagerDeps): Promise<void> {
  if (!deps.isPackaged) return;
  try {
    if (deps.isPortable) {
      await checkPortableUpdate(deps);
    } else {
      await checkInstalledUpdate(deps);
    }
  } catch (error) {
    deps.logError('Application update check failed', error);
  }
}
