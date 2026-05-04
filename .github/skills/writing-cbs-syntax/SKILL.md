---
name: writing-cbs-syntax
description: 'Provides the complete reference for RisuAI Custom Bracket Syntax (CBS). Covers 170+ template tags including variables, conditionals, loops, math, arrays, assets, buttons, and character data access. Use when writing or editing CBS expressions in charx description, firstMessage, lorebook content, globalNote, backgroundEmbedding, or any CBS-enabled field.'
tags: ['cbs', 'syntax', 'prompting']
related_tools: ['validate_cbs', 'list_cbs_toggles', 'simulate_cbs', 'diff_cbs']
---

# CBS — Custom Bracket Syntax

## Agent Operating Contract

- **Use when:** CBS syntax, toggles, variables, conditionals, loops, or runtime visibility affect the requested edit or diagnosis.
- **Do not use when:** the task is general prompt prose, lorebook structure without CBS, Lua code, or HTML/CSS styling without template tags.
- **Read first:** this `SKILL.md`; it is the quick-reference and gotcha layer.
- **Load deeper only if:** a tag is not listed here, exact aliases matter, or you need the closed 170+ tag catalog in `REFERENCE.md`.
- **Output/validation contract:** preserve literal CBS syntax, validate braces/nesting, state whether a tag is model-visible or display-only, and use `validate_cbs`/`simulate_cbs` when available.

CBS is `{{tag::arg1::arg2}}` template syntax evaluated at runtime in RisuAI. Tags can nest: `{{calc::{{getvar::hp}}+10}}`. Unknown tags are left as literal text, so use the closed tag catalog in `REFERENCE.md`.

Source-grounded areas: tag registration and parser/runVar behavior are checked against `Risuai/src/ts/cbs.ts` and `Risuai/src/ts/parser/parser.svelte.ts`.

**Where it works:** `description`, `personality`, `scenario`, `exampleMessage`, `firstMessage`, persona, `mainPrompt`, `jailbreak`, `globalNote`, `authornote`, lorebook content, `backgroundEmbedding`, `alternateGreetings`, regex `replace` (OUT), `defaultVariables`, triggers/modules, chat input, and any field that runs through the CBS parser.

**Evaluation order:** Inner `{{...}}` tags resolve first (inside-out), then outer tags consume the result. Everything is a string; booleans are `"1"`/`"0"` and arrays/objects are JSON strings.

> Full 170+ tag catalog → see **REFERENCE.md** in this directory.

---

## Quick Reference — Essential Tags

| Tag             | Syntax                           | Description                                          |
| --------------- | -------------------------------- | ---------------------------------------------------- |
| `char`          | `{{char}}`                       | Current character name (nickname preferred)          |
| `user`          | `{{user}}`                       | Current user name                                    |
| `getvar`        | `{{getvar::name}}`               | Read chat-scoped variable                            |
| `setvar`        | `{{setvar::name::val}}`          | Write chat-scoped variable (**runVar** context only) |
| `addvar`        | `{{addvar::name::n}}`            | Add number to variable (**runVar**)                  |
| `setdefaultvar` | `{{setdefaultvar::name::val}}`   | Set only if undefined (**runVar**)                   |
| `getglobalvar`  | `{{getglobalvar::name}}`         | Read global variable (shared across chats)           |
| `calc`          | `{{calc::2+3*4}}`                | Arithmetic expression → `14`                         |
| `random`        | `{{random::A::B::C}}`            | Random pick from args                                |
| `roll`          | `{{roll::2d6}}`                  | Dice roll (sum)                                      |
| `#when`         | `{{#when::…}}…{{/when}}`         | Conditional block                                    |
| `#each`         | `{{#each [arr] as x}}…{{/each}}` | Loop over array                                      |
| `makearray`     | `{{makearray::a::b::c}}`         | Create JSON array                                    |
| `arrayelement`  | `{{arrayelement::[arr]::idx}}`   | Get element by index                                 |
| `arraylength`   | `{{arraylength::[arr]}}`         | Array length                                         |
| `asset`         | `{{asset::name}}`                | Display asset (image/audio)                          |
| `button`        | `{{button::Label::triggerName}}` | Clickable button → Lua trigger                       |
| `equal`         | `{{equal::A::B}}`                | `1` if equal, else `0`                               |
| `replace`       | `{{replace::str::find::repl}}`   | String replace (all matches)                         |
| `contains`      | `{{contains::str::sub}}`         | `1` if substring found                               |
| `lastmessage`   | `{{lastmessage}}`                | Last chat message (any role)                         |
| `metadata`      | `{{metadata::version}}`          | RisuAI/runtime/model metadata                        |
| `position`      | `{{position::name}}`             | Position marker for `@@position name` decorators     |
| `description`   | `{{description}}`                | Character description field                          |
| `personality`   | `{{personality}}`                | Character personality field                          |
| `time`          | `{{time}}`                       | Current local time `H:M:S`                           |
| `date`          | `{{date::YYYY-MM-DD}}`           | Formatted date                                       |
| `br`            | `{{br}}`                         | Newline                                              |
| `blank`         | `{{blank}}`                      | Empty string                                         |

