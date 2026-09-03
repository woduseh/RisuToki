# Event Systems

Load this reference when `SKILL.md` steps 2–4 need a concrete shape: how to write an event record, what advances the clock, how cooldowns and exclusions are encoded, where the state lives in a RisuAI bot, and how routes and endings are locked. Verified against RisuAI `2026.8.250` and the send-cycle order in `writing-trigger-scripts/RUNTIME_INTEROP.md`; storage facts defer to `writing-cbs-syntax`, `writing-lua-scripts`, and `writing-lorebooks` for exact syntax.

## Event record

Write every event in the same shape so the bank can be audited and so the model reads events as rules rather than as vignettes.

| Field             | Purpose                                                                               | Example                                          |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **id**            | Stable name used by state, cooldowns, and exclusions                                  | `supplier_late`                                  |
| **function**      | Routine, opportunity, conflict, consequence, recovery, revelation, or rare disruption | conflict                                         |
| **prerequisites** | State that must hold; absent prerequisites mean the event can never fire              | `day >= 3`, `stock_flour < 2`                    |
| **weight**        | Relative likelihood among eligible events, or a fixed priority for scripted beats     | 3 (baseline routine is 5)                        |
| **cooldown**      | Turns, scenes, or days before the same id is eligible again                           | 4 days                                           |
| **exclusions**    | Events or states that suppress this one                                               | not while `festival_active`                      |
| **mutation**      | What changes when it resolves: variables, relationships, unlocks, locks               | `reputation -1` on refusal; unlock `rival_visit` |
| **residue**       | The hook the aftermath leaves for later scenes                                        | the supplier now expects prepayment              |
| **user surface**  | What `{{user}}` sees and can act on; never their decision                             | the empty crate and the supplier's excuse        |

An event without a mutation or residue is decoration. An event without prerequisites is noise.

## Clocks

State exactly what advances the clock; the model will otherwise advance it whenever convenient.

| Clock           | Advances when                                        | Best for                                 |
| --------------- | ---------------------------------------------------- | ---------------------------------------- |
| **Turn**        | every exchange                                       | tension meters, short loops              |
| **Scene**       | location or participant change the bot narrates      | slice-of-life, relationship episodes     |
| **Day / shift** | an explicit closing ritual (shop closes, lights out) | management, school, routine simulators   |
| **Milestone**   | a named event resolves                               | routes, mystery reveals, campaigns       |
| **Resource**    | a tracked value crosses a threshold                  | survival, economy, corruption meters     |
| **Mixed**       | a primary clock plus one threshold clock             | most simulators; declare which one leads |

Pick one leading clock. A secondary clock may interrupt it (a resource hitting zero ends the day early) but should not silently replace it.

## Cooldowns, exclusions, and mutation

- **Cooldown** is a stored last-fired marker compared against the clock, not a feeling of "recently". Store `last_<id>` and the current clock value.
- **Exclusion** is either a state flag (`festival_active`) or a conflicting id that fired this cycle. Name both directions when two events cannot share a day.
- **Mutation** must be legible in the next scene. If an event lowers reputation, something in the next routine event should look different, or the number did not matter.
- **Repetition** degrades gracefully only through cooldown plus mutation: the second occurrence of the same id must change at least one of location, participant, cost, or outcome.

## Where the state lives in RisuAI

Decide first who executes the rules. Without Lua, the model is the interpreter: keep the bank to at most 8 events and 5 variables, write prerequisites as sentences, drop numeric weights, express cooldowns as "not two days in a row", and re-emit the status block every turn; even a frontier model picks "interesting" events rather than weighted ones and loses counts once history is truncated. Emitting `{{setvar}}` in the reply persists the values but leaves the judgment with the model. With Lua the table below applies in full and the model only narrates.

| State                                        | Home                                                                                                                                                                                                              | Notes                                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Counters, flags, clock values                | chat variables via CBS `{{setvar}}` / `{{getvar}}`, or Lua `setChatVar` / `getChatVar`                                                                                                                            | CBS mutation runs only in a `runVar` pass over chat messages; greetings, lorebook text, and display rendering cannot set |
| Weighted random, eligibility filtering       | Lua (`onOutput` or a manual trigger)                                                                                                                                                                              | keep the bank in a Lua table; pick among eligible ids, then write the chosen id and `last_<id>` to chat variables        |
| Event text the model should perform          | a CBS block in the description, `globalNote`, or an always-active lorebook entry that renders on the chosen id (`{{#when::{{getvar::event_today}}::==::supplier_late}}…{{/when}}`), or an `editRequest` injection | lorebook keys scan chat text, not variables, so a key-triggered entry fires only after the id appears in a saved message |
| Residue and unlocked history                 | progression lorebook entries, manual or via `upsertLocalLoreBook` (takes effect next turn)                                                                                                                        | prune or compact so residue does not become a second description                                                         |
| Standing rules of the loop (what ends a day) | `globalNote`                                                                                                                                                                                                      | short operational constraints only                                                                                       |
| Visible status (day, funds, meters)          | regex `editdisplay` output or HTML/CSS in `backgroundEmbedding`                                                                                                                                                   | display-only; the model does not read it as instruction                                                                  |

Do not scatter the same flag across two homes. If Lua owns `day`, CBS reads it and never writes it.

## Lua-run loop

With Lua the mechanics are not the risk; the two places that break are same-turn injection and rerolls. Use this pipeline.

