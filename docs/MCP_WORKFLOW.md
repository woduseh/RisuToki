# MCP Workflow Guide

This document is the runtime-mode and startup reference for RisuToki MCP sessions. It explains how a session starts and how work progresses across app-backed and standalone runtimes.

Use the other canonical documents for details owned elsewhere:

| Concern                                                     | Canonical source                                            |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| Startup order and guidance routing                          | Root `AGENTS.md`                                            |
| Tool choice and task-intent playbooks                       | `read_skill("using-mcp-tools")`                             |
| Profiles, facade coverage, tool families, and tool metadata | [`docs/MCP_TOOL_SURFACE.md`](MCP_TOOL_SURFACE.md)           |
| Success, error, no-op, and recovery envelopes               | [`docs/MCP_ERROR_CONTRACT.md`](MCP_ERROR_CONTRACT.md)       |
| Runtime implementation and application caveats              | [`docs/analysis/ARCHITECTURE.md`](analysis/ARCHITECTURE.md) |
| Declarative routing and validation coverage                 | `src/lib/mcp-agent-workflow-eval.test.ts`                   |
| Deterministic synthetic MCP contract replay                 | `test/run-workflow-eval-replay.ts`                          |

If documents overlap, follow the source that owns the concern in this table.

The Vitest matrix keeps declared routes aligned with documentation. `npm run test:evals:replay` separately executes 12 scripted MCP stdio scenarios whose catalog mappings cover all 35 replayable workflow declarations. It measures deterministic server-contract behavior from actual responses; it does not execute the catalog prompts or claim model routing quality.

## 1. Runtime Modes

### App-backed mode

The desktop app starts the local API and MCP stdio process, writes supported CLI configurations, and connects tools to the active editor document plus loaded references.

- Generated JSON and TOML configurations explicitly select `facade-first` and migrate older broad profiles on rewrite. Existing `readonly` configurations stay read-only. Manually configured CLI connections can still explicitly select `advanced-full` for compatibility.
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

The default registered profile is `facade-first` with 14 tools: 12 preferred facades plus `list_skills` and `read_skill`. `load_guidance` remains a legacy compatibility facade in non-default profiles. Use `--tool-profile advanced-full` or `RISUTOKI_MCP_TOOL_PROFILE=advanced-full` when a client needs every granular route.

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

The complete profile and coverage contract lives in [`docs/MCP_TOOL_SURFACE.md`](MCP_TOOL_SURFACE.md).

## 3. Artifact Operations

Tool choice, preview/apply guards, bounded reads, and mutation recovery are documented in `skills/using-mcp-tools/SKILL.md`. The profile/coverage matrix lives in [MCP_TOOL_SURFACE.md](MCP_TOOL_SURFACE.md); response contracts live in [MCP_ERROR_CONTRACT.md](MCP_ERROR_CONTRACT.md).

## 4. Startup Without an Active Document

Guidance discovery is independent of document state:

- `list_skills` and `read_skill` work with no active document.
- `load_guidance` works with no active document when the selected profile registers the legacy compatibility facade.
- `inspect_document` works without an active document when the target is session, reference, external, or guidance.
- Document-bound reads and edits still return the structured `No file open` error.

This allows standalone clients to bootstrap project guidance before choosing or opening an artifact.

## 5. Skill Discovery

The generated skill catalog is repository-root scoped:

- Codex: `.agents/skills`
- Claude Code: `.claude/skills`

`npm run sync:skills` rebuilds `.skill-catalog/` from the tracked skill roots and refreshes those two discovery paths. Gemini and GitHub Copilot Skill mirrors are not supported. Subtree routing is handled by the nearest `risu/{scope}/AGENTS.md`, not by separate nested catalogs.

When the client-visible catalog does not already identify the Skill, use `list_skills` with the current `scopes`, a narrow `query`, and `detail: "summary"`. Existing no-argument calls retain the full compatibility view. Use the returned opaque `next_cursor` for catalog pages; `read_skill` uses its own cursor type with `max_bytes` for UTF-8-safe reference paging, and list/read cursors are intentionally not interchangeable.

Without MCP, read the relevant source skill or reference from the filesystem. Missing MCP connectivity does not change an authoring task into repository development. If the generated catalog is missing, `npm run sync:skills` rebuilds it from the tracked roots.
