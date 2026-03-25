# CCZ Atmospheric Dossier Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the live CCZ `.charx` so the dossier UI feels authored and atmospheric while preserving the existing boss-state and special-dossier persistence pipeline.

**Architecture:** Work directly against the loaded `.charx` through Risutoki MCP fields, regex entries, CSS sections, and lorebook entries rather than repo source files. Reuse the current dossier and TRACE architecture, treat snapshots and lorebook export as the rollback mechanism, and keep all deep state logic unchanged unless a tiny presentation fix is unavoidable.

**Tech Stack:** RisuToki MCP field/lorebook/regex/CSS tools, regex-driven display rendering, CSS section styling, CCZ chat variables, CBS validation tools, lorebook export/import safety tools.

---

## Surface Map

- Live loaded `.charx` top-level fields:
  - `description`
  - `creatorcomment`
  - `globalNote`
  - `css`
- Live loaded `.charx` CSS sections:
  - `css[0]` — `CCZ Setup Terminal`
  - `css[1]` — `CCZ Status + T.A.B.R. Panels`
- Live loaded `.charx` regex entries:
  - `regex[3]` — `UI: render CCZ status dossier`
  - `regex[8]` — `System: parse CCZ TRACE block` (read-only regression boundary)
  - `regex[9]` — `UI: render CCZ TRACE note` (read-only unless a tiny copy fix is required)
- Live loaded `.charx` lorebook entries most likely to change:
  - `8` — `Border Economy`
  - `9` — `CCZ Core Reality`
  - `10` — `Consequence Discipline`
  - `11` — `Current Scenario Pressure`
  - `12` — `Role Lens`
  - `28` — `Persistent Actor Ledger`
  - `29` — `CCZ Special Dossiers`
- Current folder entries that will either be reused or replaced:
  - `0` — `Clients & Brokers`
  - `1` — `Core Tone & Play Contract`
  - `2` — `Factions & Power Blocs`
  - `19` — `Recurring Civilians & Street Life`
  - `20` — `Bosses & Territorial Powers`
- Safety backup target:
  - `C:\Users\wodus\AppData\Local\Temp\ccz-atmospheric-lorebook-backup`

## Implementation Notes

- This is a live card, not normal source code. Use `snapshot_field(...)` and lorebook export as the checkpoint mechanism instead of repo commits.
- There is no automated renderer test harness for the live card. Treat field reads, regex/CSS inspection, `validate_cbs`, `validate_lorebook_keys`, and manual scenario checks as the pass/fail loop.
- Do not rewrite the TRACE parser, dossier-network state, or player-centered special dossier logic.

### Task 1: Establish the safety net and failing baseline

**Files:**

- Modify: live `.charx` fields `css`, `globalNote`, `description`, `creatorcomment`
- Inspect: live `.charx` regex entries `3`, `8`, `9`
- Inspect: live `.charx` lorebook entries `8`, `9`, `10`, `11`, `12`, `28`, `29`
- Backup: `C:\Users\wodus\AppData\Local\Temp\ccz-atmospheric-lorebook-backup`

- [ ] **Step 1: Snapshot the four mutable top-level fields**

```text
snapshot_field("css")
snapshot_field("globalNote")
snapshot_field("description")
snapshot_field("creatorcomment")
```

- [ ] **Step 2: Export the current lorebook before any folder migration**

```text
export_lorebook_to_files(
  target_dir="C:\\Users\\wodus\\AppData\\Local\\Temp\\ccz-atmospheric-lorebook-backup",
  format="md",
  group_by_folder=true
)
```

- [ ] **Step 3: Capture the current failure checklist**

```text
read_regex(3)
read_css(1)
read_field_batch(["description", "creatorcomment", "globalNote"])
read_lorebook_batch([8, 9, 10, 11, 12, 28, 29], ["comment", "content", "insertorder", "folder", "alwaysActive"])
```

Expected baseline:

- dossier and Boss Ledger are always open
- Boss Ledger state values are plain text
- `description` still contains Korean prose
- `creatorcomment` still reads like a patch or implementation note
- `globalNote` still mixes hard rules with atmosphere

