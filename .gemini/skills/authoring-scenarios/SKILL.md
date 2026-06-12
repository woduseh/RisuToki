---
name: authoring-scenarios
description: 'Use when designing what happens in a bot: event systems, simulator structures, random and periodic events, day cycles, stat-gated content, routes and endings, escalation rhythm. Use for simulator bots, management/raising games, region sandboxes, and any bot where events — not a single relationship arc — carry the experience.'
tags: ['authoring', 'scenario', 'events', 'simulator', 'roleplay']
related_tools:
  ['session_status', 'list_lorebook', 'read_lorebook_batch', 'write_lorebook_batch', 'validate_lorebook_keys']
---

# Scenario & Event Authoring

## Agent Operating Contract

- **Use when:** the main design problem is events and structure-over-time — simulators, raising/management bots, sandbox regions, scenario banks, route/ending systems, or any bot whose replay value comes from _what happens_ rather than _who someone is_.
- **Do not use when:** the task is a character's interior (`authoring-characters`), world substance (`authoring-worlds`), or static description/lorebook distribution (`authoring-lorebook-bots`).
- **Read first:** `core-craft`, then this `SKILL.md`. The world and cast should already exist at least in draft — events are pressure applied to something.
- **Load deeper only if:** `{{user}}`'s starting role changes event access or capability (`core-craft/USER_POSITION.md`), comedy is a recurring event engine (`core-craft/COMEDY_CRAFT.md`), lorebook mechanics are needed (`writing-lorebooks` for decorators/probability), or live state needs CBS/Lua (`writing-cbs-syntax`, `writing-lua-scripts`, `writing-trigger-scripts`).
- **Output/validation contract:** deliver an event architecture — banks, triggers, rhythm rules, state coupling — in which every event changes state or reveals character, never a list of things that merely occur.

**Media-mix handoff:** use `authoring-media-mix` as primary when the same event engine must become episode structure, game loop, manga chapter rhythm, and RP events. This skill still owns the event logic.

**User-position handoff:** when routes, event eligibility, or simulation duties depend on who `{{user}}` is, load `core-craft/USER_POSITION.md`. Events may test or respond to the contract, but never decide the user's current actions or emotions.

## The Core Test

An event earns its place by answering: **what is different after it?**

- changes state (resources, relationships, access, suspicion, world posture), or
- reveals character (forces a choice that shows who someone is), or
- escalates or releases tension on a designed rhythm.

Events that only _happen_ — flavor parades with no residue — are the simulator equivalent of trait lists. Cut or attach consequences.

## The Tin-Can Problem (깡통 시뮬봇)

Simulator bots fail in two opposite directions, and the design must steer between them:

- **Tin can:** all state machine, no drama. Stats tick, days pass, events fire — and nothing means anything because no event passes the core test. Numbers without narrative weight.
- **Soap opera:** all drama, no structure. The bot improvises emotional crescendos every turn; without state and rhythm, escalation inflates until everything is a climax and nothing lands.

The fix is the same coupling in both cases: **every mechanical change gets a dramatic expression rule, and every dramatic beat gets a mechanical residue.** Affection +1 is invisible; affection +1 _as_ "she starts leaving her door unlocked" is content. A tearful confrontation that leaves no state behind is a rerun waiting to happen.

---

## Build Pipeline

### Step 1 — Define the loop

What does the user _do_ on a normal turn or normal day? (manage, court, investigate, survive, train, trade). The loop is the bot's resting state; events interrupt it. If the loop itself is not mildly engaging, no event bank will save it.

### Step 2 — Define the clock

Choose the time structure and write it into the bot's frame:

- **Day cycle:** morning/afternoon/night slots with different available actions and cast availability
- **Calendar:** weekdays vs. weekends, seasonal festivals, exam weeks, paydays — the calendar is a free drama generator (deadlines approach, anniversaries return)
- **Phase clock:** acts or chapters that change the rules (training arc → tournament arc)

Mechanics: `@@activate_only_after N` for phase gating, `@@activate_only_every N` for periodic events, CBS variables for date/slot tracking.

### Step 3 — Build the event banks

Group events by function, not theme:

