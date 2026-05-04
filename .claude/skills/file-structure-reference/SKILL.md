---
name: file-structure-reference
description: 'Reference for RisuAI .charx, .risum, and .risup file structures plus lorebook and regex item schemas. Use when you need exact field names, file-type boundaries, or JSON shapes before reading or writing content.'
tags: ['reference', 'charx', 'risum', 'risup']
related_tools:
  ['list_fields', 'read_field_batch', 'list_lorebook', 'read_lorebook_batch', 'list_regex', 'read_regex_batch']
---

# File Structure Reference

## Agent Operating Contract

- **Use when:** exact `.charx`, `.risum`, `.risup`, lorebook, or regex field names/shapes affect the answer or edit route.
- **Do not use when:** the task is creative composition, prose revision, or UI design with no schema uncertainty.
- **Read first:** this `SKILL.md`; it is intentionally a compact schema map.
- **Load deeper only if:** `using-mcp-tools` points to `FILE_STRUCTURES.md` for MCP route selection or an artifact-specific skill needs format details.
- **Output/validation contract:** cite the relevant field shape and choose the narrowest dedicated MCP surface before proposing or making edits.

Use this skill when you need the **shape of the data**, not the editing workflow.

> For tool choice and safe mutation patterns, read `using-mcp-tools`.

## File Types

| Extension | Meaning           | Container                                      |
| --------- | ----------------- | ---------------------------------------------- |
| `.charx`  | Character card v3 | ZIP (`card.json` + `module.risum` + `assets/`) |
| `.risum`  | Module            | RPACK binary                                   |
| `.risup`  | Preset            | RPACK + compressed/encrypted JSON              |

## charx Core Fields

| Field                | Purpose                     |
| -------------------- | --------------------------- |
| `name`               | Character name              |
| `description`        | Main character description  |
| `firstMessage`       | First visible greeting      |
| `globalNote`         | Post-history instruction    |
| `css`                | Background HTML/CSS surface |
| `defaultVariables`   | CBS default variables       |
| `lua`                | Lua trigger script source   |
| `alternateGreetings` | Additional greeting array   |
| `triggerScripts`     | Structured trigger data     |
| `creatorcomment`     | Creator note                |
| `characterVersion`   | Character version           |

## risum Core Fields

| Field                 | Purpose                            |
| --------------------- | ---------------------------------- |
| `name`                | Module name                        |
| `description`         | Module description                 |
| `cjs`                 | CommonJS code                      |
| `lua`                 | Lua trigger script source          |
| `backgroundEmbedding` | Shared HTML/CSS background surface |
| `lowLevelAccess`      | Enables restricted Lua APIs        |
| `moduleNamespace`     | Module namespace                   |
| `moduleId`            | Read-only module UUID              |

## risup Core Groups

| Group                       | Examples                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Model                       | `aiModel`, `subModel`, `apiType`                                                             |
| Prompt                      | `promptTemplate`, `formatingOrder`, `customPromptTemplateToggle`, `templateDefaultVariables` |
| Legacy prompt compatibility | `mainPrompt`, `jailbreak`, `globalNote`, `JinjaTemplate`                                     |
| Sampling                    | `temperature`, `top_p`, `top_k`, `repetition_penalty`                                        |
| Reasoning                   | `reasonEffort`, `thinkingTokens`, `thinkingType`                                             |
| JSON schema                 | `jsonSchemaEnabled`, `jsonSchema`, `strictJsonSchema`                                        |

## Lorebook Item Shape

```json
{
  "key": "keyword1, keyword2",
  "comment": "Management name",
  "content": "Prompt text sent to the AI",
  "mode": "normal",
  "insertorder": 100,
  "alwaysActive": false,
  "secondkey": "",
  "selective": false,
  "useRegex": false,
  "folder": "folder:uuid",
  "activationPercent": 100,
  "id": "uuid"
}
```

### Lorebook Notes

- Folder identity is tracked by the folder entry's **`key`** in `folder:UUID` form.
- Child entries store that same canonical `folder:UUID` in their `folder` field.
- `comment` is often part of Lua lookup flows, so renaming it can break scripts.

## Regex Item Shape

```json
{
  "comment": "Script name",
  "type": "editdisplay",
  "find": "pattern",
  "replace": "replacement",
  "flag": "gi",
  "ableFlag": true
}
```

### Regex Types

| Type          | Stage                                  |
| ------------- | -------------------------------------- |
| `editinput`   | Before user input is sent              |
| `editoutput`  | After AI output, before storing        |
| `editdisplay` | During rendering only                  |
| `editrequest` | After prompt assembly, before API send |

## Related Skills

| Skill                   | Relationship                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `writing-lorebooks`     | Lorebook entry field shapes are documented here; editing workflow in `writing-lorebooks`            |
| `writing-regex-scripts` | Regex item field shapes are documented here; scripting workflow in `writing-regex-scripts`          |
| `writing-lua-scripts`   | Lua accesses fields documented here via API functions                                               |
| `writing-html-css`      | HTML/CSS fields like `backgroundEmbedding` are documented here; styling rules in `writing-html-css` |

## Smoke Tests

| Prompt                                                                     | Expected routing                                                                              | Expected output                         | Forbidden behavior                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| "What fields does a lorebook entry have? Show me the complete JSON shape." | Primary: `file-structure-reference`; load `writing-lorebooks` only for editing workflow.      | Lorebook item shape and field meanings. | Recommending generic writes as the default edit route.         |
| "What's the difference between `.charx`, `.risum`, and `.risup`?"          | Primary: `file-structure-reference`.                                                          | File-type boundary summary.             | Loading composition skills before a target artifact is chosen. |
| "List all regex script item fields and explain them."                      | Primary: `file-structure-reference`; load `writing-regex-scripts` only for behavior patterns. | Regex item schema.                      | Treating schema lookup as a full regex authoring task.         |
