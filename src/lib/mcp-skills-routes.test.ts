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
            name: 'writing-danbooru-tags',
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