- [ ] **Step 4: Record the no-refactor boundary**

```text
read_regex(8)
read_regex(9)
```

Expected: TRACE parsing and TRACE display are present and will be preserved structurally.

### Task 2: Make the dossier shell and Boss Ledger collapsible

**Files:**

- Modify: live `.charx` regex entry `3` — `UI: render CCZ status dossier`
- Modify: live `.charx` CSS section `0` — `CCZ Setup Terminal`
- Modify: live `.charx` CSS section `1` — `CCZ Status + T.A.B.R. Panels`

- [ ] **Step 1: Read the current dossier renderer and identify the existing Controls collapse pattern**

```text
read_regex(3)
read_css(0)
read_css(1)
```

Expected: find the exact header/body pattern already used by `Controls` and reuse it rather than inventing a second collapse language.

- [ ] **Step 2: Rewrite the `CATATUMBO DOSSIER` block to use that collapse pattern and default to open**

```text
write_regex(3, ...)
```

Required outcome:

- dossier header is clickable
- dossier body is expanded by default
- existing rows remain in the same order inside the body

- [ ] **Step 3: Wrap `Boss Ledger` in the same collapse pattern, nested as a secondary section, and default it to closed**

```text
write_regex(3, ...)
```

Required outcome:

- Boss Ledger has its own toggle state
- Boss Ledger starts collapsed
- `Controls` remains a separate block and stays collapsed by default

- [ ] **Step 4: Update CSS so all three collapsible sections share the same affordance language**

```text
write_css(0, ...)
write_css(1, ...)
```

Required outcome:

- consistent header spacing
- clear open/closed affordance
- no broken borders or nested spacing glitches

- [ ] **Step 5: Re-read the renderer and CSS to verify the collapse defaults are encoded correctly**

```text
read_regex(3)
read_css(0)
read_css(1)
```

Expected:

- dossier default open marker is present
- Boss Ledger default closed marker is present
- `T.A.B.R.` and `TRACE` blocks are still outside the dossier shell

- [ ] **Step 6: Snapshot `css` after the collapse structure is stable**

```text
snapshot_field("css")
```

### Task 3: Turn boss states into atmospheric intelligence chips and add subtle tension motion

**Files:**

- Modify: live `.charx` regex entry `3`
- Modify: live `.charx` CSS section `1`

- [ ] **Step 1: Read the current Boss Ledger value markup and the tension row**

```text
read_regex(3)
read_css(1)
```

Expected baseline: boss state text is not broken into classable spans yet, and tension styling does not vary by threshold.

- [ ] **Step 2: Refactor the Boss Ledger output so status, relation, and rumor each render in their own span or chip**

```text
write_regex(3, ...)
```

Required outcome:

- `status`, `relation`, and `rumor` are separately classed
- `alive`, `dead`, `neutral`, and `hidden` can be styled independently
- relation and rumor values can be styled without brittle string-wide selectors

- [ ] **Step 3: Add restrained CSS chips for boss state, relation, and rumor values**

```text
write_css(1, ...)
```

Required palette:

- `alive`: muted operational green
- `dead`: dried rust
- `neutral`: smoke-gray
- `hidden`: ghosted low-contrast

Keep the same restrained palette logic for relation and rumor variants.

- [ ] **Step 4: Add tension-threshold styling without changing the underlying threshold math**

```text
write_regex(3, ...)
write_css(1, ...)
```

Required behavior:

- low tension: no animation
- medium tension: faint bar shimmer only
- high or critical tension: slow dossier-edge pulse plus the shimmer

- [ ] **Step 5: Verify the motion layer stays subtle**

```text
read_regex(3)
read_css(1)
```

Expected:

- low-tension class has no animation hook
- medium uses bar-only motion
- high and critical share the same slow pulse family, not alarm flicker

- [ ] **Step 6: Snapshot `css` again once the chip and motion layer passes inspection**

```text
snapshot_field("css")
```

### Task 4: Rewrite the public-facing metadata in natural English

**Files:**

