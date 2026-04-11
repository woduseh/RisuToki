# Plugin Authoring — Agent Routing

> Thin routing file. Full content lives in the linked skills and docs.

## What to read

| Order | Topic                                          | How to load                         |
| ----- | ---------------------------------------------- | ----------------------------------- |
| 1     | Project rules & MCP workflow                   | `read_skill("project-workflow")`    |
| 2     | Plugin API v3 authoring                        | `read_skill("writing-plugins-v3")`  |
| 3     | API quick reference                            | `risu/plugins/docs/API_QUICKREF.md` |
| 4     | Migration notes (when touching legacy plugins) | `risu/plugins/docs/MIGRATION.md`    |

## Related skills

| Topic                              | Skill                              |
| ---------------------------------- | ---------------------------------- |
| Plugin-generated HTML/CSS          | `read_skill("writing-html-css")`   |
| CBS emitted by plugin text/content | `read_skill("writing-cbs-syntax")` |

## Mandatory rules

1. **Assume every `risuai.*` and `SafeElement` call is async** and `await` it.
2. Prefer the plugin iframe's own `document` for UI. Only use `getRootDocument()` when you truly need host DOM access.
3. Keep the metadata header stable, especially `//@name` and `//@api 3.0`.
4. Treat the sandbox/security boundary as intentional. Do not design around escaping it.
5. Local plugin work products in this directory stay ignored. Only routing/docs/skills surfaces are tracked here.
