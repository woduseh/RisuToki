# CBS Complete Tag Reference

Full catalog of 170+ CBS tags organized by category. For quick-start guide, see **SKILL.md**.

---

## 1. Character/User Tokens

| Tag          | Aliases     | Syntax           | Description                                               |
| ------------ | ----------- | ---------------- | --------------------------------------------------------- |
| `char`       | `bot`       | `{{char}}`       | Current character name (nickname takes priority)          |
| `user`       | —           | `{{user}}`       | Current user name                                         |
| `trigger_id` | `triggerid` | `{{trigger_id}}` | `risu-id` attribute of clicked element (`"null"` if none) |

---

## 2. Chat Message Access

| Tag                | Aliases            | Syntax                 | Description                  |
| ------------------ | ------------------ | ---------------------- | ---------------------------- |
| `previouscharchat` | `lastcharmessage`  | `{{previouscharchat}}` | Last character message       |
| `previoususerchat` | `lastusermessage`  | `{{previoususerchat}}` | Last user message            |
| `lastmessage`      | —                  | `{{lastmessage}}`      | Last message (any role)      |
| `lastmessageid`    | `lastmessageindex` | `{{lastmessageid}}`    | Last message index (0-based) |

---

## 3. Character Field Access

| Tag               | Aliases                              | Syntax                | Description                 |
| ----------------- | ------------------------------------ | --------------------- | --------------------------- |
| `personality`     | `charpersona`                        | `{{personality}}`     | Character personality field |
| `description`     | `chardesc`                           | `{{description}}`     | Character description field |
| `scenario`        | —                                    | `{{scenario}}`        | Scenario field              |
| `exampledialogue` | `examplemessage`, `example_dialogue` | `{{exampledialogue}}` | Example dialogue field      |

---

## 4. Prompt/System Info

| Tag          | Aliases                       | Syntax           | Description                     |
| ------------ | ----------------------------- | ---------------- | ------------------------------- |
| `persona`    | `userpersona`                 | `{{persona}}`    | User persona text               |
| `mainprompt` | `systemprompt`, `main_prompt` | `{{mainprompt}}` | Main system prompt              |
| `jb`         | `jailbreak`                   | `{{jb}}`         | Jailbreak prompt                |
| `globalnote` | `systemnote`, `ujb`           | `{{globalnote}}` | Global note (always sent to AI) |
| `authornote` | `author_note`                 | `{{authornote}}` | Author note (current chat)      |

---

## 5. Lorebook/History

| Tag           | Aliases                        | Syntax                               | Description                                                     |
| ------------- | ------------------------------ | ------------------------------------ | --------------------------------------------------------------- |
| `lorebook`    | `worldinfo`                    | `{{lorebook}}`                       | Active lorebook entries (JSON array)                            |
| `userhistory` | `usermessages`, `user_history` | `{{userhistory}}`                    | All user messages (JSON array)                                  |
| `charhistory` | `charmessages`, `char_history` | `{{charhistory}}`                    | All character messages (JSON array)                             |
| `history`     | `messages`                     | `{{history}}` or `{{history::role}}` | Full chat (JSON). With `role` arg: adds role prefix per message |

---

## 6. Persistent Variables (Chat Scope)

These variables persist across messages within one chat session.

| Tag             | Aliases | Syntax                             | Description                                | Requires runVar |
| --------------- | ------- | ---------------------------------- | ------------------------------------------ | --------------- |
| `getvar`        | —       | `{{getvar::name}}`                 | Read chat variable                         | No              |
| `setvar`        | —       | `{{setvar::name::value}}`          | Write chat variable                        | **Yes**         |
| `addvar`        | —       | `{{addvar::name::number}}`         | Add number to variable                     | **Yes**         |
| `setdefaultvar` | —       | `{{setdefaultvar::name::default}}` | Set only if undefined                      | **Yes**         |
| `getglobalvar`  | —       | `{{getglobalvar::name}}`           | Read global variable (shared across chats) | No              |