- Modify: live `.charx` field `description`
- Modify: live `.charx` field `creatorcomment`

- [ ] **Step 1: Read the current metadata fields**

```text
read_field_batch(["description", "creatorcomment"])
```

- [ ] **Step 2: Replace `description` with natural English scenario-pitch copy**

```text
write_field("description", ...)
```

Required outcome:

- natural English
- keeps CCZ proper nouns and border-war identity
- preserves CCZ's identity as a flexible military-action sandbox with social and territorial consequence
- reads like a polished storefront or release-page description, not a literal translation

- [ ] **Step 3: Replace `creatorcomment` with a two-to-three-line appeal hook**

```text
write_field("creatorcomment", ...)
```

Required outcome:

- no patch-note framing
- no implementation summary
- concise, attractive, and aligned with CCZ's tone

- [ ] **Step 4: Verify the English rewrite removed unintended Hangul**

```text
search_in_field("description", "[가-힣]", regex=true, flags="g")
search_in_field("creatorcomment", "[가-힣]", regex=true, flags="g")
```

Expected: no matches unless a deliberate multilingual proper noun was preserved on purpose.

- [ ] **Step 5: Snapshot the rewritten metadata fields**

```text
snapshot_field("description")
snapshot_field("creatorcomment")
```

### Task 5: Slim `globalNote` into a hard contract and move flavor into always-active lorebook

**Files:**

- Modify: live `.charx` field `globalNote`
- Modify: live `.charx` lorebook entries `8`, `9`, `10`, `11`, `12`, `28`, `29`

- [ ] **Step 1: Read the current contract and the target always-active entries together**

```text
read_field("globalNote")
read_lorebook_batch([8, 9, 10, 11, 12, 28, 29], ["comment", "content", "insertorder", "folder", "alwaysActive"])
```

- [ ] **Step 2: Mark exactly what stays global**

Keep only:

- player-centered dossier framing
- role discipline
- continuity and state rules
- `[STATUS]`, `[TABR]`, and `[TRACE]` output protocol
- irreversible boss-state obligations

- [ ] **Step 3: Rewrite `globalNote` into the compact hard contract**

```text
write_field("globalNote", ...)
```

Required outcome:

- shorter than the baseline
- no decorative atmosphere that can safely live elsewhere
- still strong enough to preserve the current state discipline

- [ ] **Step 4: Move atmospheric prose into the right always-active entries**

```text
write_lorebook_batch([
  { index: 8, data: ... },
  { index: 9, data: ... },
  { index: 11, data: ... },
  { index: 12, data: ... },
  { index: 29, data: ... }
])
```

Distribution rule:

- `8` / `Border Economy`: economic and civilian pressure
- `9` / `CCZ Core Reality`: world frame and border texture
- `11` / `Current Scenario Pressure`: scenario-specific stress only
- `12` / `Role Lens`: player-role lens only
- `29` / `CCZ Special Dossiers`: dossier-side secondary framing only

These target entries must remain `alwaysActive=true` after the rewrite.

Leave `10` and `28` structurally intact unless a tiny trim is needed to remove duplicated prose.

- [ ] **Step 5: Verify the move landed in lorebook instead of disappearing**

```text
get_field_stats("globalNote")
read_lorebook_batch([8, 9, 11, 12, 29], ["comment", "content"])
validate_cbs(field="globalNote")
```

Expected:

- `globalNote` is materially shorter
- moved atmosphere is visible in always-active lorebook
- CBS validation still passes

- [ ] **Step 6: Snapshot `globalNote` after the contract split is stable**

```text
snapshot_field("globalNote")
```

### Task 6: Rebuild the folder layout and tune lorebook placement order

**Files:**

- Modify: live `.charx` folder entries `0`, `1`, `2`, `19`, `20`
- Modify: live `.charx` lorebook entries `3` through `29`

- [ ] **Step 1: Read the full folder and insert-order map before moving anything**

```text
list_lorebook(preview_length=0)
read_lorebook_batch(
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  ["comment", "insertorder", "folder", "mode", "alwaysActive"]
)
```

Record the target insert-order bands here before any moves:

