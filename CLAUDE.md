# RisuToki — Claude Code Entry

@AGENTS.md

The imported router above is the single source of truth for Claude Code, Codex, and other assistants. Let it choose one skill, then load that skill with the Skill tool, or with `read_skill` only when you are working through the RisuToki MCP server. Do not preload the catalog.
