# Plugin Authoring — Router

Use `writing-plugins-v3` as the primary Skill for RisuAI Plugin API v3 work. Add `writing-html-css` or `writing-cbs-syntax` only when the plugin emits that syntax. Use `using-mcp-tools` only when the task also touches RisuToki artifact or MCP surfaces.

Preserve the metadata header, especially `//@name` and `//@api 3.0`. Treat every `risuai.*` and `SafeElement` call as async. Prefer the iframe's own `document`; use `getRootDocument()` only for necessary host-DOM access. Respect the sandbox boundary.

Read `risu/plugins/docs/API_QUICKREF.md` for exact API details and `MIGRATION.md` only for legacy-plugin migration. Keep local plugin work products ignored. Do not load bot, preset, or module workflows unless integration requires them.