- world-pressure always-active entries
- core-contract always-active entries
- scenario-support always-active entries
- factions
- civilians and brokers
- bosses

- [ ] **Step 2: Create the final folder sequence in the desired browsing order**

Create these new folders in this exact order:

1. `Core Contract & Output Discipline`
2. `World Pressure & Street Life`
3. `Factions & Territorial Blocs`
4. `Civilians, Brokers & Operators`
5. `Bosses & Territorial Powers`
6. `Special Dossiers & Scenario Support`

```text
add_lorebook(...)
add_lorebook(...)
add_lorebook(...)
add_lorebook(...)
add_lorebook(...)
add_lorebook(...)
list_lorebook(preview_length=0)
```

Immediately capture the new folder UUIDs and indices from the post-create `list_lorebook(...)` output before moving any child entries.

- [ ] **Step 3: Move entries into the new folders and assign sane insert-order bands**

Use `write_lorebook_batch(...)` to move entries as follows:

- Core Contract & Output Discipline: `10`, `12`, `28`
- World Pressure & Street Life: `8`, `9`, `11`
- Factions & Territorial Blocs: `13`–`18`
- Civilians, Brokers & Operators: `3`–`7`, `21`–`24`
- Bosses & Territorial Powers: `25`–`27`
- Special Dossiers & Scenario Support: `29`

Insert-order guidance:

- keep faction and broker bands close to their current numbers unless a tie makes the new grouping confusing
- retune always-active entries so their relative order is deliberate and readable
- give any entries missing explicit `insertorder` a stable value when moved

- [ ] **Step 4: Delete the obsolete folder entries only after every child points at the new folder UUIDs**

```text
batch_delete_lorebook([20, 19, 2, 1, 0])
```

Precondition: `list_lorebook(preview_length=0)` shows no remaining entries referencing the old folder UUIDs.

- [ ] **Step 5: Validate the new folder structure**

```text
list_lorebook(preview_length=0)
validate_lorebook_keys()
```

Expected:

- folder list appears in the new browsing order
- no orphaned entries
- no key validation regressions

### Task 7: Run the full polish regression pass

**Files:**

- Inspect: all touched fields, sections, regex entries, and lorebook entries

- [ ] **Step 1: Re-read every touched surface in its final state**

```text
read_field_batch(["description", "creatorcomment", "globalNote"])
read_css_batch([0, 1])
read_regex(3)
read_regex(8)
read_regex(9)
read_lorebook_batch([8, 9, 10, 11, 12, 28, 29], ["comment", "content", "insertorder", "folder", "alwaysActive"])
```

- [ ] **Step 2: Run structural validations**

```text
validate_cbs()
validate_lorebook_keys()
```

Expected:

- CBS surfaces pass
- lorebook keys pass

- [ ] **Step 3: Run targeted content checks**

```text
search_in_field("description", "patch", regex=false)
search_in_field("creatorcomment", "patch", regex=false)
search_in_field("description", "[가-힣]", regex=true, flags="g")
search_in_field("creatorcomment", "[가-힣]", regex=true, flags="g")
```

Expected:

- no leftover patch-note framing in user-facing metadata
- no unintended Korean remains in the rewritten metadata

- [ ] **Step 4: Manually verify both a calm and a dangerous scenario**

Check at least:

- `riverwatch` (or another low-tension normal scenario already present in CCZ)
- `special_campana` (or another high-tension or critical special dossier already present in CCZ)

Required outcomes:

- dossier opens by default
- Boss Ledger starts collapsed
- Boss Ledger chips render correctly when opened
- low tension stays still
- high or critical tension shows only subtle motion
- player perspective and dossier network still remain separate

- [ ] **Step 5: Confirm boss-state persistence did not regress**

Use a scenario where one boss already has a changed state and verify:

- Boss Ledger still reflects the stored state
- TRACE note still renders
- switching scenarios does not silently revert the boss state

- [ ] **Step 6: Produce the execution handoff note**

Summarize:

- which fields were changed
- whether any lorebook entries were created or deleted
- validation results
- any intentional follow-up work that was deferred
