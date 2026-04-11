import fs from 'node:fs';
import path from 'node:path';

export const COPILOT_SKILL_CATALOG_DIR = '.copilot-skill-catalog';

export interface SkillRootSpec {
  readonly relativePath: string;
  readonly scope: 'product' | 'common' | 'bot' | 'prompts' | 'modules' | 'plugins';
}

export interface GuideRootSpec {
  readonly relativePath: string;
  readonly prefix: '' | 'common' | 'bot' | 'prompts' | 'modules' | 'plugins';
}

export interface ResolvedSkillRoot extends SkillRootSpec {
  readonly absolutePath: string;
}

export interface ResolvedGuideRoot extends GuideRootSpec {
  readonly absolutePath: string;
}

export const SKILL_ROOT_SPECS: readonly SkillRootSpec[] = [
  { relativePath: 'skills', scope: 'product' },
  { relativePath: path.join('risu', 'common', 'skills'), scope: 'common' },
  { relativePath: path.join('risu', 'bot', 'skills'), scope: 'bot' },
  { relativePath: path.join('risu', 'prompts', 'skills'), scope: 'prompts' },
  { relativePath: path.join('risu', 'modules', 'skills'), scope: 'modules' },
  { relativePath: path.join('risu', 'plugins', 'skills'), scope: 'plugins' },
] as const;

export const GUIDE_ROOT_SPECS: readonly GuideRootSpec[] = [
  { relativePath: 'guides', prefix: '' },
  { relativePath: path.join('risu', 'common', 'docs'), prefix: 'common' },
  { relativePath: path.join('risu', 'bot', 'docs'), prefix: 'bot' },
  { relativePath: path.join('risu', 'prompts', 'docs'), prefix: 'prompts' },
  { relativePath: path.join('risu', 'modules', 'docs'), prefix: 'modules' },
  { relativePath: path.join('risu', 'plugins', 'docs'), prefix: 'plugins' },
] as const;

function isDirectory(filePath: string) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

export function resolveSkillRootDirs(baseRoot: string): ResolvedSkillRoot[] {
  return SKILL_ROOT_SPECS.map((spec) => ({
    ...spec,
    absolutePath: path.join(baseRoot, spec.relativePath),
  })).filter((spec) => isDirectory(spec.absolutePath));
}

export function resolveGuideRootDirs(baseRoot: string): ResolvedGuideRoot[] {
  return GUIDE_ROOT_SPECS.map((spec) => ({
    ...spec,
    absolutePath: path.join(baseRoot, spec.relativePath),
  })).filter((spec) => isDirectory(spec.absolutePath));
}

export function getCopilotSkillCatalogPath(baseRoot: string) {
  return path.join(baseRoot, COPILOT_SKILL_CATALOG_DIR);
}