> **runVar context:** `setvar`, `addvar`, and `setdefaultvar` only execute when the caller runs CBS with runVar enabled. In current upstream prompt flow this is explicit for current chat message parsing during generation; do not assume lorebook, first-message, regex, or display-only surfaces mutate variables without verifying the caller.

---

## 7. Temporary Variables (Script Scope)

Exist only during current CBS evaluation pass. Gone afterward.

| Tag          | Aliases      | Syntax                        | Description                      |
| ------------ | ------------ | ----------------------------- | -------------------------------- |
| `tempvar`    | `gettempvar` | `{{tempvar::name}}`           | Read temp variable               |
| `settempvar` | —            | `{{settempvar::name::value}}` | Write temp variable              |
| `return`     | —            | `{{return::value}}`           | Set return value and stop script |

---

## 8. Math Operations

| Tag       | Aliases     | Syntax                  | Description                           | Example                           |
| --------- | ----------- | ----------------------- | ------------------------------------- | --------------------------------- |
| `calc`    | —           | `{{calc::expr}}`        | Arithmetic (+, -, \*, /, parentheses) | `{{calc::2+3*4}}` → `14`          |
| `round`   | —           | `{{round::n}}`          | Round to nearest integer              | `{{round::3.7}}` → `4`            |
| `floor`   | —           | `{{floor::n}}`          | Floor (round down)                    | `{{floor::3.9}}` → `3`            |
| `ceil`    | —           | `{{ceil::n}}`           | Ceiling (round up)                    | `{{ceil::3.1}}` → `4`             |
| `abs`     | —           | `{{abs::n}}`            | Absolute value                        | `{{abs::-5}}` → `5`               |
| `remaind` | —           | `{{remaind::A::B}}`     | Modulo (A % B)                        | `{{remaind::10::3}}` → `1`        |
| `pow`     | —           | `{{pow::base::exp}}`    | Exponentiation                        | `{{pow::2::3}}` → `8`             |
| `fixnum`  | `fixnumber` | `{{fixnum::n::digits}}` | Fixed decimal places                  | `{{fixnum::3.14159::2}}` → `3.14` |

---

## 9. Comparison Operations

All comparisons return `1` (true) or `0` (false) as strings.

| Tag            | Aliases         | Syntax                   | Description |
| -------------- | --------------- | ------------------------ | ----------- |
| `equal`        | —               | `{{equal::A::B}}`        | A == B      |
| `notequal`     | `not_equal`     | `{{notequal::A::B}}`     | A != B      |
| `greater`      | —               | `{{greater::A::B}}`      | A > B       |
| `less`         | —               | `{{less::A::B}}`         | A < B       |
| `greaterequal` | `greater_equal` | `{{greaterequal::A::B}}` | A >= B      |
| `lessequal`    | `less_equal`    | `{{lessequal::A::B}}`    | A <= B      |

---

## 10. Logic Operations

| Tag   | Aliases | Syntax             | Description                            |
| ----- | ------- | ------------------ | -------------------------------------- |
| `and` | —       | `{{and::A::B}}`    | `1` if both are `1`                    |
| `or`  | —       | `{{or::A::B}}`     | `1` if either is `1`                   |
| `not` | —       | `{{not::A}}`       | Invert (`1`→`0`, anything else→`1`)    |
| `all` | —       | `{{all::A::B::C}}` | `1` if all are `1`. Also accepts array |
| `any` | —       | `{{any::A::B::C}}` | `1` if any is `1`. Also accepts array  |

---

## 11. String Manipulation

