# RisuToki — Agent Startup Guide

> Routing guide that every AI coding assistant should read at the start of a session.
> RisuToki is a dedicated MCP editor for RisuAI `.charx` / `.risum` / `.risup` files.

---

## What to read at session start

| Order | Topic                                       | How to load                                                                                                                                                                    |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | **Onboarding, project rules, MCP workflow** | `read_skill("project-workflow")` — for full detail, follow up with `read_skill("project-workflow", "MCP_WORKFLOW.md")` or `read_skill("project-workflow", "PROJECT_RULES.md")` |
| 2     | **MCP tool selection, large fields, batch** | `read_skill("using-mcp-tools")`                                                                                                                                                |
| 3     | **Artifact authoring routing**              | If you are working under `risu/`, read the local `risu/{artifact}/AGENTS.md` or `README.md`, plus `.github/instructions/risu-authoring.instructions.md`                        |
| 4     | CBS / Lua / lorebook and other syntax       | `list_skills` → `read_skill(name)`                                                                                                                                             |

### Additional repo-local references (may not be available outside the repo)

| Document                                                         | Contents                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| [`docs/analysis/ARCHITECTURE.md`](docs/analysis/ARCHITECTURE.md) | Runtime architecture, process boundaries, hotspots (canonical) |
| [`docs/MCP_WORKFLOW.md`](docs/MCP_WORKFLOW.md)                   | MCP tool routing and read-rule source of truth                 |
| [`docs/MCP_TOOL_SURFACE.md`](docs/MCP_TOOL_SURFACE.md)           | Tool families, boundaries, behavior hints                      |
| [`docs/MCP_ERROR_CONTRACT.md`](docs/MCP_ERROR_CONTRACT.md)       | Error / no-op / success response contracts                     |
| [`docs/PROJECT_RULES.md`](docs/PROJECT_RULES.md)                 | Versioning and CI rules                                        |
| [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md)                       | TypeScript source navigation map                               |
| [`docs/README.md`](docs/README.md)                               | Full knowledge-base index                                      |

---

## Mandatory rules

1. **At the start of every session**, read `read_skill("project-workflow")` first. It contains a summary of MCP rules and project rules. Load `MCP_WORKFLOW.md` and `PROJECT_RULES.md` from that skill when you need full detail.
2. **Never bulk-read large surfaces with `read_field`.** For `lua`, `css`, `alternateGreetings`, `triggerScripts`, `promptTemplate`/`formatingOrder`, use the dedicated risup prompt tools first (`list_risup_prompt_items`, `search_in_risup_prompt_items`, `read_risup_prompt_item_batch`, `export_risup_prompt_to_text`, `diff_risup_prompt`, `list_risup_prompt_snippets`, `read_risup_prompt_snippet`, `read_risup_formating_order`).
3. **Prefer batch tools.** When reading or editing multiple sibling items, use batch reads/writes rather than repeating single-item calls.
4. **Probe before you open.** Use `probe_*` to inspect files that are not yet open; switch to `open_file` only when you need to write.
5. **Check `session_status` before risky writes or after resuming an interrupted session.** It reports the current document, dirty/autosave state, recovery info, snapshot state, and compact structured-surface counts. It works even when no file is open.
6. **Keep docs in sync.** When MCP tools or fields change, update `AGENTS.md`, `docs/`, and `skills/` together.
7. **Bump version + changelog every task.** Update `package.json` version and add a `CHANGELOG.md` entry for every change.
8. **When syntax is unclear, read the skill docs first.** For detailed MCP tool-selection guidance, see `read_skill("using-mcp-tools")`.
9. **Trust MCP routing hints.** Prefer returned `next_actions`, `artifacts.byte_size`, and tool-list `_meta` hints like `risutoki/requiresConfirmation` / `risutoki/supportsDryRun` over free-form guessing; high-traffic tools may narrow the family defaults with safer follow-up guidance.
10. **Use indexed-write stale-index guards.** Carry the latest family identity values from list/read routes into mutation calls: `expected_comment` for lorebook/regex/trigger, `expected_preview` / `expected_previews` for greetings, and `expected_type` plus optional `expected_preview` for risup prompt-item writes. For large lorebook replacements, prefer `replace_in_lorebook_batch(dry_run=true)` before the confirmed apply.

---

## Skills quick reference

| Skill                      | Purpose                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `project-workflow`         | Project rules, MCP workflow, onboarding guide (includes `MCP_WORKFLOW.md` + `PROJECT_RULES.md`) |
| `using-mcp-tools`          | Tool selection, large-field editing, batch-first principles                                     |
| `authoring-characters`     | Character-focused `.charx` description writing                                                  |
| `authoring-lorebook-bots`  | Lorebook-driven / cast-heavy bot composition                                                    |
| `file-structure-reference` | `.charx` / `.risum` / `.risup` / lorebook / regex structure                                     |
| `writing-cbs-syntax`       | CBS template-tag syntax                                                                         |
| `writing-risup-presets`    | `.risup` preset composition, promptTemplate workflow, and structured output                     |
| `writing-risum-modules`    | `.risum` module composition, merge order, and toggle/module integration                         |
| `writing-plugins-v3`       | RisuAI plugin v3 sandbox/API authoring                                                          |
| `writing-lua-scripts`      | Lua 5.4 trigger scripts                                                                         |
| `writing-lorebooks`        | Lorebook keywords, decorators, folders                                                          |
| `writing-regex-scripts`    | Regex modification scripts                                                                      |
| `writing-html-css`         | backgroundEmbedding, x-risu- CSS                                                                |
| `writing-trigger-scripts`  | V2 trigger scripts                                                                              |
| `writing-danbooru-tags`    | Danbooru tag search and validation                                                              |

Use `list_skills` to see all available skills and their metadata, then `read_skill(name, file?)` to load only what you need.

- Product/editor workflow skills stay under root `skills/`.
- Shared authoring syntax/reference lives under `risu/common/skills/`.
- Artifact-specific authoring skills live under `risu/{bot,prompts,modules,plugins}/skills/`.

If no main file is open but reference files are loaded, start with `session_status` or `list_references`, then narrow large reference text with `search_in_reference_field` / `read_reference_field_range` before drilling into `list_reference_*` / `read_reference_*`.
