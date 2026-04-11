# Plugins (RisuAI Plugin API v3)

This directory contains plugin-specific documentation and skills for RisuToki.

Plugins are executable extensions that run inside RisuAI's plugin sandbox. They are the right surface for custom UI, provider integrations, MCP bridges, IPC, and other code-driven behavior that does not belong in a bot, preset, or module.

Only routing/docs/skills surfaces are tracked here. Local plugin work products remain ignored.

## Contents

| Path                                 | Description                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                          | Agent routing — what to read and in what order                                                                                       |
| `docs/API_QUICKREF.md`               | Plugin API v3 method/categories cheat sheet                                                                                          |
| `docs/MIGRATION.md`                  | v2.x → v3.0 migration guide                                                                                                          |
| `skills/README.md`                   | Plugin skill index                                                                                                                   |
| `skills/writing-plugins-v3/SKILL.md` | Authoring guide for metadata headers, sandbox model, async API usage, SafeElement, storage, UI registration, and security boundaries |

## Shared/reference skills

Plugins are not prompt-pipeline content, but they can still intersect with shared authoring domains:

| Topic                                 | Skill                |
| ------------------------------------- | -------------------- |
| HTML/CSS snippets emitted by a plugin | `writing-html-css`   |
| CBS content produced by a plugin      | `writing-cbs-syntax` |
| Project rules / release workflow      | `project-workflow`   |

## Quick orientation

- **Writing a new plugin?** → Start with `skills/writing-plugins-v3/SKILL.md`
- **Looking up an API category?** → `docs/API_QUICKREF.md`
- **Migrating old plugin code?** → `docs/MIGRATION.md`