| Tag          | Aliases | Syntax                         | Description                      |
| ------------ | ------- | ------------------------------ | -------------------------------- |
| `replace`    | —       | `{{replace::str::find::repl}}` | Replace all occurrences          |
| `split`      | —       | `{{split::str::delim}}`        | Split → JSON array               |
| `join`       | —       | `{{join::[arr]::delim}}`       | Join array with delimiter        |
| `spread`     | —       | `{{spread::[arr]}}`            | Join array with `::` separator   |
| `trim`       | —       | `{{trim::str}}`                | Trim leading/trailing whitespace |
| `length`     | —       | `{{length::str}}`              | Character count                  |
| `startswith` | —       | `{{startswith::str::prefix}}`  | `1`/`0` prefix check             |
| `endswith`   | —       | `{{endswith::str::suffix}}`    | `1`/`0` suffix check             |
| `contains`   | —       | `{{contains::str::sub}}`       | `1`/`0` substring check          |
| `lower`      | —       | `{{lower::str}}`               | Lowercase                        |
| `upper`      | —       | `{{upper::str}}`               | Uppercase                        |
| `capitalize` | —       | `{{capitalize::str}}`          | Capitalize first letter          |
| `tonumber`   | —       | `{{tonumber::str}}`            | Extract numeric value            |
| `reverse`    | —       | `{{reverse::str}}`             | Reverse string                   |

---

## 12. Array/Object Manipulation

### Creation

| Tag         | Aliases                                  | Syntax                                   | Description                                           |
| ----------- | ---------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `makearray` | `array`, `a`                             | `{{makearray::a::b::c}}`                 | Create array `["a","b","c"]`                          |
| `makedict`  | `dict`, `d`, `makeobject`, `object`, `o` | `{{makedict::name=John::age=25}}`        | Create object `{"name":"John","age":"25"}`            |
| `range`     | —                                        | `{{range::[5]}}` or `{{range::[2,8,2]}}` | Number range. `[5]`→`[0,1,2,3,4]`, `[start,end,step]` |

### Access

| Tag            | Aliases         | Syntax                              | Description                                 |
| -------------- | --------------- | ----------------------------------- | ------------------------------------------- |
| `arrayelement` | —               | `{{arrayelement::[arr]::index}}`    | Get element by index                        |
| `dictelement`  | `objectelement` | `{{dictelement::{obj}::key}}`       | Get value by key                            |
| `element`      | `ele`           | `{{element::{nested}::path::path}}` | Deep nested access (multiple path segments) |
| `arraylength`  | —               | `{{arraylength::[arr]}}`            | Array length                                |

### Modification

| Tag            | Aliases                       | Syntax                                      | Description                         |
| -------------- | ----------------------------- | ------------------------------------------- | ----------------------------------- |
| `arraypush`    | —                             | `{{arraypush::[arr]::item}}`                | Append to end                       |
| `arraypop`     | —                             | `{{arraypop::[arr]}}`                       | Remove last element                 |
| `arrayshift`   | —                             | `{{arrayshift::[arr]}}`                     | Remove first element                |
| `arraysplice`  | —                             | `{{arraysplice::[arr]::start::count::add}}` | Splice (delete/insert)              |
| `arrayassert`  | —                             | `{{arrayassert::[arr]::index::value}}`      | Set if index is out of bounds       |
| `objectassert` | `dictassert`, `object_assert` | `{{objectassert::{obj}::key::value}}`       | Set if key doesn't exist            |
| `filter`       | —                             | `{{filter::[arr]::type}}`                   | Filter: `all`, `nonempty`, `unique` |

---

## 13. Random/Dice

| Tag       | Aliases    | Syntax                                | Description                               | Determinism                                           |
| --------- | ---------- | ------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `random`  | —          | `{{random}}` or `{{random::A::B::C}}` | Random float 0–1 or random pick from args | Non-deterministic                                     |
| `pick`    | —          | `{{pick}}` or `{{pick::A::B::C}}`     | Random pick                               | **Hash-based** (stable per message, survives refresh) |
| `randint` | —          | `{{randint::min::max}}`               | Random integer in range (inclusive)       | Non-deterministic                                     |
| `dice`    | —          | `{{dice::2d6}}`                       | XdY dice sum                              | Non-deterministic                                     |
| `roll`    | —          | `{{roll::2d6}}` or `{{roll::20}}`     | Dice roll (defaults to 1dY)               | Non-deterministic                                     |
| `rollp`   | `rollpick` | `{{rollp::2d6}}`                      | Dice roll                                 | **Hash-based** (stable)                               |
| `hash`    | —          | `{{hash::string}}`                    | 7-digit hash value                        | **Deterministic**                                     |

