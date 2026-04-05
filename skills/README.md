# RisuAI Skills Library

Structured skill documents for LLMs working with RisuAI `.charx`, `.risum`, and `.risup` files. Each skill uses YAML frontmatter plus optional routing metadata so `list_skills` can expose richer summaries.

## Workflow & Reference Skills

| Skill                                                 | Description                                              | Files                                                   | Metadata                |
| ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- | ----------------------- |
| [using-mcp-tools](using-mcp-tools/)                   | MCP tool choice, batch-safe workflows, and anti-patterns | `SKILL.md` + `TOOL_REFERENCE.md` + `FILE_STRUCTURES.md` | `tags`, `related_tools` |
| [file-structure-reference](file-structure-reference/) | `.charx` / `.risum` / `.risup`, lorebook, regex schemas  | `SKILL.md`                                              | `tags`, `related_tools` |
| [writing-danbooru-tags](writing-danbooru-tags/)       | Danbooru tag discovery and validation workflow           | `SKILL.md`                                              | `tags`, `related_tools` |

## Syntax & Tool Skills

| Skill                                               | Description                                       | Files                           | Metadata                |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------------- | ----------------------- |
| [writing-cbs-syntax](writing-cbs-syntax/)           | CBS template syntax and validation                | `SKILL.md` + `REFERENCE.md`     | `tags`, `related_tools` |
| [writing-lua-scripts](writing-lua-scripts/)         | Lua 5.4 scripting API for RisuAI                  | `SKILL.md` + `API_REFERENCE.md` | `tags`, `related_tools` |
| [writing-lorebooks](writing-lorebooks/)             | Lorebook entry structure and activation rules     | `SKILL.md`                      | `tags`, `related_tools` |
| [writing-regex-scripts](writing-regex-scripts/)     | Regex script types, flags, and rendering patterns | `SKILL.md`                      | `tags`, `related_tools` |
| [writing-html-css](writing-html-css/)               | HTML/CSS constraints and UI patterns              | `SKILL.md`                      | `tags`, `related_tools` |
| [writing-arca-html](writing-arca-html/)             | Restricted WYSIWYG HTML authoring                 | `SKILL.md`                      | `tags`, `related_tools` |
| [writing-trigger-scripts](writing-trigger-scripts/) | Trigger execution model and automation planning   | `SKILL.md`                      | `tags`, `related_tools` |
| [writing-asset-prompts](writing-asset-prompts/)     | Image prompt writing for character assets         | `SKILL.md`                      | `tags`, `related_tools` |

## Authoring Skills

| Skill                                               | Description                              | Files                                                               | Metadata                |
| --------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------- | ----------------------- |
| [authoring-characters](authoring-characters/)       | Character description writing for LLM RP | `SKILL.md` + `SPEECH_SYSTEM.md` + `VALIDATION.md` + `BOT_SCALES.md` | `tags`, `related_tools` |
| [authoring-lorebook-bots](authoring-lorebook-bots/) | Lorebook-driven bot description writing  | `SKILL.md` + `LOREBOOK_ARCHITECTURE.md` + `BOT_SCALES.md`           | `tags`, `related_tools` |

## Frontmatter Schema

Every `SKILL.md` starts with YAML frontmatter.

```yaml
---
name: using-mcp-tools
description: 'Workflow guide for choosing RisuToki MCP tools safely.'
tags: ['workflow', 'mcp', 'editing']
related_tools: ['search_all_fields', 'write_field_batch', 'read_skill']
---
```

### Required fields

- `name`
- `description`

### Optional additive fields

- `tags`
  - Inline JSON-style string array only
  - Example: `tags: ["workflow", "mcp"]`
- `related_tools`
  - Inline JSON-style string array only
  - Example: `related_tools: ["list_lorebook", "read_lorebook"]`

These optional fields are exposed by MCP `list_skills` as `tags` and `relatedTools`.

## How to Use

### For AI Assistants

1. Start with `list_skills` when you need to choose a guide.
2. Read `SKILL.md` first.
3. Load reference files only when deeper detail is needed.
4. Use `tags` and `relatedTools` to find the shortest relevant path.

### For Humans

Browse individual skill folders directly. The `guides/` folder still contains the original Korean-language material for human reading and translation source.

## Relationship to `guides/`

```text
guides/          → Human-readable Korean guides (original)
skills/          → LLM-optimized skills + MCP-readable metadata
```
