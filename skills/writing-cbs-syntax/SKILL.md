---
name: writing-cbs-syntax
description: 'Provides the complete reference for RisuAI Custom Bracket Syntax (CBS). Covers 130+ template tags including variables, conditionals, loops, math, arrays, assets, buttons, and character data access. Use when writing or editing CBS expressions in charx description, firstMessage, lorebook content, globalNote, backgroundEmbedding, or any CBS-enabled field.'
---

# CBS — Custom Bracket Syntax

CBS is `{{tag::arg1::arg2}}` template syntax evaluated at runtime in RisuAI. Tags can nest: `{{calc::{{getvar::hp}}+10}}`.

**Where it works:** `firstMessage`, `description`, `globalNote`, `lorebook content`, `backgroundEmbedding`, `alternateGreetings`, regex `replace` (OUT), `defaultVariables`, and any field that runs through the CBS parser.

**Evaluation order:** Inner `{{…}}` tags resolve first (inside-out), then outer tags consume the result.

> Full 130+ tag catalog → see **REFERENCE.md** in this directory.

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

`setvar`, `addvar`, and `setdefaultvar` only execute in **runVar** contexts:

- Lorebook content when `mode: "normal"` or `mode: "constant"` and the entry activates
- `firstMessage` on initial greeting
- `defaultVariables` field (always runs on chat init)
- Regex `replace` with `editoutput` or `editinput` type

They are **silently ignored** in display-only contexts (e.g., `editdisplay` regex, pure rendering).

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

**Operators:** `is`, `isnot`, `>`, `<`, `>=`, `<=`, `and`, `or`, `not`

**Variable shortcuts:**

- `{{#when::var::hp}}` — true if variable `hp` exists
- `{{#when::hp::vis::0}}` — true if variable `hp` equals `0`
- `{{#when::hp::visnot::0}}` — true if variable `hp` does NOT equal `0`

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

## Key Gotchas

1. **Nesting:** CBS evaluates inside-out. `{{calc::{{getvar::a}}+{{getvar::b}}}}` — inner `getvar` resolves first, then `calc` runs on the result.

2. **runVar vs display:** `setvar`/`addvar` silently do nothing in display-only contexts. If variables aren't updating, check the evaluation context.

3. **Comparisons return `1`/`0`:** Not booleans. `{{equal::a::a}}` → `"1"` (string). Use with `#when` or `and`/`or`.

4. **`pick` vs `random`:** `pick` is hash-based (deterministic per message — stable on page refresh). `random` is truly random (changes on every render).

5. **`::` is the separator.** To output a literal `:` inside CBS, use `{{:}}`. For `{` and `}`, use `{{decbo}}` and `{{decbc}}`.

6. **Array format:** Arrays in CBS are JSON strings: `["a","b"]`. Most array functions accept both `[bracketed]` JSON and variadic `::` args.

7. **Empty string = falsy** in `#when`. `{{#when::}}` is false. `{{#when::0}}` is also false.

> **Complete tag reference** with all 130+ tags, aliases, and descriptions → **REFERENCE.md**