> **Hash-based** means the same message always produces the same result (even on page refresh).

---

## 14. Date/Time

| Tag                    | Aliases                  | Syntax                                              | Description                                                         | Format               |
| ---------------------- | ------------------------ | --------------------------------------------------- | ------------------------------------------------------------------- | -------------------- |
| `time`                 | —                        | `{{time}}`                                          | Current local time                                                  | `H:M:S`              |
| `isotime`              | —                        | `{{isotime}}`                                       | Current UTC time                                                    | `H:M:S`              |
| `isodate`              | —                        | `{{isodate}}`                                       | Current UTC date                                                    | `YYYY-MM-D`          |
| `unixtime`             | —                        | `{{unixtime}}`                                      | Unix timestamp (seconds)                                            | Number               |
| `date`                 | `datetimeformat`         | `{{date::FORMAT}}` or `{{date::FORMAT::timestamp}}` | Formatted date. Supports `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`, etc. | Custom format string |
| `messagetime`          | `message_time`           | `{{messagetime}}`                                   | Message send time                                                   | `HH:MM:SS`           |
| `messagedate`          | `message_date`           | `{{messagedate}}`                                   | Message send date                                                   | Locale format        |
| `messageidleduration`  | `message_idle_duration`  | `{{messageidleduration}}`                           | Time gap from previous user message                                 | `HH:MM:SS`           |
| `idleduration`         | `idle_duration`          | `{{idleduration}}`                                  | Time since last message                                             | `HH:MM:SS`           |
| `messageunixtimearray` | `message_unixtime_array` | `{{messageunixtimearray}}`                          | All message timestamps                                              | JSON array           |

---

## 15. Chat Info

| Tag               | Aliases                                | Syntax                   | Description                                     |
| ----------------- | -------------------------------------- | ------------------------ | ----------------------------------------------- |
| `chatindex`       | `chat_index`                           | `{{chatindex}}`          | Current message index                           |
| `firstmsgindex`   | `firstmessageindex`, `first_msg_index` | `{{firstmsgindex}}`      | Selected first-message index (-1 = default)     |
| `isfirstmsg`      | `isfirstmessage`                       | `{{isfirstmsg}}`         | `1` if in first-message context                 |
| `role`            | —                                      | `{{role}}`               | Current message role (`user`, `char`, `system`) |
| `previouschatlog` | `previous_chat_log`                    | `{{previouschatlog::5}}` | Message at specific index                       |

---

## 16. System/Model Info

| Tag                | Aliases                        | Syntax                         | Description                              |
| ------------------ | ------------------------------ | ------------------------------ | ---------------------------------------- |
| `model`            | —                              | `{{model}}`                    | Current AI model ID                      |
| `axmodel`          | —                              | `{{axmodel}}`                  | Auxiliary model ID                       |
| `maxcontext`       | —                              | `{{maxcontext}}`               | Maximum context length                   |
| `jbtoggled`        | —                              | `{{jbtoggled}}`                | Jailbreak enabled (`1`/`0`)              |
| `prefillsupported` | `prefill_supported`, `prefill` | `{{prefillsupported}}`         | Prefill support (Claude, etc.) (`1`/`0`) |
| `iserror`          | —                              | `{{iserror::string}}`          | `1` if string starts with `"error:"`     |
| `moduleenabled`    | `module_enabled`               | `{{moduleenabled::namespace}}` | Module enabled check (`1`/`0`)           |
| `screenwidth`      | `screen_width`                 | `{{screenwidth}}`              | Viewport width (px)                      |
| `screenheight`     | `screen_height`                | `{{screenheight}}`             | Viewport height (px)                     |

