# Plugin Skills — API v3 Authoring

LLM-optimized skills for writing and reviewing RisuAI plugin v3 scripts.

## Skills

| Skill                                     | Description                                                                                                            | Files      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| [writing-plugins-v3](writing-plugins-v3/) | Plugin API v3 sandbox model, metadata, async API usage, SafeElement, storage, UI registration, and security boundaries | `SKILL.md` |

## Typical workflow

1. Load the plugin authoring skill first.
2. Open `../docs/API_QUICKREF.md` when you need a category-level API reminder.
3. Open `../docs/MIGRATION.md` when touching legacy plugin code.
4. Load shared syntax skills only when the plugin emits or transforms that syntax directly.
