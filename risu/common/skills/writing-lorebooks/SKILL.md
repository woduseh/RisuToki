---
name: writing-lorebooks
description: 'Use when creating, editing, organizing, or diagnosing lorebook entries, folders, keys, decorators, order, and activation. Primary skill for entry syntax and mechanics; hand bot-level information architecture to authoring-lorebook-bots. Do not use when character/world composition or preset request assembly is the main problem.'
tags: ['lorebook', 'reference', 'syntax']
related_tools:
  [
    'inspect_document',
    'read_content',
    'preview_edit',
    'apply_edit',
    'validate_content',
    'read_lorebook_batch',
    'write_lorebook_batch',
  ]
---

# Writing Lorebook Entries

## Entry contract

`key` holds comma-separated triggers; `comment` is the management name and may be used by Lua lookup; `content` is model-visible and supports CBS; `insertorder` controls relative placement and lower-priority material is cut earlier. Activation also depends on `alwaysActive`, `selective`/`secondkey`, `mode`, `useRegex`, `folder`, and `activationPercent`.

Folder identity lives in the folder entry's normalized `key` (`folder:<uuid>`), not its item ID. Children store that same value in `folder`; use folder-aware tools instead of copying private/raw upstream prefixes. Empty key plus `alwaysActive=false` is useful for Lua-only storage.

## Minimal workflow

1. Define one entry purpose and the scenes in which it should activate.
2. Choose specific multilingual keys users or model output will actually contain. Shared keys are allowed when layered activation is intentional.
3. Keep content concise, non-duplicative, and written for its insertion role.
4. Add only necessary decorators at the top of content. Common controls include `@@depth`, `@@reverse_depth`, `@@role`, `@@position`, message/scan limits, additional/excluded keys, full-word matching, probability, force activation/deactivation, and max-context behavior.
5. Group entries with canonical folder references and preserve identity/guards during edits.
6. Preview or simulate likely chat contexts, then apply and validate focused results.

`normal` entries match keys; `constant`/always-active entries consume context every turn; `multiple` requires its configured matches; `child` and `folder` express hierarchy. Use always-active content sparingly.

At the current RisuAI baseline, token budgeting and cutoff measure CBS-evaluated lore content with mutation disabled. A compact conditional branch can therefore fit differently from its raw source, but lorebook evaluation still must not be used for `setvar`-style side effects.

## Boundaries

CBS syntax belongs to `writing-cbs-syntax`; Lua lookup logic belongs to `writing-lua-scripts`; bot-wide distribution belongs to `authoring-lorebook-bots`. For complete decorator notes, load `risu/common/docs/문법가이드_로어북.md` only when needed.

## Validation

Check dead entries, accidental broad/duplicate triggers, folder integrity, comment references used by Lua, insertion/token priority, decorator support in the chosen runtime, recursive activation loops, and whether conditional content contradicts persistent facts. Use batch reads/writes and current identity or index guards for multi-entry changes.