### Metadata Keys

Access via `{{metadata::key}}`:

| Key               | Alt Keys                       | Description              |
| ----------------- | ------------------------------ | ------------------------ |
| `mobile`          | —                              | Mobile device flag       |
| `local`           | —                              | Local mode flag          |
| `node`            | —                              | Node.js environment flag |
| `version`         | —                              | RisuAI version string    |
| `majorversion`    | `majorver`, `major`            | Major version number     |
| `language`        | `locale`, `lang`               | UI language              |
| `browserlanguage` | `browserlocale`, `browserlang` | Browser language         |
| `modelshortname`  | —                              | Model short name         |
| `modelname`       | —                              | Model full name          |
| `modelinternalid` | —                              | Model internal ID        |
| `modelformat`     | —                              | Model format             |
| `modelprovider`   | —                              | Model provider           |
| `modeltokenizer`  | —                              | Model tokenizer          |
| `maxcontext`      | —                              | Max context length       |
| `risutype`        | —                              | RisuAI client type       |
| `imateapot`       | —                              | Teapot marker            |

---

## 17. Assets/Emotions

These tags are mostly display-time UI helpers. They render media or HTML in chat display and generally should not be used as model-visible prompt instructions. `inlayeddata` is the request-visible exception for multimodal image data.

### List Queries

| Tag                | Aliases            | Syntax                           | Description                         | Returns    |
| ------------------ | ------------------ | -------------------------------- | ----------------------------------- | ---------- |
| `assetlist`        | —                  | `{{assetlist}}`                  | Additional asset names              | JSON array |
| `emotionlist`      | —                  | `{{emotionlist}}`                | Emotion image names                 | JSON array |
| `chardisplayasset` | —                  | `{{chardisplayasset}}`           | Display assets (excluding filtered) | JSON array |
| `moduleassetlist`  | `module_assetlist` | `{{moduleassetlist::namespace}}` | Module assets                       | JSON array |

### Display (display-mode only)

| Tag           | Aliases | Syntax                  | Description                           |
| ------------- | ------- | ----------------------- | ------------------------------------- |
| `asset`       | —       | `{{asset::name}}`       | Display asset                         |
| `emotion`     | —       | `{{emotion::name}}`     | Emotion image                         |
| `audio`       | —       | `{{audio::name}}`       | Audio control                         |
| `bg`          | —       | `{{bg::name}}`          | Set background image                  |
| `bgm`         | —       | `{{bgm::name}}`         | Play background music                 |
| `video`       | —       | `{{video::name}}`       | Display video                         |
| `video-img`   | —       | `{{video-img::name}}`   | Video as image (poster frame)         |
| `image`       | —       | `{{image::name}}`       | Display image (styled)                |
| `img`         | —       | `{{img::name}}`         | Display image (unstyled)              |
| `path`        | `raw`   | `{{path::name}}`        | Return asset raw path/URL             |
| `inlay`       | —       | `{{inlay::name}}`       | Inlay display (unstyled)              |
| `inlayed`     | —       | `{{inlayed::name}}`     | Inlay display (styled)                |
| `inlayeddata` | —       | `{{inlayeddata::name}}` | Inlay display (includes request data) |

---

## 18. Encryption/Encoding

| Tag             | Aliases                                  | Syntax                                            | Description                          |
| --------------- | ---------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| `xor`           | `xorencrypt`, `xorencode`, `xore`        | `{{xor::string}}`                                 | XOR encrypt + base64                 |
| `xordecrypt`    | `xordecode`, `xord`                      | `{{xordecrypt::base64}}`                          | XOR decrypt from base64              |
| `crypt`         | `crypto`, `caesar`, `encrypt`, `decrypt` | `{{crypt::string}}` or `{{crypt::string::shift}}` | Caesar cipher (default shift: 32768) |
| `unicodeencode` | `unicode_encode`                         | `{{unicodeencode::A}}`                            | Character → Unicode code point       |
| `unicodedecode` | `unicode_decode`                         | `{{unicodedecode::65}}`                           | Code point → character               |
| `u`             | `unicodedecodefromhex`                   | `{{u::41}}`                                       | Hex code point → character (`A`)     |
| `ue`            | `unicodeencodefromhex`                   | `{{ue::41}}`                                      | Hex code point → character (alias)   |
| `fromhex`       | —                                        | `{{fromhex::FF}}`                                 | Hex → decimal                        |
| `tohex`         | —                                        | `{{tohex::255}}`                                  | Decimal → hex                        |

