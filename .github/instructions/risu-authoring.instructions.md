# RisuAI Authoring Routing

Use this only when working on RisuAI authoring materials under `risu/`, not when changing the RisuToki product itself.

## Layout

- `risu/common/` — shared syntax/reference for authoring
- `risu/bot/` — `.charx` bot and character composition
- `risu/prompts/` — `.risup` preset and prompt authoring
- `risu/modules/` — `.risum` module authoring
- `risu/plugins/` — RisuAI plugin v3 authoring

## Routing

1. Syntax/domain mechanics first: `risu/common/skills/` and `risu/common/docs/`
2. Artifact composition second: the matching `risu/{artifact}/skills/` and `risu/{artifact}/docs/`
3. Product workflow and MCP routing still live in root `skills/`

Do not assume files under `risu/common/` auto-load by proximity. Use the local `AGENTS.md`, local `README.md`, and `list_skills` / `read_skill` intentionally.