---

## Variables

### Chat-scoped (persistent per chat session)

```
{{getvar::hp}}                → read
{{setvar::hp::100}}           → write (requires runVar context)
{{addvar::hp::-10}}           → decrement by 10
{{setdefaultvar::hp::100}}    → set only if hp is undefined
```

### Global (shared across all chats)

```
{{getglobalvar::playerClass}}
```

### Temporary (current CBS evaluation only)

```
{{settempvar::temp::hello}}
{{tempvar::temp}}             → "hello" (gone after evaluation)
{{return::value}}             → set return value and stop
```

### runVar Context

`setvar`, `addvar`, and `setdefaultvar` only execute when the caller runs CBS with **runVar** enabled. In current upstream prompt flow, that is explicitly used while parsing current chat messages during generation. Do not assume lorebook content, first messages, or display-only rendering can mutate variables unless the specific caller/tool confirms runVar.

When runVar is not enabled, variable-write tags produce no mutation and may return no visible output. If variables are not updating, first verify the evaluation surface before changing the CBS expression.

---

## Control Flow

### Conditionals (#when)

```
{{#when::{{getvar::hp}}::<::20}}
  *Character is badly wounded.*
{{:else}}
  *Character looks healthy.*
{{/when}}
```

**Operators:** `is`, `isnot`, `>`, `<`, `>=`, `<=`, `and`, `or`, `not`, `keep`, `legacy`

**Variable shortcuts:**

- `{{#when::var::hp}}` — true if variable `hp` exists
- `{{#when::hp::vis::0}}` — true if variable `hp` equals `0`
- `{{#when::hp::visnot::0}}` — true if variable `hp` does NOT equal `0`
- `{{#when::toggle::nsfw}}` — true if global toggle `nsfw` is enabled
- `{{#when::nsfw::tis::on}}` / `{{#when::nsfw::tisnot::off}}` — compare toggle values

### Inline expression (? operator)

```
{{? hp>10}}        → 1 or 0 (evaluates as expression)
{{? 1+2}}          → 3
```

### Loops (#each)

```
{{#each {{getvar::inventory}} as item}}
  - {{slot::item}}
{{/each}}
```

The array argument must be a JSON array (string `["a","b","c"]`). Use `{{makearray::…}}` or `{{getvar::…}}` that holds an array.

### Functions and code blocks

```
{{#func status name}}
  {{return::Status for {{tempvar::name}}: {{getvar::status}}}}
{{/func}}

{{#code}}
  Whitespace and escape sequences are normalized here.
{{/code}}
```

`#if`, `#if_pure`, and `#pure` still parse for compatibility but are deprecated. Prefer `#when`, `#when::keep::...`, and `#puredisplay`.

### Comments

```
{{// This is a comment — produces no output}}
```

### Escape blocks

```
{{#escape}}CBS tags here are NOT parsed{{/escape}}
{{#puredisplay}}Raw display without CBS{{/puredisplay}}
```

---

## Arrays & Objects

```
{{makearray::sword::shield::potion}}           → ["sword","shield","potion"]
{{makedict::name=John::age=25}}                → {"name":"John","age":"25"}

{{arrayelement::[arr]::0}}                     → first element
{{dictelement::{obj}::name}}                   → value by key
{{element::{nested}::path1::path2}}            → deep access

{{arraypush::[arr]::newItem}}                  → append
{{arraysplice::[arr]::1::1::replacement}}      → splice
{{filter::[arr]::nonempty}}                    → remove empty strings
{{range::[5]}}                                 → [0,1,2,3,4]
```

---

## Metadata and Display-Only Tags

