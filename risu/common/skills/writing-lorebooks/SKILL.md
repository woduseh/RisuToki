---
name: writing-lorebooks
description: 'Use for lorebook entry fields, folders, keys, decorators, order, and activation.'
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

Decorators go at the top of content. Controls include `@@depth`, `@@reverse_depth`, `@@role`, `@@position`, message/scan limits, additional/excluded keys, full-word matching, probability, force activation/deactivation, and max-context behavior. Shared activation keys can intentionally load several entries.

`normal` entries match keys; `constant`/always-active entries consume context every turn; `multiple` requires its configured matches; `child` and `folder` express hierarchy. Use always-active content sparingly.

At the current RisuAI baseline, token budgeting and cutoff measure CBS-evaluated lore content with mutation disabled. A compact conditional branch can therefore fit differently from its raw source, but lorebook evaluation still must not be used for `setvar`-style side effects.

## Boundaries

CBS syntax belongs to `writing-cbs-syntax`; Lua lookup logic belongs to `writing-lua-scripts`; bot-wide distribution belongs to `authoring-bots`. For complete decorator notes, load `risu/common/docs/문법가이드_로어북.md` only when needed.
