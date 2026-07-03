# MCP Workflow Guide

This document is the runtime-mode and common-sequence source of truth for RisuToki MCP sessions. It explains how a session starts and how work progresses across app-backed and standalone runtimes.

Use the other canonical documents for details owned elsewhere:

| Concern                                                     | Canonical source                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Startup order and guidance routing                          | Root `AGENTS.md`                                                       |
| Tool choice and task-intent playbooks                       | `read_skill("using-mcp-tools")`                                        |
| Profiles, facade coverage, tool families, and tool metadata | [`docs/MCP_TOOL_SURFACE.md`](../../docs/MCP_TOOL_SURFACE.md)           |
| Success, error, no-op, and recovery envelopes               | [`docs/MCP_ERROR_CONTRACT.md`](../../docs/MCP_ERROR_CONTRACT.md)       |
| Runtime implementation and application caveats              | [`docs/analysis/ARCHITECTURE.md`](../../docs/analysis/ARCHITECTURE.md) |
| Declarative routing and validation coverage                 | `src/lib/mcp-agent-workflow-eval.test.ts`                              |
| Measured synthetic workflow replay                          | `test/run-workflow-eval-replay.ts`                                     |

If documents overlap, follow the source that owns the concern in this table.

The Vitest matrix keeps declared routes aligned with documentation. `npm run test:evals:replay` separately exercises all 35 replayable workflow tasks through 12 canonical MCP stdio scenarios and gates metrics derived from actual responses. The 2026-07-03 coverage run completed in 29.521 seconds with every measured ratio at 1.0 and zero wrong-target incidents.

## 1. Runtime Modes

### App-backed mode

The desktop app starts the local API and MCP stdio process, writes supported CLI configurations, and connects tools to the active editor document plus loaded references.

- Generated JSON and TOML configuration updates preserve an existing valid `RISUTOKI_MCP_TOOL_PROFILE`.
- The active tool profile is selected when the MCP process starts.
- Changing profiles requires restarting the MCP server. Dynamic tool expansion is not supported.

### Standalone mode

Run the file-backed MCP server without Electron:

```bash
node toki-mcp-server.js --standalone [--file <path>] [--ref <path>] [--allow-writes] [--tool-profile <profile>]
```

- `--file` loads an active `.charx`, `.risum`, or `.risup` document.
- Repeated `--ref` options load read-only references.
- Without `--allow-writes`, mutation requests stop at the write gate.
- `--user-data-dir` changes the standalone sidecar and diagnostics directory.
- `RISUTOKI_MCP_FILE`, `RISUTOKI_MCP_REFS`, `RISUTOKI_MCP_ALLOW_WRITES`, `RISUTOKI_MCP_USER_DATA_DIR`, and `RISUTOKI_MCP_TOOL_PROFILE` are the environment-variable equivalents.

The default registered profile is `facade-first` with 13 tools: 11 preferred facades plus `list_skills` and `read_skill`. `load_guidance` remains a legacy compatibility facade in non-default profiles. Use `--tool-profile advanced-full` or `RISUTOKI_MCP_TOOL_PROFILE=advanced-full` when a client needs every granular route.

`session_status` reports `allowWrites`, `userDataPath`, and `runtimeHealth`. Standalone process diagnostics are appended to `%USERPROFILE%\.risutoki\mcp-standalone\mcp-server.log` unless `--user-data-dir` changes the location. Diagnostics contain paths, timings, status, response sizes, and error summaries, not prompt or field bodies.

### Project-folder mode

When a `.charx`, `.risum`, or `.risup` project folder is active, the folder is the save backend for the normal structured editor. The AI terminal working directory and generated project-root context resolve to that folder.

Structured editor and MCP surfaces remain the default. Raw `.md`, `.json`, and asset files are an advanced fallback for external tools or exact filesystem work. Use `manage_file` project-folder extract/reassemble workflows when MCP response bounds make direct work impractical.

## 2. Tool Registration Profiles

The server registers one profile at startup, and `tools/list` returns only that registered set:

| Profile         | Purpose                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `facade-first`  | Default low-context surface for normal inspect/read/search/preview/apply workflows plus skill bootstrap |
| `authoring`     | Facades plus structured authoring, reference, skill, CBS, and Danbooru families                         |
| `readonly`      | Tools annotated with `readOnlyHint=true`; mutation facades and file-open controls are excluded          |
| `advanced-full` | Every granular and compatibility route                                                                  |