---

## 19. Formatting/Display

| Tag         | Aliases           | Syntax                           | Description                                 |
| ----------- | ----------------- | -------------------------------- | ------------------------------------------- |
| `br`        | `newline`         | `{{br}}`                         | Line break                                  |
| `blank`     | `none`            | `{{blank}}`                      | Empty string                                |
| `cbr`       | `cnl`, `cnewline` | `{{cbr}}` or `{{cbr::3}}`        | Escaped `\n`. Optional repeat count         |
| `tex`       | `latex`, `katex`  | `{{tex::E=mc^2}}`                | LaTeX math rendering                        |
| `ruby`      | `furigana`        | `{{ruby::漢字::かんじ}}`         | Ruby/furigana text annotation               |
| `codeblock` | —                 | `{{codeblock::lang::code}}`      | Code block with syntax highlighting         |
| `comment`   | —                 | `{{comment::text}}`              | Comment (visible in display mode only)      |
| `button`    | —                 | `{{button::Label::triggerName}}` | Clickable button that invokes a Lua trigger |
| `risu`      | —                 | `{{risu}}` or `{{risu::60}}`     | RisuAI logo (optional size in px)           |
| `file`      | —                 | `{{file::name}}`                 | File display/decode                         |

---

## 20. Escape Characters

For outputting literal special characters inside CBS expressions.

| Tag         | Aliases                                           | Output |
| ----------- | ------------------------------------------------- | ------ |
| `{{decbo}}` | `displayescapedcurlybracketopen`                  | `{`    |
| `{{decbc}}` | `displayescapedcurlybracketclose`                 | `}`    |
| `{{bo}}`    | `ddecbo`, `doubledisplayescapedcurlybracketopen`  | `{{`   |
| `{{bc}}`    | `ddecbc`, `doubledisplayescapedcurlybracketclose` | `}}`   |
| `{{(}}`     | `debo`, `displayescapedbracketopen`               | `(`    |
| `{{)}}`     | `debc`, `displayescapedbracketclose`              | `)`    |
| `{{<}}`     | `deabo`, `displayescapedanglebracketopen`         | `<`    |
| `{{>}}`     | `deabc`, `displayescapedanglebracketclose`        | `>`    |
| `{{:}}`     | `dec`, `displayescapedcolon`                      | `:`    |
| `{{;}}`     | `displayescapedsemicolon`                         | `;`    |

---

## 21. Aggregate Functions

Accept both variadic args and JSON arrays.

| Tag       | Aliases | Syntax                                         | Description   |
| --------- | ------- | ---------------------------------------------- | ------------- |
| `min`     | —       | `{{min::5::2::8}}` or `{{min::[arr]}}`         | Minimum value |
| `max`     | —       | `{{max::5::2::8}}` or `{{max::[arr]}}`         | Maximum value |
| `sum`     | —       | `{{sum::1::2::3}}` or `{{sum::[arr]}}`         | Sum           |
| `average` | —       | `{{average::2::4::6}}` or `{{average::[arr]}}` | Average       |

---

## 22. Control Flow

### #when Conditional Block

```
{{#when::condition}}
  true branch
{{:else}}
  false branch
{{/when}}
```

#### Operators