```
{{metadata::version}}       → RisuAI version
{{metadata::modelname}}     → current model display name
{{metadata::risutype}}      → local | node | web
{{position::persona_slot}}  → marker for @@position persona_slot
{{inlayeddata::image-id}}   → image markup that can be included in multimodal request data
```

Display-oriented tags such as `asset`, `emotion`, `audio`, `bg`, `bgm`, `video`, `image`, `img`, `button`, `risu`, `comment`, `tex`, `ruby`, `codeblock`, `inlay`, and `inlayed` are for rendered UI. Do not rely on them to shape model-visible prompt text unless the reference explicitly says they are request-visible (notably `inlayeddata`).

---

## Practical Examples

### Status display in globalNote

```
[Character Status]
HP: {{getvar::hp}}/{{getvar::max_hp}}
Level: {{getvar::level}}
EXP: {{calc::{{getvar::exp}}/{{getvar::max_exp}}*100}}%
```

### Dice-based combat in lorebook

```
{{setvar::damage::{{roll::2d6}}}}
Attack damage: {{getvar::damage}}
Remaining HP: {{calc::{{getvar::enemy_hp}}-{{getvar::damage}}}}
{{setvar::enemy_hp::{{calc::{{getvar::enemy_hp}}-{{getvar::damage}}}}}}
```

### Conditional greeting in firstMessage

```
{{setdefaultvar::visits::0}}
{{addvar::visits::1}}
{{#when::{{getvar::visits}}::is::1}}
*{{char}} notices you for the first time.*
"Welcome, {{user}}. I've been expecting someone."
{{:else}}
*{{char}} nods in recognition.*
"Back again, {{user}}? That makes {{getvar::visits}} visits."
{{/when}}
```

### Inventory management with arrays

```
{{setdefaultvar::inventory::{{makearray}}}}
{{#when::{{contains::{{getvar::inventory}}::potion}}::is::1}}
  You have a potion available.
  {{button::Use Potion::usePotion}}
{{:else}}
  No potions remaining.
{{/when}}
```

---

## Critical Gotchas

| Issue                                                   | Detail                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Inside-out nesting**                                  | `{{calc::{{getvar::a}}+{{getvar::b}}}}` — inner `getvar` resolves first, then `calc` runs on the result.              |
| **`setvar`/`addvar` silently fail in display contexts** | Write operations do nothing in display-only evaluation. If variables aren't updating, check the evaluation context.   |
| **Comparisons return `"1"`/`"0"` strings**              | Not booleans. `{{equal::a::a}}` → `"1"`. Use with `#when` or `and`/`or`, not as raw values.                           |
| **`#when` truthiness**                                  | Literal `"1"` and `"true"` are truthy. Empty strings and `"0"` are false.                                             |
| **`pick` vs `random`**                                  | `pick` is hash-based (deterministic per message, stable on refresh). `random` is truly random (changes every render). |
| **`::` is the separator**                               | To output a literal `:`, use `{{:}}`. For `{` and `}`, use `{{decbo}}` and `{{decbc}}`.                               |
| **Array format**                                        | Arrays are JSON strings: `["a","b"]`. Most array functions accept both `[bracketed]` JSON and variadic `::` args.     |
| **Empty string = falsy**                                | In `#when`: `{{#when::}}` is false. `{{#when::0}}` is also false.                                                     |
| **Display-only output**                                 | HTML/media tags are usually render-time UI, not clean prompt text. Use plain text for model instructions.             |

> **Complete tag reference** with all 170+ tags, aliases, and descriptions → **REFERENCE.md**

## Related Skills

| Skill                   | Relationship                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `writing-html-css`      | CBS tags work inside HTML attributes and content in `backgroundEmbedding` and lorebook entries |
| `writing-regex-scripts` | CBS is used in regex OUT fields; requires `<cbs>` flag in the find field                       |
| `writing-lorebooks`     | Lorebook `content` fields support full CBS syntax for dynamic context injection                |

## Smoke Tests

| Prompt                                                   | Expected routing                                                                       | Expected output                                    | Forbidden behavior                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| "Fix this broken `{{#when}}` block in a lorebook entry." | Primary: `writing-cbs-syntax`; pair with `writing-lorebooks` only for entry placement. | Corrected CBS with validation notes.               | Loading `REFERENCE.md` before checking the quick-reference/gotchas. |
| "Rename this preset toggle and update references."       | Primary: `writing-risup-presets`; load this skill for CBS reference updates.           | Toggle migration plan plus updated CBS references. | Renaming the toggle without scanning CBS-bearing fields.            |
