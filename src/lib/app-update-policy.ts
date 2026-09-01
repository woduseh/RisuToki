export interface StableVersion {
  major: number;
  minor: number;
  patch: number;
}

export function parseStableVersion(value: string): StableVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;

  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

export function normalizeStableVersion(value: string): string | null {
  const parsed = parseStableVersion(value);
  return parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : null;
}

export function isNewerStableVersion(latest: string, current: string): boolean {
  const latestVersion = parseStableVersion(latest);
  const currentVersion = parseStableVersion(current);
  if (!latestVersion || !currentVersion) return false;

  const latestParts = [latestVersion.major, latestVersion.minor, latestVersion.patch];
  const currentParts = [currentVersion.major, currentVersion.minor, currentVersion.patch];
  for (let index = 0; index < latestParts.length; index += 1) {
    if (latestParts[index] !== currentParts[index]) return latestParts[index] > currentParts[index];
  }
  return false;
}

export function shouldPromptForUpdate(input: {
  latestVersion: string;
  currentVersion: string;
  lastPromptedVersion: string | null;
}): boolean {
  const latestVersion = normalizeStableVersion(input.latestVersion);
  if (!latestVersion || !isNewerStableVersion(latestVersion, input.currentVersion)) return false;
  return normalizeStableVersion(input.lastPromptedVersion ?? '') !== latestVersion;
}
