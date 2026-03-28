import fs from 'node:fs';
import path from 'node:path';

const PROJECT_SKILL_DIRS = ['.claude', '.gemini', '.github'] as const;

export type SkillLinkStatus = 'created' | 'repaired' | 'ok';

export interface ProjectSkillLinkSpec {
  readonly linkPath: string;
  readonly relativeTarget: string;
  readonly sourcePath: string;
}

export interface SkillLinkResult extends ProjectSkillLinkSpec {
  readonly status: SkillLinkStatus;
}

export interface EnsureProjectSkillLinksOptions {
  readonly platform?: NodeJS.Platform | string;
}

function normalizeRelativeTarget(value: string) {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

function readNormalizedLinkTarget(linkPath: string) {
  return normalizeRelativeTarget(fs.readlinkSync(linkPath));
}

function isExpectedPlaceholderFile(filePath: string, expectedRelativeTarget: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  return normalizeRelativeTarget(content) === normalizeRelativeTarget(expectedRelativeTarget);
}

function isPreferredDirectoryLink(
  linkPath: string,
  sourcePath: string,
  relativeTarget: string,
  platform: NodeJS.Platform | string,
) {
  const stat = fs.lstatSync(linkPath);
  if (!stat.isSymbolicLink()) {
    return false;
  }

  if (fs.realpathSync.native(linkPath) !== fs.realpathSync.native(sourcePath)) {
    return false;
  }

  if (platform !== 'win32') {
    return true;
  }

  const normalizedLinkTarget = readNormalizedLinkTarget(linkPath);
  return (
    normalizedLinkTarget === normalizeRelativeTarget(relativeTarget) ||
    normalizedLinkTarget === normalizeRelativeTarget(sourcePath)
  );
}

function createDirectoryLink(
  linkPath: string,
  sourcePath: string,
  relativeTarget: string,
  platform: NodeJS.Platform | string,
) {
  if (platform === 'win32') {
    try {
      fs.symlinkSync(relativeTarget, linkPath, 'dir');
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EACCES' && code !== 'EPERM' && code !== 'UNKNOWN') {
        throw error;
      }
    }

    fs.symlinkSync(sourcePath, linkPath, 'junction');
    return;
  }

  fs.symlinkSync(relativeTarget, linkPath, 'dir');
}

function hasSkillDirectory(sourcePath: string) {
  return fs.existsSync(sourcePath) && fs.statSync(sourcePath).isDirectory();
}

function repairProjectSkillLink(spec: ProjectSkillLinkSpec, platform: NodeJS.Platform | string): SkillLinkStatus {
  fs.mkdirSync(path.dirname(spec.linkPath), { recursive: true });

  if (!fs.existsSync(spec.linkPath)) {
    createDirectoryLink(spec.linkPath, spec.sourcePath, spec.relativeTarget, platform);
    return 'created';
  }

  if (isPreferredDirectoryLink(spec.linkPath, spec.sourcePath, spec.relativeTarget, platform)) {
    return 'ok';
  }

  const stat = fs.lstatSync(spec.linkPath);
  if (stat.isSymbolicLink()) {
    fs.rmSync(spec.linkPath, { recursive: true, force: true });
    createDirectoryLink(spec.linkPath, spec.sourcePath, spec.relativeTarget, platform);
    return 'repaired';
  }

  if (stat.isFile()) {
    if (!isExpectedPlaceholderFile(spec.linkPath, spec.relativeTarget)) {
      throw new Error(`Refusing to replace unexpected file at ${spec.linkPath}`);
    }

    fs.rmSync(spec.linkPath, { force: true });
    createDirectoryLink(spec.linkPath, spec.sourcePath, spec.relativeTarget, platform);
    return 'repaired';
  }

  if (stat.isDirectory()) {
    throw new Error(`Refusing to replace existing directory at ${spec.linkPath}`);
  }

  throw new Error(`Unsupported filesystem entry at ${spec.linkPath}`);
}

export function getProjectSkillLinkSpecs(projectRoot: string): ProjectSkillLinkSpec[] {
  const sourcePath = path.join(projectRoot, 'skills');

  return PROJECT_SKILL_DIRS.map((projectSkillDir) => {
    const linkPath = path.join(projectRoot, projectSkillDir, 'skills');
    return {
      linkPath,
      relativeTarget: path.relative(path.dirname(linkPath), sourcePath),
      sourcePath,
    };
  });
}

export function ensureProjectSkillLinks(
  projectRoot: string,
  options: EnsureProjectSkillLinksOptions = {},
): SkillLinkResult[] {
  const specs = getProjectSkillLinkSpecs(projectRoot);
  const platform = options.platform ?? process.platform;

  if (specs.length === 0) {
    return [];
  }

  if (!hasSkillDirectory(specs[0].sourcePath)) {
    return [];
  }

  return specs.map((spec) => ({
    ...spec,
    status: repairProjectSkillLink(spec, platform),
  }));
}

function formatRelativePath(projectRoot: string, entryPath: string) {
  return path.relative(projectRoot, entryPath) || entryPath;
}

export function syncProjectSkillLinks(projectRoot = process.cwd()) {
  const results = ensureProjectSkillLinks(projectRoot);
  const relativeSourcePath = formatRelativePath(projectRoot, path.join(projectRoot, 'skills'));

  for (const result of results) {
    console.log(
      `[skills] ${result.status}: ${formatRelativePath(projectRoot, result.linkPath)} -> ${relativeSourcePath}`,
    );
  }

  return results;
}

if (require.main === module) {
  syncProjectSkillLinks();
}
