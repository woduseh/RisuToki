---
name: file-structure-reference
description: 'Reference for RisuAI .charx, .risum, and .risup file structures plus lorebook and regex item schemas. Use when you need exact field names, file-type boundaries, or JSON shapes before reading or writing content.'
tags: ['reference', 'charx', 'risum', 'risup']
related_tools: ['list_fields', 'read_field', 'read_lorebook', 'read_regex']
---

# File Structure Reference

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
