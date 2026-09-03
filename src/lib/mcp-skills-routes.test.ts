// @vitest-environment node
import * as fs from 'fs';
import * as path from 'path';

import { describe, expect, it } from 'vitest';
import {
  MCP_API_FIXED_SKILL_ROOT,
  closeServer,
  createLegacyTestApiServer,
  createSearchFixture,
  getJson,
  writeSkillFixture,
  type McpErrorEnvelope,
} from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';
import { resolveGuideRootDirs } from './content-roots';

const FIXED_SKILL_ROOT = MCP_API_FIXED_SKILL_ROOT;
const TEST_DIR = useMcpApiTestDir('skills-routes');
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

describe('MCP API skills routes', () => {
  it('lists and reads skills without an active document', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-without-document');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'reference-skill', {
      'SKILL.md': `---
name: reference-skill
description: 'Reference skill without an active document'
---

# Reference Skill
`,
    });

    const api = await startTestApiServer(null, [], skillsDir);

    try {
      const list = await getJson<{ count: number; skills: Array<{ name: string }> }>(api.port, api.token, '/skills');
      expect(list.status).toBe(200);
      expect(list.data.skills).toEqual([expect.objectContaining({ name: 'reference-skill' })]);

      const detail = await getJson<{ content: string }>(api.port, api.token, '/skills/reference-skill/SKILL.md');
      expect(detail.status).toBe(200);
      expect(detail.data.content).toContain('# Reference Skill');
    } finally {
      await closeServer(api.server);
    }
  });

  it('lists custom skills with parsed additive metadata', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-metadata');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'reference-skill', {
      'SKILL.md': `---
name: reference-skill
description: 'Reference skill for tests'
tags: ["reference", "metadata"]
related_tools: ["list_lorebook", "read_lorebook"]
---

# Reference Skill
`,
      'REFERENCE.md': '# More detail\n',
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);

    try {
      const response = await getJson<{
        count: number;
        skills: Array<{
          name: string;
          description: string;
          tags: string[];
          relatedTools: string[];
          files: string[];
          scope: string;
        }>;
      }>(api.port, api.token, '/skills');

      expect(response.status).toBe(200);
      expect(response.data.count).toBe(1);
      expect(response.data.skills).toEqual([
        {
          name: 'reference-skill',
          description: 'Reference skill for tests',
          tags: ['reference', 'metadata'],
          relatedTools: ['list_lorebook', 'read_lorebook'],
          files: ['REFERENCE.md', 'SKILL.md'],
          scope: 'product',
        },
      ]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('defaults missing additive metadata to empty arrays', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-defaults');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'minimal-skill', {
      'SKILL.md': `---
name: minimal-skill
description: 'Minimal frontmatter'
---

# Minimal Skill
`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);

    try {
      const response = await getJson<{
        count: number;
        skills: Array<{
          name: string;
          description: string;
          tags: string[];
          relatedTools: string[];
          files: string[];
          scope: string;
        }>;
      }>(api.port, api.token, '/skills');

      expect(response.status).toBe(200);
      expect(response.data.skills).toEqual([
        {
          name: 'minimal-skill',
          description: 'Minimal frontmatter',
          tags: [],
          relatedTools: [],
          files: ['SKILL.md'],
          scope: 'product',
        },
      ]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('parses YAML flow arrays that use single-quoted strings', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-yaml-flow');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'yaml-flow-skill', {
      'SKILL.md': `---
name: yaml-flow-skill
description: 'Parses YAML flow arrays'
tags: ['workflow', 'metadata']
related_tools: ['search_all_fields', 'write_field_batch']
---

# YAML Flow Skill
`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);

    try {
      const response = await getJson<{
        count: number;
        skills: Array<{
          name: string;
          description: string;
          tags: string[];
          relatedTools: string[];
          files: string[];
          scope: string;
        }>;
      }>(api.port, api.token, '/skills');

      expect(response.status).toBe(200);
      expect(response.data.skills).toEqual([
        {
          name: 'yaml-flow-skill',
          description: 'Parses YAML flow arrays',
          tags: ['workflow', 'metadata'],
          relatedTools: ['search_all_fields', 'write_field_batch'],
          files: ['SKILL.md'],
          scope: 'product',
        },
      ]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('parses indented YAML flow arrays on the line after the key', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-yaml-flow-next-line');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'yaml-flow-next-line-skill', {
      'SKILL.md': `---
name: yaml-flow-next-line-skill
description: 'Parses YAML flow arrays on the following line'
tags:
  ['workflow', 'metadata']
related_tools:
  [
    'list_fields',
    'read_field_batch',
  ]
---

# YAML Flow Next Line Skill
`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);

    try {
      const response = await getJson<{
        skills: Array<{
          name: string;
          tags: string[];
          relatedTools: string[];
        }>;
      }>(api.port, api.token, '/skills');

      expect(response.status).toBe(200);
      expect(response.data.skills).toEqual([
        expect.objectContaining({
          name: 'yaml-flow-next-line-skill',
          tags: ['workflow', 'metadata'],
          relatedTools: ['list_fields', 'read_field_batch'],
        }),
      ]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('discovers the extracted built-in reference skills', async () => {
    const api = await startTestApiServer(createSearchFixture(), [], FIXED_SKILL_ROOT);

    try {
      const response = await getJson<{
        count: number;
        skills: Array<{
          name: string;
          tags: string[];
          relatedTools: string[];
        }>;
      }>(api.port, api.token, '/skills');

      expect(response.status).toBe(200);
      expect(response.data.count).toBeGreaterThan(0);
      expect(response.data.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'file-structure-reference',
            tags: expect.arrayContaining(['reference', 'charx']),
            relatedTools: expect.arrayContaining(['inspect_document', 'read_content', 'read_field_batch']),
          }),
          expect.objectContaining({
            name: 'using-mcp-tools',
            tags: expect.arrayContaining(['workflow', 'mcp']),
            relatedTools: expect.arrayContaining([
              'inspect_document',
              'read_content',
              'search_document',
              'preview_edit',
              'apply_edit',
            ]),
          }),
          expect.objectContaining({
            name: 'writing-standing-image-prompts',
            tags: expect.arrayContaining(['danbooru', 'assets']),
            relatedTools: expect.arrayContaining([
              'analyze_content',
              'validate_content',
              'search_danbooru_tags',
              'validate_danbooru_tags',
            ]),
          }),
        ]),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('reads specific skill files and blocks path traversal', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-read');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'reference-skill', {
      'SKILL.md': `---
name: reference-skill
description: 'Reference skill for file reads'
---

# Reference Skill
`,
      'REFERENCE.md': '# Reference appendix\n',
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);

    try {
      const detail = await getJson<{
        skill: string;
        file: string;
        content: string;
      }>(api.port, api.token, '/skills/reference-skill/REFERENCE.md');

      expect(detail.status).toBe(200);
      expect(detail.data).toMatchObject({
        skill: 'reference-skill',
        file: 'REFERENCE.md',
      });
      expect(detail.data.content).toContain('# Reference appendix');

      const blocked = await getJson<{ error: string }>(
        api.port,
        api.token,
        '/skills/reference-skill/..%2F..%2Fpackage.json',
      );

      expect(blocked.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API skill references', () => {
  it('lists and reads references/*.md while rejecting other nested paths', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-references');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'profile-skill', {
      'SKILL.md': `---\nname: profile-skill\ndescription: 'Skill with a references directory'\n---\n\n# Profile Skill\n`,
      'references/TARGET.md': '# Target profile\n',
      'notes/HIDDEN.md': '# Not served\n',
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);
    try {
      const list = await getJson<{ skills: Array<{ name: string; files: string[] }> }>(api.port, api.token, '/skills');
      expect(list.status).toBe(200);
      expect(list.data.skills[0]?.files).toEqual(['SKILL.md', 'references/TARGET.md']);

      const detail = await getJson<{ file: string; content: string }>(
        api.port,
        api.token,
        '/skills/profile-skill/references%2FTARGET.md',
      );
      expect(detail.status).toBe(200);
      expect(detail.data).toMatchObject({ file: 'references/TARGET.md' });
      expect(detail.data.content).toContain('# Target profile');

      const hidden = await getJson<McpErrorEnvelope>(api.port, api.token, '/skills/profile-skill/notes%2FHIDDEN.md');
      expect(hidden.status).toBe(400);
      expect(hidden.data.error).toContain('Invalid file name');

      const escaped = await getJson<McpErrorEnvelope>(
        api.port,
        api.token,
        '/skills/profile-skill/references%2F..%2FSKILL.md',
      );
      expect(escaped.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API guide documents', () => {
  it('lists guides and reads them by catalog name, repository path, or unique file name with bounded cursors', async () => {
    const baseDir = path.join(TEST_DIR, 'guides-base');
    await fs.promises.rm(baseDir, { recursive: true, force: true });
    const commonDocs = path.join(baseDir, 'risu', 'common', 'docs');
    const familyDocs = path.join(baseDir, 'risu', 'prompts', 'docs', 'families');
    await fs.promises.mkdir(commonDocs, { recursive: true });
    await fs.promises.mkdir(familyDocs, { recursive: true });
    await fs.promises.writeFile(path.join(commonDocs, 'GUIDE.md'), '# Common guide\n', 'utf-8');
    await fs.promises.writeFile(path.join(familyDocs, 'FAMILY.md'), '# Family profile\n\n한글 본문\n', 'utf-8');

    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      guideRoots: resolveGuideRootDirs(baseDir),
    });
    try {
      const list = await getJson<{ count: number; guides: Array<{ name: string; path: string }> }>(
        api.port,
        api.token,
        '/guides',
      );
      expect(list.status).toBe(200);
      expect(list.data.guides.map((guide) => guide.name)).toEqual(['common/GUIDE.md', 'prompts/families/FAMILY.md']);
      expect(list.data.guides[1]?.path).toBe('risu/prompts/docs/families/FAMILY.md');

      for (const name of ['prompts/families/FAMILY.md', 'risu/prompts/docs/families/FAMILY.md', 'FAMILY.md']) {
        const detail = await getJson<{ guide: string; content: string }>(
          api.port,
          api.token,
          `/guides/${encodeURIComponent(name)}`,
        );
        expect(detail.status, name).toBe(200);
        expect(detail.data.guide).toBe('prompts/families/FAMILY.md');
        expect(detail.data.content).toContain('# Family profile');
      }

      const first = await getJson<{ content: string; next_cursor: string | null; truncated: boolean }>(
        api.port,
        api.token,
        `/guides/${encodeURIComponent('prompts/families/FAMILY.md')}?max_bytes=20`,
      );
      expect(first.status).toBe(200);
      expect(first.data.truncated).toBe(true);
      const rest = await getJson<{ content: string; truncated: boolean }>(
        api.port,
        api.token,
        `/guides/${encodeURIComponent('prompts/families/FAMILY.md')}?cursor=${encodeURIComponent(first.data.next_cursor ?? '')}`,
      );
      expect(rest.status).toBe(200);
      expect(rest.data.truncated).toBe(false);
      expect(first.data.content + rest.data.content).toBe('# Family profile\n\n한글 본문\n');

      const traversal = await getJson<McpErrorEnvelope>(api.port, api.token, '/guides/..%2Fpackage.json');
      expect(traversal.status).toBe(400);
      expect(traversal.data.error).toContain('Invalid guide name');

      const missing = await getJson<McpErrorEnvelope>(api.port, api.token, '/guides/NOPE.md');
      expect(missing.status).toBe(404);
      expect(missing.data.suggestion).toContain('common/GUIDE.md');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — skills routes', () => {
  it('returns a structured error envelope for traversal-shaped skill name in GET /skills/:name', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-skill-name-traversal-envelope');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'my-skill', {
      'SKILL.md': `---\nname: my-skill\ndescription: 'test'\n---\n# Skill\n`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/skills/..%2F..%2Foutside');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read_skill');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'skills:../../outside:SKILL.md');
      expect(res.data.error).toContain('Invalid skill name');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for traversal-shaped file name in GET /skills/:name/:file', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-traversal-envelope');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'my-skill', {
      'SKILL.md': `---\nname: my-skill\ndescription: 'test'\n---\n# Skill\n`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/skills/my-skill/..%2F..%2Fpackage.json');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read_skill');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'skills:my-skill:../../package.json');
      expect(res.data.error).toContain('Invalid file name');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a colon-delimited target for missing files in GET /skills/:name/:file', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-missing-envelope');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'my-skill', {
      'SKILL.md': `---\nname: my-skill\ndescription: 'test'\n---\n# Skill\n`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/skills/my-skill/MISSING.md');
      expect(res.status).toBe(404);
      expect(res.data).toHaveProperty('action', 'read_skill');
      expect(res.data).toHaveProperty('status', 404);
      expect(res.data).toHaveProperty('target', 'skills:my-skill:MISSING.md');
      expect(res.data.error).toContain('Skill file not found: my-skill/MISSING.md');
    } finally {
      await closeServer(api.server);
    }
  });
});