| Operator | Syntax                           | Description                   |
| -------- | -------------------------------- | ----------------------------- |
| `is`     | `{{#when::val::is::cmp}}`        | Equal                         |
| `isnot`  | `{{#when::val::isnot::cmp}}`     | Not equal                     |
| `>`      | `{{#when::10::>::5}}`            | Greater than                  |
| `<`      | `{{#when::5::<::10}}`            | Less than                     |
| `>=`     | `{{#when::10::>=::10}}`          | Greater or equal              |
| `<=`     | `{{#when::5::<=::5}}`            | Less or equal                 |
| `and`    | `{{#when::cond1::and::cond2}}`   | Both true                     |
| `or`     | `{{#when::cond1::or::cond2}}`    | Either true                   |
| `not`    | `{{#when::not::cond}}`           | Negation                      |
| `var`    | `{{#when::var::name}}`           | Variable exists               |
| `vis`    | `{{#when::name::vis::value}}`    | Variable equals value         |
| `visnot` | `{{#when::name::visnot::value}}` | Variable does not equal value |

#### Advanced Operators

| Operator | Syntax                                 | Description                    |
| -------- | -------------------------------------- | ------------------------------ |
| `keep`   | `{{#when::keep::cond}}`                | Preserve whitespace in output  |
| `legacy` | `{{#when::legacy::cond}}`              | Use legacy evaluation behavior |
| `toggle` | `{{#when::toggle::togglename}}`        | Toggle is enabled              |
| `tis`    | `{{#when::togglename::tis::value}}`    | Toggle equals value            |
| `tisnot` | `{{#when::togglename::tisnot::value}}` | Toggle not equals value        |

Operators can be combined: `{{#when::keep::not::condition}}`, `{{#when::keep::cond1::and::cond2}}`.

### ? Expression (Inline Evaluation)

```
{{? 1+2}}          → 3
{{? hp>10}}        → 1 or 0
```

### #each Loop

```
{{#each [array] as item}}
  {{slot::item}}
{{/each}}
```

Iterates over a JSON array. `{{slot::item}}` accesses the current element. Add `::keep` before the loop expression to preserve whitespace: `{{#each::keep [array] as item}}`.

### Escape Blocks

| Tag                                 | Description                               |
| ----------------------------------- | ----------------------------------------- |
| `{{#escape}}…{{/escape}}`           | Content inside is not parsed by CBS       |
| `{{#puredisplay}}…{{/puredisplay}}` | Raw display without CBS processing        |
| `{{#pure}}…{{/pure}}`               | Deprecated alias path; use `#puredisplay` |

### Code and Function Blocks

| Block                          | Description                                                                 |
| ------------------------------ | --------------------------------------------------------------------------- |
| `{{#code}}…{{/code}}`          | Normalizes whitespace and escape sequences inside the block                 |
| `{{#func name arg}}…{{/func}}` | Defines a callable CBS function; use `{{tempvar::arg}}` and `{{return::v}}` |

### Deprecated Conditional Blocks

| Block                           | Replacement                      |
| ------------------------------- | -------------------------------- |
| `{{#if ...}}…{{/if}}`           | `{{#when ...}}…{{/when}}`        |
| `{{#if_pure ...}}…{{/if_pure}}` | `{{#when::keep::...}}…{{/when}}` |

### Comments

```
{{// This comment produces no output}}
```

### Position Directive

```
{{position::personality}}
```

Defines a named position that can be targeted by `@@position <name>` decorators.

---

## 23. Special Operations

| Tag         | Aliases | Syntax                 | Description                                                      |
| ----------- | ------- | ---------------------- | ---------------------------------------------------------------- |
| `bkspc`     | —       | `{{bkspc}}`            | Delete last word (backspace)                                     |
| `erase`     | —       | `{{erase}}`            | Delete last sentence                                             |
| `declare`   | —       | `{{declare::name}}`    | Modify parser behavior declaration                               |
| `hiddenkey` | —       | `{{hiddenkey::value}}` | Hidden key for lorebook activation (not included in API request) |
| `source`    | —       | `{{source::user}}`     | Profile source URL                                               |
