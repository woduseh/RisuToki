# Module Fields Reference

> Verified against RisuAI `2026.8.250`, commit `984f46b7306ca38312a043e0ef28d447f2a92766`, on 2026-08-31.
> Canonical sources: RisuAI `src/ts/process/modules.ts`, `src/ts/process/processzip.ts`, `src/ts/interchangeability.ts`, `src/ts/characterCards.ts`, and RisuToki `src/charx-io.ts`.
> If this document and source diverge, the TypeScript wins.

## `RisuModule` interface

| Field                 | Type                         | Default     | Description                                                     |
| --------------------- | ---------------------------- | ----------- | --------------------------------------------------------------- |
| `name`                | `string`                     | —           | Display name                                                    |
| `description`         | `string`                     | —           | User-facing description                                         |
| `id`                  | `string`                     | UUID        | Unique identifier                                               |
| `lorebook`            | `loreBook[]`                 | `[]`        | Lorebook entries merged at runtime                              |
| `regex`               | `customscript[]`             | `[]`        | Regex replacement scripts                                       |
| `trigger`             | `triggerscript[]`            | `[]`        | Trigger scripts                                                 |
| `cjs`                 | `string`                     | `""`        | Reserved CommonJS slot; hidden in normal editor/MCP surfaces    |
| `lowLevelAccess`      | `boolean`                    | `false`     | Enables restricted Lua/network/LLM capabilities                 |
| `hideIcon`            | `boolean`                    | `false`     | Hides the character icon in chat                                |
| `backgroundEmbedding` | `string`                     | `""`        | HTML/CSS injected into `.chattext`                              |
| `namespace`           | `string`                     | `undefined` | Alias ID for grouped module loading                             |
| `customModuleToggle`  | `string`                     | `""`        | Toggle UI definition text                                       |
| `assets`              | `[string, string, string][]` | `[]`        | `[name, dataUrl, hash]` tuples                                  |
| `mcp`                 | `{ url: string }`            | `undefined` | External MCP endpoint; managed separately/read-only in RisuToki |
| `icon`                | `string`                     | `undefined` | Module icon/image data preserved by character↔module conversion |

RisuToki hides `cjs` from normal editing surfaces and strips it on save. RisuToki also preserves `mcp.url` as `mcpUrl`, but treats it as read-only because MCP modules are managed separately from normal module authoring. New module runtime logic should use Lua triggers and supported module fields instead.

## Field behavior notes

### `namespace`

If a module declares `namespace: "abc"` and another enabled module has `id: "abc"`, both load together.

- Multiple modules may share the same `namespace`.
- This is useful for optional sub-packs that should activate with a parent module ID.

### `lowLevelAccess`

When `true`, triggers/Lua in the module gain restricted capabilities such as network/LLM calls and reduced recursion limits.

- Importing such a module triggers a user confirmation in RisuAI.
- The flag is module-wide, not per-trigger.

### `backgroundEmbedding`

- Injected into `.chattext`
- CBS is evaluated inside the embedding
- Multiple active modules concatenate their embeddings
- Use unique module-specific source class names to avoid collisions; RisuAI adds `x-risu-` prefixes at render time

### `customModuleToggle`

One declaration per line:

```text
darkMode=Dark mode
difficulty=Difficulty=select=easy,normal,hard
playerName=Player name=text
=Gameplay=group
=Section Break=divider
```

RisuToki opens this field in the shared visual/raw toggle editor used for `.risup` custom prompt template toggles, while preserving the stored line syntax.

Supported shapes:

| Format                       | Meaning                |
| ---------------------------- | ---------------------- |
| `key=Label`                  | checkbox/toggle        |
| `key=Label=text`             | single-line text input |
| `key=Label=select=opt1,opt2` | dropdown               |
| `=Label=group`               | group heading          |
| `=Label=divider`             | divider                |

## Shared sub-types

Full JSON shapes live in `file-structure-reference`. Summaries below are for module context only.

### Lorebook entry

```json
{
  "key": "keyword1, keyword2",
  "secondkey": "",
  "comment": "Entry name",
  "content": "Injected text",
  "mode": "normal",
  "insertorder": 100,
  "alwaysActive": false,
  "selective": false,
  "folder": "",
  "id": "uuid"
}
```

### Regex entry

```json
{
  "comment": "Script name",
  "in": "regex pattern",
  "out": "replacement",
  "type": "editinput",
  "flag": "g",
  "ableFlag": true
}
```

### Trigger entry

```json
{
  "comment": "Trigger name",
  "type": "output",
  "conditions": [],
  "effect": []
}
```

Lua lives inside trigger effects, typically as:

```json
{ "type": "triggerlua", "code": "-- Lua 5.4 source" }
```

## Merge order

### Lorebooks

```text
Character globalLore → Chat localLore → Module lorebooks
```

Module lorebooks are appended after character/chat sources. Duplicate keys are not deduplicated automatically.

### Regex

```text
Preset regex → Character customscript → Module regex
```

This makes modules a good fit for post-processing or display-layer transforms.

### Triggers

```text
Character triggerscript → Module triggers
```

## Enable scopes

Module IDs can be enabled from:

1. `db.enabledModules`
2. `currentChat.modules`
3. `character.modules`
4. `db.moduleIntergration`

`db.moduleIntergration` is a comma-separated string.

## MCP field aliases in RisuToki

| RisuToki field    | Upstream field           | Notes                                  |
| ----------------- | ------------------------ | -------------------------------------- |
| `moduleId`        | `id`                     | read-only in most flows                |
| `moduleNamespace` | `namespace`              | same value, renamed for editor clarity |
| `lua`             | first primary Lua effect | exposed through dedicated Lua tools    |

## `.risum` binary format

```text
Byte 0      : 0x6F (magic)
Byte 1      : 0x00 (version)
Bytes 2-5   : UInt32LE payload length
Bytes 6-N   : RPack-compressed JSON payload { type: "risuModule", module: RisuModule }
... asset blocks ...
Byte        : 0x00 end marker
```

On import, RisuAI assigns a fresh UUID and prompts for confirmation when `lowLevelAccess` is enabled.

## Character conversion compatibility

Character↔module conversion preserves `icon`, `namespace`, `hideIcon`, `backgroundEmbedding`, `assets`, and `customModuleToggle`. Character global-note replacement is encoded as a constant lore entry beginning with `@@indicator replace_global_note`. Import also accepts the legacy `@@indicator phi` marker, but new output should use `replace_global_note`.
