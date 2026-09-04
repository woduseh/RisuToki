---
name: file-structure-reference
description: 'Use for exact .charx, .risum, and .risup fields, containers, and export compatibility.'
tags: ['reference', 'charx', 'risum', 'risup']
related_tools: ['inspect_document', 'read_content']
---

# File Structure Reference

## Artifact boundaries

| Extension | Meaning           | Container                                           |
| --------- | ----------------- | --------------------------------------------------- |
| `.charx`  | Character card v3 | ZIP with `card.json`, `module.risum`, and `assets/` |
| `.risum`  | Module            | RPACK binary                                        |
| `.risup`  | Preset            | RPACK containing compressed/encrypted JSON          |

Use structured MCP surfaces rather than editing binary/container internals directly.

## Core surfaces

- `.charx`: `name`, `description`, `firstMessage`, `globalNote`, `css`, `defaultVariables`, `lua`, `alternateGreetings`, `triggerScripts`, `exampleMessage`, creator/version fields, lorebook, regex, and assets. Lua is a bounded view over a primary `triggerlua` effect rather than an independent upstream card field.
- `.risum`: `name`, `description`, `lua`, `backgroundEmbedding`, `lowLevelAccess`, `hideIcon`, `moduleNamespace`, `customModuleToggle`, `mcpUrl`, assets, lorebook, regex, and triggers. `cjs` is reserved/hidden; `moduleId` is read-only; module Lua is likewise exposed through its dedicated view.
- `.risup`: model/provider settings, `promptTemplate`, `formatingOrder`, `customPromptTemplateToggle`, `templateDefaultVariables`, `moduleIntergration`, sampling/reasoning fields, structured-output settings, and advanced provider JSON.

Compatibility/deprecated fields are not normal RisuToki surfaces. Preserve the product's hidden/save-stripped policy rather than routing around it.

## Compatibility invariants

`.charx` exports mirror module lorebook and regex data into `card.json`. Canonical persisted regex bodies are `in` and `out`; `find` and `replace` are convenience aliases. Canonical upstream request-stage type is `editprocess`; RisuToki accepts `editrequest` as an authoring alias and normalizes it on export. Validate export compatibility after external edits, including mirrors, protected fields, asset references, and zero-byte assets.

Lorebook folder identity is the folder entry's normalized `key` (`folder:<uuid>`); child `folder` values use the same key. A lorebook `comment` may be a Lua lookup key, so renaming can break scripts. Exact item fields and mutation rules belong to `writing-lorebooks` and `writing-regex-scripts`.

Load `using-mcp-tools/FILE_STRUCTURES.md` for a complete JSON shape.
