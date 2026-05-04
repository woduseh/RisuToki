# Plugin Authoring — Agent Routing

> Thin routing file. Full content lives in the linked skills and docs.

## What to read / when

| Order | Topic                                          | How to load                                             |
| ----- | ---------------------------------------------- | ------------------------------------------------------- |
| 1     | Project rules & MCP workflow                   | `read_skill("project-workflow")`                        |
| 2     | MCP tool selection                             | `read_skill("using-mcp-tools")` before MCP reads/writes |
| 3     | Plugin API v3 authoring                        | `read_skill("writing-plugins-v3")`                      |
| 4     | API quick reference                            | `risu/plugins/docs/API_QUICKREF.md`                     |
| 5     | Migration notes (when touching legacy plugins) | `risu/plugins/docs/MIGRATION.md`                        |

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
5. When plugin work touches RisuToki MCP surfaces or artifact files, follow `using-mcp-tools` and use dedicated readers/writers instead of broad field dumps.
6. Local plugin work products in this directory stay ignored. Only routing/docs/skills surfaces are tracked here.
7. Bot, preset, and module composition workflows are separate. Only pull them in when the plugin task explicitly emits or integrates those artifact surfaces.
8. Use `writing-plugins-v3` as the primary skill first; load shared syntax skills only when the plugin emits or manipulates that syntax directly.