Call `list_tool_profiles` to inspect profile membership, the active profile, registered/hidden counts, workflow stages, and runtime health. Requesting another profile from that catalog does not register it dynamically; restart the server with the desired profile.

The complete profile and coverage contract lives in [`docs/MCP_TOOL_SURFACE.md`](../../docs/MCP_TOOL_SURFACE.md).

## 3. Common Execution Sequence

Use this sequence for reads and edits:

1. **Load guidance.** At session start, load `project-workflow`. Before concrete MCP reads or writes, load `using-mcp-tools`.
2. **Discover.** Use `list_tool_profiles` when profile state matters, then `inspect_document` for active, session, reference, or external preflight.
3. **Read, search, or analyze narrowly.** Prefer bounded `read_content`, selector-based `search_document`, and `analyze_content`. Analysis owns transformation/statistics/simulation, including field/token counts and lorebook/regex behavior previews.
4. **Validate or preview.** Use `validate_content` for pass/fail diagnostics, including compile-only Lua syntax and Danbooru `valid | invalid | unknown`; use `preview_edit` or the read/preview mode of `manage_items`, `manage_assets`, and `manage_file` before mutation.
5. **Apply.** Reuse the returned `preview_token`, `operation_digest`, and stale guards once. `apply_edit` consumes its token before the first mutation; a partial batch failure requires inspection and a fresh preview.
6. **Validate again.** Re-read the changed target or rerun the validator/diff that found the issue.
7. **Summarize fallback.** If a granular route was necessary, add one line to the final task summary stating which facade selector or operation was unsupported. No separate log or commit-message record is required.

Facade coverage is determined by behavior: when a facade accepts the selector or operation in preview/read mode, use that facade through apply. A facade rejection or an operation it cannot express is the routing signal for the matching granular family. The route-by-route matrix lives in [`docs/MCP_TOOL_SURFACE.md`](../../docs/MCP_TOOL_SURFACE.md).

## 4. Startup Without an Active Document

Guidance discovery is independent of document state:

- `list_skills` and `read_skill` work with no active document.
- `load_guidance` works with no active document when the selected profile registers the legacy compatibility facade.
- `inspect_document` works without an active document when the target is session, reference, external, or guidance.
- Document-bound reads and edits still return the structured `No file open` error.

This allows standalone clients to bootstrap project guidance before choosing or opening an artifact.

## 5. Shared Safety Rules

- Prefer stable `id`, `identity`, or hash selectors over indexes when list responses provide them.
- Treat a stale-target `409` as a successful safety catch: refresh the source list/read, rebuild the preview, and retry with current guards.
- Prefer response `next_actions` over a generic family sequence.
- Use `artifacts.byte_size` as a context-budget cue. Narrow subsequent reads when responses are already large.
- `inspect_document`, `read_content`, `search_document`, `analyze_content`, and `validate_content` default to a byte-accurate 24 KB UTF-8 result cap. Root surface reads return an overview unless `include_raw` and an explicit `max_bytes` are both justified.
- `inspect_document({kind:"reference"})` without an identifier returns a bounded inventory; add `reference_id` or `file_path` to inspect only one reference.
- Protected `.charx` compatibility fields, `.risup` legacy prompt fields, and reserved `.risum` `cjs` remain hidden and save-stripped. `hiddenFieldWarnings` is an existence summary, not permission to recover values through another route.
- References are read-only.
- Batch related sibling reads or writes when a batch route exists.

Exact tool-selection rules and task playbooks live in `read_skill("using-mcp-tools")`. Error and recovery behavior lives in [`docs/MCP_ERROR_CONTRACT.md`](../../docs/MCP_ERROR_CONTRACT.md).

## 6. Skill Discovery

The generated skill catalog is repository-root scoped:

- Codex: `.agents/skills`
- Claude Code: `.claude/skills`
- Gemini CLI: `.gemini/skills`
- Copilot CLI: `.github/skills`

`npm run sync:skills` rebuilds `.copilot-skill-catalog/` from the tracked skill roots and refreshes those discovery paths. Subtree routing is handled by the nearest `risu/{scope}/AGENTS.md`, not by separate nested catalogs.

If MCP is unavailable, read `skills/project-workflow/SKILL.md` directly, then open only the supporting file needed for the task. If the generated catalog is empty, run `npm run sync:skills` and verify the tracked skill roots before falling back to repo-local docs.
