# CCZ Atmospheric Dossier Polish Design

Date: 2026-03-25

Status: Approved design draft

## Problem

CCZ's persistent-state layer now works, but the presentation still feels more functional than authored. The dossier shell stays open at all times, the Boss Ledger reads like raw text instead of intelligence, the current prose surfaces are out of step with the bot's quality, and `globalNote` carries atmospheric material that would be cleaner in always-active lorebook.

This pass should make CCZ feel more like a curated field dossier without destabilizing the TRACE parser, actor ledger, or player-centered special dossier model that already works.

## Goals

- Make the status UI feel like field intelligence rather than a debug panel.
- Preserve the current player-centered dossier and boss-state architecture.
- Improve the prose quality of user-facing metadata.
- Slim `globalNote` to a hard contract and move secondary atmosphere into lorebook.
- Reorder lorebook so prompt importance and editor readability align.

## Non-Goals

- No rewrite of the TRACE parser or actor-ledger persistence model.
- No new gameplay system, scenario taxonomy, or boss logic.
- No aggressive alarm-style animation.
- No target-centric dossier reframing for special boss files.

## Chosen Direction

Use the **Atmospheric dossier** approach.

This keeps the current structure recognizable, but upgrades the mood, readability, and prompt hygiene. It is a better fit than a minimal cleanup because the user explicitly wants the dossier to feel more authored, and it is safer than a full UI-forward reframe because the working state system should remain intact.

## Design

### 1. UI structure

Keep one main `CATATUMBO DOSSIER` shell and polish it rather than rebuilding the status layout from scratch.

- `CATATUMBO DOSSIER` becomes collapsible in the same visual language as `Controls`.
- `Boss Ledger` also becomes collapsible inside the dossier shell.
- Default states:
  - dossier: open
  - boss ledger: closed
  - controls: closed
- `T.A.B.R.` and `TRACE` remain separate lower panels.

Implementation should reuse the current collapse pattern if possible. The point is consistency, not a new widget system.

### 2. Visual language and motion

The Boss Ledger should read like classified field intelligence, not raw variable output.

- Convert boss values into styled labels or chips rather than plain text strings.
- Tone map:
  - `alive`: muted operational green
  - `dead`: dried rust
  - `neutral`: smoke-gray
  - `hidden`: ghosted low-contrast styling
- Relation and rumor states get restrained variants in the same palette.
- Styling should stay legible and atmospheric, not neon or gamey.

Tension animation should stay subtle.

- Low tension: no animation.
- Medium tension: faint bar shimmer only.
- High or critical tension: slow edge pulse on the dossier shell plus the tension bar effect.

Use the existing CCZ tension thresholds. This pass should not introduce a new tension scale or new threshold math.

The motion layer should imply danger, not announce it.

### 3. Prose refresh

Rewrite `description` into natural English that reads like a polished scenario pitch rather than a literal translation.

- Keep CCZ's proper nouns, border-war atmosphere, and noir pressure.
- Prefer clear, publishable English over ornamental prose.
- Preserve the bot's identity as a flexible military-action sandbox with social and territorial consequence.

Replace `creatorcomment` with a short two-to-three-line hook that sells the bot's appeal.

- No patch-note language.
- No implementation summary.
- The comment should quickly tell a reader why CCZ is distinctive.

### 4. Prompt architecture

`globalNote` should become the hard behavioral contract only.

Keep in `globalNote`:

- player-centered dossier framing
- role discipline
- continuity and state rules
- `[STATUS]`, `[TABR]`, and `[TRACE]` protocol
- irreversible boss-state obligations

Move into always-active lorebook:

- border texture and atmospheric framing
- civilian and street-pressure texture
- secondary world guidance
- non-critical scene coloration

This keeps the strongest behavioral rules global while moving flavor to a surface that is easier to organize and tune.

Implementation may either consolidate the moved material into a few always-active atmosphere entries or redistribute it across existing always-active entries. Prefer the option that improves clarity without creating folder sprawl.

### 5. Lorebook ordering and folder strategy

Reorder lorebook by prompt function first, then by domain.

Recommended browsing and prompt order:

1. core contract and output discipline
2. world pressure and everyday Catatumbo texture
3. factions and territorial blocs
4. civilians, brokers, and recurring operators
5. bosses and territorial powers
6. special dossiers and scenario support

Here, "order" means both editor organization and runtime `insertorder` so the browsing model and prompt stack tell the same story.

Prefer selective folder cleanup and insert-order tuning over creating many new folders. The goal is a cleaner prompt stack and a clearer editor experience, not a taxonomy explosion.

### 6. Stability boundary

This pass is a polish-layer refactor around the working persistence core.

Keep intact unless a small adjustment is required by the new presentation:

- TRACE parser regex
- actor chat vars
- persistent actor ledger lorebook logic
- player-centered special dossier handling
- dossier network separation

If a UI improvement would require deeper state changes, reject the improvement instead of risking a regression.

## Surfaces Likely To Change

- regex entry `3` for dossier and Boss Ledger rendering
- CSS section `0` for shared shell behavior and stacking
- CSS section `1` for dossier, ledger, chip, and tension styling
- `description`
- `creatorcomment`
- `globalNote`
- always-active lorebook entries that currently carry atmospheric prose
- lorebook folder placement and `insertorder` values

## Verification Plan

Validate the pass in layers.

1. UI behavior
   - dossier opens by default
   - Boss Ledger closes by default
   - Controls stay closed by default
   - collapse behavior does not break layout or rendering

2. Visual polish
   - boss-state labels render with the intended atmosphere
   - low tension stays still
   - medium and high tension animate only at their intended thresholds

3. Prose surfaces
   - description reads as natural English
   - creator comment functions as a concise appeal hook

4. Prompt integrity
   - `globalNote` still carries the hard contract
   - moved lorebook content still appears through always-active entries
   - boss dossier persistence behavior remains unchanged

5. Regression checks
   - special dossiers still preserve player role
   - Boss Ledger still reflects current actor state
   - TRACE output still parses and displays correctly

## Risks and Mitigations

- **Risk:** Collapse behavior adds markup or CSS complexity that weakens readability.
  - **Mitigation:** Reuse the existing collapse language and keep the shell hierarchy unchanged.

- **Risk:** Moving too much prose out of `globalNote` weakens model discipline.
  - **Mitigation:** Keep all hard rules global and move only secondary atmosphere.

- **Risk:** Motion effects feel gaudy.
  - **Mitigation:** Gate all animation by tension threshold and keep the high-state pulse slow.

## Outcome

After this pass, CCZ should feel less like a technically competent scenario tool and more like a deliberate intelligence artifact: restrained, legible, threatening, and easier to trust.
