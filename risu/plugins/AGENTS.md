# Plugin Authoring — Router

Use `writing-plugins-v3` as the primary Skill for RisuAI Plugin API v3 work. Add `writing-html-css` or `writing-cbs-syntax` only when the plugin emits that syntax. Use `using-mcp-tools` only when the task also touches RisuToki artifact or MCP surfaces.

Preserve the metadata header, especially `//@name` and `//@api 3.0`. `risuai` and `Risuai` are equivalent API v3 globals; use one spelling consistently. Await API and `SafeElement` method calls, but read cached properties such as `apiVersion` directly. Prefer the iframe's own `document`; use `getRootDocument()` only for necessary host-DOM access. Respect the sandbox boundary.

Read `risu/plugins/docs/API_QUICKREF.md` for exact API details and `MIGRATION.md` only for legacy-plugin migration. Keep local plugin work products ignored. Do not load bot, preset, or module workflows unless integration requires them.