| Bank                    | Purpose                                                     | Trigger style                                          |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| **Routine variants**    | Keep the loop fresh                                         | `@@probability 20–40` on loop keywords                 |
| **Relationship events** | Advance/test specific bonds                                 | State-gated (affection/trust thresholds) + topic keys  |
| **Pressure events**     | The world acts uninvited (inspection, rival move, accident) | Periodic or probability-based; **not** user-promptable |
| **Crisis events**       | Phase-changing disruptions                                  | Phase-gated, rare, heavily staged                      |
| **Payoff events**       | Earned rewards for accumulated state                        | Hard state gates; never fire early                     |

Write each event entry as: **setup pressure → forced choice or scene → residue** (what state changes, what becomes newly possible/impossible). The residue line is mandatory.

### Step 4 — Couple events to state

- Stats and meters live in the data layer: exact values, CBS variables or status panels, with defined thresholds.
- Each threshold owns a **behavioral expression rule** (what visibly changes at affection 50 vs. 70) — this is what the model performs; the number is what it consults.
- User-choice residue: decisions constrain later banks (refused the gang's offer → protection events unlock, recruitment events lock). See `LOREBOOK_ARCHITECTURE.md` §9.5.

### Step 5 — Design the rhythm

Dramaturgy rules the model can follow, stated in the bot's frame or a directorial entry:

- **Escalation budget:** how many turns of calm between pressure events; crisis events per phase (scarcity keeps them loud)
- **Cooldowns:** after a crisis, the loop gets N quiet beats — recovery scenes are where relationship content breathes
- **Foreshadowing:** crises announce themselves twice (rumor, near-miss) before landing; surprise without setup reads as randomness
- **Release valves:** comedy/festival/domestic events to discharge tension on schedule, not whenever the model feels like it

### Step 6 — Routes and endings (when wanted)

- **Route = accumulated residue, not a menu.** Routes should emerge from choice residue crossing thresholds; avoid early explicit forks the model will tunnel on.
- **Define ending conditions as states** ("trust ≥ X while debt unresolved at calendar end"), each with a staged final sequence entry.
- **Failure endings are content:** a well-staged bad end beats a mushy non-ending. Gate them honestly so users can see the avalanche coming (foreshadowing rules apply).
- For replayability, vary _early_ events between runs (probability banks shine in act 1) — late-game variance frustrates instead of refreshing.

### Step 7 — Stage the opener

Scenario bots suit non-standard openers (`authoring-lorebook-bots` alternate firstMessage shapes): scenario banks the user picks from, or a setup router that configures role/difficulty/start date before play. The opener should demonstrate the loop _and_ seed the first pressure event.

---

## Mechanics Quick Map

| Need                        | Mechanism                                                           |
| --------------------------- | ------------------------------------------------------------------- |
| Random event                | `@@probability N` (+ `activationPercent`)                           |
| Periodic event              | `@@activate_only_every N`                                           |
| Phase/act gating            | `@@activate_only_after N`, CBS `{{#when}}` on phase variables       |
| Stat tracking               | CBS `{{getvar}}/{{setvar}}`, status panel in description/globalNote |
| Choice residue, auto-logged | trigger scripts / Lua `upsertLocalLoreBook` (next-turn effect)      |
| Event exclusivity           | `@@exclude_keys`, selective + secondary keys                        |

Exact syntax: `writing-lorebooks`, `writing-cbs-syntax`, `writing-trigger-scripts`, `writing-lua-scripts`.

## Validation

- **Residue audit:** sample 10 events; every one names what is different after it.
- **Tin-can test:** play 15 loop turns with no user-initiated drama — does the bot generate meaningful pressure on its own, with consequences?
- **Soap test:** check the escalation budget held; no back-to-back unearned crises.
- **Gate integrity:** payoff and ending events cannot fire early via keyword accident (`BOT_VALIDATION.md` secret-leakage logic applies to events).
- **Calendar coherence:** time markers stay consistent across 30+ turns.

## Smoke Tests

| Prompt                                                                  | Expected routing                                  | Expected output                                                  | Forbidden behavior                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| "My academy sim runs fine but nothing ever happens unless I push."      | This skill, Steps 3+5 (pressure bank + rhythm)    | Pressure-event bank with probability/periodic triggers + residue | Adding lore entries that describe but never act         |
| "Add an ending system: three outcomes based on how she's been treated." | This skill, Step 6; `writing-lorebooks` for gates | State-defined ending conditions with staged final sequences      | Early explicit route forks; endings as keyword triggers |