1. **`onOutput`: apply, then pick.** After the response is stored, parse the model's delta block, apply mutations to chat variables, advance the clock if the closing ritual fired, then select the next event and write `event_today`. Picking here, not in `onStart`, matters: the description's CBS is evaluated before `start` runs, so a value written in `onStart` may not render until the following turn.
2. **CBS renders the event.** A `{{#when}}` block in the description, `globalNote`, or an always-active lorebook entry turns `event_today` into the scene the model must perform. Alternative for same-turn selection: pick in `onStart` and inject the text through `listenEdit("editRequest")`, which changes model input without touching saved chat.
3. **The model narrates and emits a delta block.** One hidden block per reply, at most five `key=value` lines, hidden by an `editdisplay` regex. The model writes deltas (`funds=-3`, `regular_trust=+1`), never totals.
4. **`editOutput` or `onOutput` parses leniently.** Missing block or malformed line means "no change", not an error; a single skipped turn must not desync the state.
5. **Status window renders from variables.** Numbers the user sees come from `{{getvar}}`, not from prose. One `globalNote` line: the status block is computed; do not restate or change its numbers in narration.
6. **Reroll guard.** Rerolls re-run `start` and `output`. Store `applied_turn` and skip mutation when it equals the current turn; derive the pick from a seed such as `day` so a swipe does not change the day's event unless you want it to.

```lua
local BANK = { -- id, weight, cooldown_days, prereq(vars) -> bool
  { id = "morning_rush", w = 5, cd = 1, ok = function(v) return v.open == "1" end },
  { id = "supplier_late", w = 3, cd = 4, ok = function(v) return tonumber(v.day) >= 3 and tonumber(v.stock_flour) < 2 end },
}

local function vars(id)
  local v = {}
  for _, k in ipairs({ "day", "turn", "open", "stock_flour", "applied_turn", "event_today" }) do v[k] = getChatVar(id, k) or "" end
  return v
end

local function pick(id, v)
  math.randomseed(tonumber(v.day) or 0)
  local pool = {}
  for _, e in ipairs(BANK) do
    local last = tonumber(getChatVar(id, "last_" .. e.id)) or -999
    if e.ok(v) and tonumber(v.day) - last >= e.cd then
      for _ = 1, e.w do pool[#pool + 1] = e.id end
    end
  end
  return pool[math.random(#pool)] or "quiet_afternoon"
end

function onOutput(id)
  local v = vars(id)
  if v.applied_turn == v.turn then return end        -- reroll guard
  -- parse the reply's delta block here and setChatVar each key
  setChatVar(id, "applied_turn", v.turn)
  local next_id = pick(id, v)
  setChatVar(id, "event_today", next_id)
  setChatVar(id, "last_" .. next_id, v.day)
end
```

`setChatVar` stores strings only; keep structured state in `setState`. The bank table lives in source (constant); every mutable value lives in chat variables, because Lua globals do not survive reload. `lowLevelAccess` is not needed for this loop.

## Routes and endings

- **Route lock:** a route begins when a named milestone resolves and writes a `route` flag; later events check the flag in prerequisites. State whether the lock is reversible.
- **Ending conditions:** each ending is an event with prerequisites (flags, thresholds, clock) and no cooldown. Fixed narratives may guarantee that one ending is reachable; Emergent RP encodes thresholds and lets the user's actual choices meet or miss them.
- **Bad-end residue:** if the bot supports loops or restarts, decide what survives (knowledge, one relationship value, an unlocked shortcut) and store it separately from run state so a reset does not erase it by accident.
- **Ending scene:** open on the consequence, not on a scoreboard. The status window may close the loop; the prose should not.

## Worked bank: neighborhood café, day clock

Leading clock is the day, closed by the shop-closing ritual. Baseline routine weight is 5.

| id                 | Function        | Prerequisites                  | Weight | Cooldown | Exclusions            | Mutation / residue                                                   |
| ------------------ | --------------- | ------------------------------ | -----: | -------- | --------------------- | -------------------------------------------------------------------- |
| `morning_rush`     | routine         | shop open                      |      5 | 1 day    | `festival_active`     | `funds +`, `fatigue +1`; a regular is noticed or ignored             |
| `regular_confides` | opportunity     | `regular_trust >= 2`           |      3 | 3 days   | `morning_rush` today  | `regular_trust +1` or `-1`; a secret becomes a later key             |
| `supplier_late`    | conflict        | `day >= 3`, `stock_flour < 2`  |      3 | 4 days   | none                  | menu shrinks today; supplier expects prepayment                      |
| `health_inspector` | conflict        | `hygiene < 3`                  |      2 | 7 days   | `day == 1`            | fine or warning; `reputation -1` on fine                             |
| `rival_visit`      | opportunity     | `reputation >= 3`              |      2 | 5 days   | `supplier_late` today | rival offers poaching or partnership; either answer leaves a grudge  |
| `bad_review`       | consequence     | any refused customer this week |      4 | 3 days   | none                  | `reputation -1`; the reviewer becomes a recurring face               |
| `quiet_afternoon`  | recovery        | `fatigue >= 4`                 |      3 | 2 days   | `festival_active`     | `fatigue -2`; room for a one-on-one scene                            |
| `landlord_letter`  | revelation      | `day >= 10`                    |      1 | none     | none                  | rent increase with a deadline; starts the `keep_or_move` route clock |
| `festival_week`    | rare disruption | `day % 30 == 0`                |      1 | 30 days  | none                  | sets `festival_active` for 3 days; doubles routine weight            |

Each row leaves the user an open choice: whether to notice the regular, pay the supplier, argue with the inspector. The bot narrates the consequence of what the user actually did on the following day.

## Validation

- Every id has a prerequisite, a mutation, and a residue.
- The leading clock has exactly one advance rule and it appears in `globalNote` or the description.
- Each flag has one writer.
- Run the representative paths from `SKILL.md`: common action, ignored hook, failed check, repeated action (must differ on the second run), boundary value, recovery, late-state event.
- No row writes `{{user}}`'s decision.
