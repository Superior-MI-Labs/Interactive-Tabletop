<div align="center">

# Interactive Tabletop
### Turn your D&D Beyond PDF into an interactive character sheet and dice table.

**FREE · LOCAL-FIRST · EARLY ALPHA / PROTOTYPE**

> **v0.52.0 alpha:** GitHub Pages deploys from the canonical `web/` source after its release checks pass. Verify the site version in the browser before assuming a push is live.

[**Launch browser alpha**](https://superior-mi-labs.github.io/Interactive-Tabletop/) · [**Download desktop ZIP**](https://superior-mi-labs.github.io/Interactive-Tabletop/downloads/SkyBlueEyes-Tabletop-v0.52.0.zip) · [**Build with an AI agent**](AI_START_HERE.md) · [**Report a bug**](https://github.com/Superior-MI-Labs/Interactive-Tabletop/issues)

![Status: early alpha](https://img.shields.io/badge/status-EARLY%20ALPHA-orange) ![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Linux%20%7C%20Windows-bluegrey)

</div>

> **Early alpha / work in progress.** This is a playable experiment, not a finished rules engine or replacement for D&D Beyond. PDF exports can omit custom abilities; verify imported values. Dice physics and Windows compatibility are still experimental.

## Create or import a character

**v0.44 guided setup:** After manual creation, a checklist shows whether you have recorded attacks, feature notes/abilities and equipment. The optional spellbook is not required. Each button takes you to the existing editor, where you can add and edit manual entries. These are not automatically validated class mechanics, spell slots, or approval to cast; your DM confirms them.


Choose **Create character** in the top bar or Characters vault to build a **manual D&D 2014 sheet**. The guided form collects identity, ability scores, explicitly selected saving throw and skill proficiencies, HP, AC, speed, and an optional first attack. It computes only basic 2014 ability modifiers and level-based proficiency. It does not invent class features, spells, starting equipment, species traits, or automatic rules. Review those with your DM and edit the sheet afterward. Existing demos, imports, and previously empty vaults remain untouched. A canceled draft is never saved.

### Manual resources and spell slots (v0.45)

When editing a character, open **Spells → Configure standard spell slots** to set each spell level's total and remaining slots. These values are never inferred from a class or spell list; the standard Spellcasting and Pact Magic systems are deliberately separate. For feature resources such as Ki or homebrew points, open **Encounter → Turn economy settings**, create or edit a named resource pool, and set its refresh rule. Manual attack/spell entries reject invalid dice and attack bonuses before saving.


**v0.52 dice and hover update:** The collapsed Dice widget now shows a large settled total and concise roll label; hover/focus reveals physical faces, expression, modifier, bonuses, outcome, and total via the existing HUD card. Expanded totals are enlarged, too. Existing dice math, history, and physical faces are unchanged. Normal clicks on controls now take priority over dice resting/following above them. Alt+drag deliberately retrieves a die from atop a control; free tabletop drag/throw remains available. Fast, read-only hover cards extend to character attacks, skills/saves, spells, abilities, equipment, features, and SRD catalog rows; only matching 2014 references provide catalog descriptions. Imported and DM-configured fields remain authoritative.

**v0.51 inventory reimport safety:** PDF equipment entries now match by name only when the name is unique on both versions of a character import. Unstable `equipment-N` positions, changed quantities and weight do not establish identity. Duplicate names cannot steal another item’s notes. The shared read-only preview reports added/removed items, ambiguity, quantity changes, safe note transfers and old annotations that will not transfer. Separately authored items remain by stable ID. The latest PDF still owns imported quantities, weights and archived status; this release does not infer rules or equipment descriptions.

**v0.50 status and hover cards:** The instant heart/effect tooltip is now the shared presenter for controls, including older browser-native title hints. At v0.50, active conditions appeared in Effects with a **+ Conditions** picker. **As of v0.53, this presentation was reverted:** Conditions has its own panel beside Resources, while Effects displays actual effect records and concentration prompts. Hover or keyboard focus reveals an edition-qualified SRD 5.1 summary for each supported 2014 condition; tap/click a status icon or effect info control to pin a card, Escape to close. The reference catalog now includes 15 read-only conditions. This adds explanations, **not** condition mechanics or a second character state store.

**v0.49 combat target safety:** Attacks and configured offensive effects require a deliberately selected encounter creature; the implicit self-target is rejected before dice preparation or resource spending. A persistent target bar exposes selection. Auto can apply settled, typed weapon damage without another click only after a verified classified attack hit and a uniquely identified damage type from the attack record and explicit per-creature defensive-profile review; unknown types and unqualified conditions remain DM-reviewed. Guided/Auto's inline Apply is one approval, while Manual retains a confirmation. The existing damage planner and Undo remain authoritative.

**v0.48 PDF reimport preview:** Updating a matching character from a D&D Beyond PDF now shows named imported spell additions and removals, ambiguous duplicate spell matches, and source changes before confirmation. Imported duplicates with unresolved identity do not inherit previous preparation or DM-configured rules; separately authored spells are preserved by ID. The preview is read-only. Cancel leaves the character unchanged. Export a vault backup before a major update.

**v0.47 manual spellbook safety:** Spells added with **+ Spell** are separate player-authored records, even if a later PDF contains a spell with the same name. PDF reimport preserves those records, and the sheet identifies them as **Manual entry**. In Edit mode, **Remove manual spell** asks for confirmation; it cannot remove PDF-owned spells. Deleting a spell does not end effects already in progress. Export a JSON backup before a significant reimport or deletion.

**v0.46 spellcasting:** In Edit sheet, each spell can specify its casting ability (STR/DEX/CON/INT/WIS/CHA) or a bounded fixed modifier override. Qualified 2014 self-healing uses that explicit configuration. Legacy unambiguous source labels still work, but mixed class sources require an ability selection. Configuration survives unambiguous PDF reimports; no automatic class progression or new spell effects are introduced.

## v0.53 — Separate Encounter and Conditions surfaces

**Encounter** is its own workspace tab. Creature selection, target HP/defenses, DM event windows, turn/action economy and creature turns all live there. **Actions** contains attacks and abilities; **Spells** contains spells. Those views show a small read-only target summary and a link to Encounter rather than duplicating encounter controls. Target identity, event gating, costs and dice remain governed by the same combat engine.

The **Conditions** panel is once again a separate expandable block beside Resources, with all 15 manual condition icons and source-qualified hover information. The Effects bar displays active effects and concentration checks, without duplicating condition icons. This restores the v0.49 presentation while keeping later provenance and accessibility improvements.

## Play in your browser

1. Open [Interactive Tabletop](https://superior-mi-labs.github.io/Interactive-Tabletop/). A genuinely new browser vault starts with **Mara Vale (Demo)**, an editable fictional level-5 Fighter and Training Dummy.
2. Choose **Encounter** to start tracking and select a creature, then choose **Actions** to throw physical attack dice. The demo includes two attacks per Attack action, Second Wind and Action Surge.
3. To use your own hero, choose **Import PDF** for a fillable D&D Beyond sheet. Existing vaults are not changed, and **Characters → Add demo fighter** lets you opt in at any time, including on desktop.
4. Use **Characters → Reset demo** to restore sample stats, or delete the demo permanently. Export JSON backups regularly to protect real and demo characters.

No signup or application server is needed. The hosted version parses PDF fields in your browser and stores a multi-character vault in IndexedDB. Previously saved single-character localStorage data is migrated without deleting the recovery copy. PDF.js code is downloaded from a pinned jsDelivr URL when importing a PDF; the **PDF itself is not intentionally uploaded to any server**. Do not assume local browser storage is permanent, private on shared computers, or synchronized across devices.


### Guided practice and creature turns (v0.42)

The demo character now displays **contextual practice steps** instead of a static instruction banner: start encounter tracking, select the Training Dummy, prepare and throw a longsword attack, and try the second attack granted by Extra Attack. The button at each stage invokes the ordinary combat engine. It does not maintain a second tutorial state or advance stages based on guesses. Prepared dice may be canceled without spending a turn action, and right-click/Escape follow the same cancellation rules as regular play.

The **Encounter → Creature turns** section lists every manually tracked creature, its current individual turn counter, and scheduled condition expirations anchored to that creature. Choose **Select** to target it or **End turn** to request DM confirmation of its turn boundary. This does not move other creatures or your action economy and does not infer initiative. Controls that explicitly opt into pointer priority remain clickable even when a physical die overlaps them; normal dice grabbing elsewhere is unchanged.

### Condition source and turn-boundary tracking (v0.40)

A DM-approved failed-save condition can now carry **independent source ownership** and one of three explicit expiration policies: **DM-managed** (default for older saves), **end of your next turn** (the opt-in 2014 Stunning Strike template), or **end of the affected creature’s next turn**. Multiple effects imposing the same condition do not intensify it, and ending one source does not remove another. Existing manually applied or imported conditions are never silently expired by a newly added timed source.

Your **Next turn** action ends your preceding turn and advances your existing personal action economy. For other creatures, select that encounter target and use **End creature turn**, confirmed by the DM, to advance that creature’s independent condition clock. This is **not** an automatic initiative engine; no turn order, reactions between creatures, or external combat events are inferred. The UI allows an individual source to be ended without removing other sources. Undoing your personal turn restores any conditions that expired at that boundary. Ending/restarting encounter tracking conservatively converts unresolved turn-based grants to DM-managed instead of fabricating a new initiative history.

### Staged ability interruption safety (v0.39)

An active staged reaction is attached to the original character, turn and combat assistance mode. Switching to another character **pauses the workflow** but discards that character’s prepared or in-flight dice; switch back and select **Roll target save** to retry. Changing combat mode, ending an encounter or advancing turns **ends** the pending opportunity without refunding the original committed action/Ki. Undoing the turn does not reopen a canceled stage. Confirmation dialogs also expire when switching characters. This is a transaction guard, not a new rules engine.

### Staged ability saving throws (v0.38)

Opt-in abilities can now use the same action-planner transaction for **confirmed trigger → spend resource → target saving throw → conditional effect**. For example, the 2014 Stunning Strike template needs a confirmed melee weapon hit, then spends 1 Ki, asks the original target for a Constitution save against an explicitly configured monk save DC, and offers Stunned **only on a failed save**. Configure the save DC in **Edit sheet → Abilities** before activation; the application does not infer it from imported text. Save dice can be canceled and prepared again without a second Ki charge; the target and saved result cannot be substituted. Conditions are removed manually when the DM confirms their duration ends. This is not automated opponent initiative or a universal class rules engine.

### Qualified combat-outcome reactions (v0.37)

Explicitly configured abilities can now require a **specific successful/failed save ability** or **confirmed incoming damage** with an optional type, minimum applied damage, and minimum actual HP loss. Configure these in **Edit sheet → Abilities → Confirmed event prerequisite**. Eligibility and spending are checked by the same combat planner as attacks, spells, and reactions. Real saving-throw/damage evidence is required for numeric filters; a typed manual event alone cannot fabricate that evidence. An event is still a *one-use, short-lived* opportunity, not an automatic ability activation. If an event changes while an ability confirmation is open, that dialog expires without charging the resource. Manual combat mode remains DM-controlled.

These are generic predicates for approved homebrew/class ability configurations, **not** blanket automation of D&D class features or a Pathfinder ruleset. A DM still adjudicates unqualified effects and conditional stages.

### Character-level rulesets and dice gesture improvements (v0.24+)

Select **Rules → D&D 2014 SRD** on the character sheet to enable all currently **qualified** 2014 effect profiles in one action. Cure Wounds, Healing Word, Shield of Faith, Guidance, Resistance and Bless are presently qualified (self effects only); unsupported spells remain manual. An individual spell may still select **Use manual rules**. A 2024-edition character is not eligible for 2014 automation.

When a requested roll follows the mouse cursor, click anywhere on the tabletop—even between the d20 and d4 or over a sheet control—to pick up the whole group. Drag and release to throw, or click to throw immediately. Press Esc to leave follow mode without consuming effects. When Guidance uses its final charge, its buff token disappears as soon as the roll settles.

See [RULESET_AUTOMATION_CONTRACT.md](RULESET_AUTOMATION_CONTRACT.md) for the data, edition, qualification and gesture contracts.

### Qualified typed automatic bonus dice (v0.23–v0.25)

- Charged effects like **Guidance** appear in the Effects rail with an individual **Auto** checkbox, on by default. Turn it off to keep the charge for later; this setting is saved with the character. Older saved Guidance effects also default to on without rewriting their vault entries.
- When Auto is on, the next explicitly classified **ability check** or **skill check** prepares a d20 plus a d4 together. Advantage/disadvantage prepares two d20s plus the d4; the final total uses the chosen d20, its modifier, and the bonus.
- The effect is consumed **once the physical roll settles**, not when you prepare the dice. Abandoned rolls consume nothing. Already-rolling groups reserve their charge, so another roll cannot claim it. If concentration ends during the throw, the bonus is discarded.
- Saving throws, attacks, concentration saves, raw tabletop dice, spellcasting and damage **do not** automatically consume 2014 Guidance. Resistance adds a d4 to one saving throw, and Bless adds a sustained d4 to eligible self attacks and saves while concentration lasts. Each effect has its own Auto checkbox. Homebrew never gains inferred modifiers from its name.
- The typed roll-bonus contract is restricted to explicitly verified 2014 SRD profiles and self targets; it does not interpret arbitrary rules text.

## Character vault (v0.11+)

- Click **Characters** to switch between saved characters without reimporting a PDF.
- Import a new D&D Beyond PDF to **add** a character. Import an updated PDF of an existing character to review and confirm a merge.
- Reimports update PDF-owned statistics and entries while preserving current HP, spent resources, spell preparation, notes, and manual/DM-approved abilities. The importer never guesses rules missing from the PDF.
- Click **Backup all characters** to export a full vault JSON file. **Import JSON** accepts either a single character or a vault backup (restoring an entire vault requires confirmation).
- The online version stores the vault in IndexedDB. The desktop version stores `vault.json` beside the previous save directory. No uploaded PDFs are stored by the app.
- This release only implements D&D character documents. It records an optional D&D system marker for future versions, not a second rules engine.

## Features in the alpha

| Character management | Tabletop |
|---|---|
| Guided manual D&D 2014 character creation and PDF import | Mouse-controlled 3D-looking dice throws |
| Abilities, saving throws and skills | d4, d6, d8, d10, d12, d20 and percentile dice |
| Attacks, damage, custom actions and features | Reuse matching dice already on the table |
| HP, conditions and expendable resources | Dice travel across the sheet and table |
| Spellbook with prepared and available filters | Persistent rolls and roll history |
| Inventory, notes and JSON import/export | Hideable sheet, expandable dice controls |

**v0.28 release gates:** Python, Node and all 18 real-browser gameplay smoke tests run on every push and PR. Pages deployment waits for those checks to succeed. The spell planner also refuses 2014 automation unless the character has an explicitly confirmed D&D 2014 edition; manual play is unaffected. To run the same checks locally, install `tools/requirements-qa.txt` plus Chromium and run `bash tools/qualify.sh`.

**v0.32 event windows:** Abilities can require explicitly confirmed incoming attacks (before the roll), ranged-weapon hits on you, or your own melee hits. Confirm an event in Abilities; the engine gates eligible reactions and costs. DM/table confirmation is still required for target saves, disadvantage, range and line of sight. Right-click or Escape cancels prepared dice without consuming an action, but does not refund a committed reaction. Details and limitations are in `RULESET_AUTOMATION_CONTRACT.md`.

**v0.31 safety:** The optional Deflect Missiles counterthrow now spends Ki when you actually throw the prepared dice, not when you confirm or prepare them. Switching characters clears prepared dice; in-flight results never affect another character's history or HP. Existing action economy and verified rules are unchanged.

**v0.30 attack permissions:** A DM-approved **Flurry of Blows (2014)** template is available in Edit sheet → Ability template. It requires a confirmed 2014 character, a completed Attack action immediately beforehand, 1 Ki, and an unused bonus action. It grants two **unarmed-only** bonus strikes, not another Attack action or two extra-action units. In Edit sheet, mark the relevant attack as **Unarmed** (classification is explicit, not inferred from its name). Bonus Strike buttons appear on that attack and consume grants only when their physical dice launch. This permission system also supports scoped homebrew bonus strikes; manual mode keeps player-controlled accounting. Any ambiguous imported attack classification stays unqualified. Current limitations: the app tracks declared actions on the character's own turn, not movement timing, other creatures' turns, or every 2014 reaction exception.

**v0.29 configurable combat economy:** The Encounter tab now holds automatic or manual action counting, DM-approved action/bonus/reaction pool capacities, attacks per Attack action, custom resources with rest/turn resets, and explicit abilities that consume multiple action units, require a prior Attack action, grant points, or grant scoped extra actions. Weapon Attack actions are charged when the physical dice **launch**, not when prepared. Two attacks from Extra Attack still consume a single Attack action; Haste-style grants permit one extra attack, while unrestricted Action Surge-style grants permit a new action. All custom effects and resource mechanics require confirmation; no features are inferred from imported text. You can configure three action points as a basis for other game systems, but Pathfinder rules themselves are **not yet implemented**.

**v0.29 effect integrity:** Long rests now end effects through the shared cleanup owner instead of deleting tracked arrays, while manual conditions remain for DM/player adjudication. Concentration checks have stable per-character IDs; undoing damage is blocked after its linked concentration check resolves, and Empty Body only removes Invisibility it introduced. Both engine and Chromium regression tests cover these cases.

**v0.27 spellcasting:** For a D&D 2014 edition character with optional encounter tracking enabled, casting a bonus-action spell blocks other same-turn spells except 1-action cantrips, regardless of whether the spell is an automated SRD profile or a manually adjudicated entry. Action cantrips can precede a bonus spell; a different spell already cast that turn blocks a later bonus spell. The tracker does not model out-of-turn reactions or initiative across all creatures.

**v0.36 saves and damage:** Settled saving throws now carry their own exact roll, target, ability, DC and success/failure. A save will **never** silently mitigate damage merely because it was the last roll against that creature; you explicitly select a linked save and a half/negates-on-success policy in the Dice panel, and the planner checks the association again before changing HP. In tracked Auto/Guided encounters, verified save outcomes and applied self-damage can open short-lived, target-bound event windows for configured abilities. Damage undo is blocked if its event was already used or replaced. Saving throws do not automatically inflict conditions or alter HP.

**v0.21 gameplay:** Older saves with `First-level Spell Slots` work with the same casting controls as modern imports. The Dice panel offers normal/advantage/disadvantage d20 rolls. A resolved natural-20 attack prepares doubled weapon damage dice (flat damage stays unchanged), and encounter targets have manually toggled conditions. Imported spell preparation still matters and is not bypassed.

**Test coverage:** Synthetic automated parser tests plus private QA against three D&D Beyond exports (Fighter 1, Bard 19, Monk 19 / Cleric 1). This is not a guarantee that every class, rules edition, spell, or homebrew field imports correctly.

## Download for Linux / Windows

[**Download desktop alpha ZIP**](https://superior-mi-labs.github.io/Interactive-Tabletop/downloads/SkyBlueEyes-Tabletop-v0.52.0.zip)

This is a **Python 3.10+ and browser-based desktop launcher**, *not* a packaged `.exe` or AppImage. Linux is the tested development environment; Windows batch launchers are supplied but a real Windows machine has not been qualified.

On Linux Mint, after placing the ZIP in `~/Downloads`:

```bash
unzip -p "$HOME/Downloads/SkyBlueEyes-Tabletop-v0.52.0.zip" SkyBlueEyes-Tabletop-v0.52.0/INSTALL.sh | bash
```

Alternatively extract and run `RUN-DESKTOP-LINUX.sh`, or on Windows `RUN-DESKTOP-WINDOWS.bat` (Python 3.10+ required). The desktop app stores its character vault at `~/.skyblueeyes-tabletop/vault.json` (the equivalent user home on Windows). An existing `character.json` remains untouched as a migration backup. Back up before upgrading.

## Release and publishing

The `VERSION` file is authoritative for release metadata. The single CI workflow runs `bash tools/qualify.sh` (Python, JavaScript and 30 actual Chromium smoke tests) before building the Pages site and desktop ZIP from `web/`. The same command is required by `PUBLISH-LINUX.sh`. Generated `docs/` are not a second source of UI truth.

The release publisher requires Playwright and Chromium to be installed for local qualification, refuses to overwrite dirty or unrelated clones, and checks the source version. To publish from Linux, save the source ZIP to `~/Downloads`, extract it there, then run `bash ~/Downloads/Interactive-Tabletop-v0.52.0/PUBLISH-LINUX.sh`. The script verifies the archive, checks tests, uses a clean Git clone and performs a fast-forward-only pull before pushing. Git credentials must be configured on your machine. Publish only after local qualification; GitHub Actions must report a successful Pages deployment before calling the site live.

## Development and architecture

**Want an AI agent to make something?** [AI_START_HERE.md](AI_START_HERE.md) has one copy/paste prompt: replace the idea line, then let the agent read [AGENTS.md](AGENTS.md) and [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md). Detailed [architecture](ARCHITECTURE.md), [rules](RULESET_AUTOMATION_CONTRACT.md), and [release history](CHANGELOG.md) are read only when relevant.

- `web/` — canonical vanilla JavaScript/CSS app and UI assets.
- `docs/` — built GitHub Pages site. **Do not edit generated UI assets here manually.**
- `web/dnd-slots.js` — single resource-identity contract for standard spell slots, including legacy labels and migration. Pact Magic remains separate until reviewed.
- `web/character-import.js` — shared D&D Beyond field normalization for browser and desktop imports.
- `web/vault-store.js` — single vault contract, conservative PDF reconciliation, IndexedDB and desktop storage adapters.
- `web/browser-pdf.js` — browser-only PDF.js field extraction.
- `main.py` and `vendor/pypdf/` — local desktop HTTP API and bundled Python PDF parser.
- `tests/` — parser, model, geometry, and layout regression tests.

Run tests with Python 3, Node.js, and a browser for UI review:

```bash
python3 -I -S -m unittest discover -s tests -p 'test_*.py' -v
node tests/test_import_model.js
node tests/test_vault.js
node tests/test_dice_physics.js
python3 tools/build_site.py
```

**GitHub Pages:** Repository **Settings → Pages → Source: GitHub Actions** (the included `pages.yml` builds `docs/` from `web/`). The live URL works only once Pages has actually deployed. The site is static: no Python API is running on GitHub Pages.

## Verified D&D 2014 self-effect profiles (opt-in)

Cure Wounds, Healing Word, Shield of Faith, Guidance, Resistance and Bless have vetted SRD 5.1 self-target profiles. Expand a spell, choose **Enable 2014 effect**, and confirm. Cure Wounds offers self-healing after rolling (1d8 + explicit spellcasting modifier, +1d8 per higher slot); Healing Word offers self-healing after 1d4 + spellcasting modifier (+1d4 per higher slot), uses a bonus action, and does not automatically heal allies; Shield of Faith creates a concentration-linked AC +2 buff; Guidance creates a concentration-linked one-use d4 bonus for an ability check. The buffs panel displays duration, charges, end controls and pending concentration-save DCs. Resistance supplies one d4 to a saving throw and expires after use. Bless supplies 1d4 on self attacks and saving throws repeatedly for its concentration duration, without spending a charge; other Bless targets require DM handling. These do not overwrite base statistics or imported rules.

This does **not** implement all spell effects. Other spells continue to require manual/DM resolution. The opt-in is specific to the 2014 SRD and does not apply 2024 spell rules. See [D&D effect capability audit](DND_EFFECT_CAPABILITY_AUDIT.md) for all 112 indexed spells and the component roadmap.

## Encounter targets and damage (v0.20 candidate)

Open **Encounter → Encounter targets**. Add a manually configured creature with a name, AC and HP, or select **Self**. You can enter the target's six save modifiers and explicit damage resistances, vulnerabilities and immunities. The shared tabletop rolls actual dice for attacks and saving throws; a result indicates hit/miss or save success/failure **without changing HP**. Damage rolls produce a **Review & apply** option in the Dice panel, where you approve the target, damage type, and optional save reduction before HP changes. You can undo the most recently applied damage until another saved action intervenes.

Damage calculation uses 2014-style resistance, vulnerability, immunity and temporary HP behavior. A single named spell buff cannot contribute its AC modifier more than once. The target roster is stored in the same per-character vault `effects` object; PDF reimports preserve it. To configure custom spell damage, use **Edit sheet** and set an explicit damage roll and damage type—the reference catalog will not auto-grant spell mechanics.

**This is manual player/DM resolution, not an automatic monster simulator.** Your DM decides whether an attack hits under unusual conditions, what damage is rolled on a critical, whether a creature has a damage trait, and how class, spell, or monster exceptions apply. No 2024-specific automation is claimed.

## Known limitations and privacy

- **Not all PDF exports include every custom action.** Missing or ambiguous homebrew must be reviewed and entered manually.
- **No universal rules automation.** Imported values are treated as authoritative; automatic modifiers and resource effects are limited.
- **Approximate dice simulation, not a validated physics or fairness engine.**
- **Multiple local characters.** The vault can switch characters and export/restore all character JSON. Browser storage is device- and profile-specific; it is not cloud synchronization.
- Browser PDF imports load PDF.js from a CDN; an internet connection may be needed for the first import.
- Vault reimport reconciliation is a conservative early-alpha feature, not a perfect merge. Review imported stats and take a JSON backup before large changes.
- Only D&D Beyond fillable-PDF imports are currently supported; other D&D editions and TTRPGs are future design considerations, not functional options.
- **Windows launchers are unverified** until someone runs the release on Windows.
- Report bugs with steps to reproduce and logs; **do not publish other people's character PDFs, private campaign notes, or personal data** in issues.

## Contributing

Issues, pull requests, and import compatibility reports are welcome. Include a *synthetic or redacted* PDF test fixture when possible. Follow the existing single-character-model architecture—don't add separate parsers or duplicate rule state to solve isolated issues.

MIT-licensed source. This is an unofficial community project under [Superior MI Labs](https://github.com/Superior-MI-Labs), not affiliated with or endorsed by D&D Beyond or Wizards of the Coast. D&D and D&D Beyond are their respective owners' trademarks. Original app artwork is included under the repository's licensing terms.


### v0.12 gameplay actions and installed app

- **Use ability** previews the configured cost and dice, requires confirmation, spends resources once, and offers the roll. **Roll** and **Damage** buttons still roll without spending anything.
- To enable a manual healing button, choose **Edit sheet**, open an ability, and choose **Offer HP healing after roll**. A settled dice result then shows **Apply to HP** in the Dice panel. The app never guesses whether an imported feature heals, damages or targets someone else.
- Install the website as an app using your browser's **Install app** menu when offered. The UI shell can work offline after the first successful visit; **PDF importing still requires network access** because PDF.js currently loads from a CDN. This is not yet a fully offline release. Export vault backups regularly.

### v0.13 — Spell casting, concentration and manual durations

- In **Spells**, open a prepared spell and choose **Cast spell**. A preflight summary shows the slot consumed (including higher-level slots), any configured roll, and concentration replacement. Nothing is spent until you confirm. **Unprepared spells and spells with unknown levels cannot be cast** until corrected; cantrips need no slot.
- **Edit sheet** lets you configure spell level, an optional dice expression, optional healing result, concentration, and a turn duration. For imported spells, concentration is indicated only when the **structured PDF duration field** says concentration; it can be overridden manually. Exact damage or healing rolls are **never inferred from prose**.
- Configured **actions** can likewise start tracked effects and concentration with user-entered round durations. Effects appear under **Active effects**: end them manually or use **Next turn** to decrement their counters. An untimed concentration effect stays until explicitly ended or replaced.
- After taking damage while concentrating, the app only **reminds** you to perform a CON save with the DM's DC. It never automatically decides success, removes concentration, applies conditions, or selects targets.
- After a healing roll settles, use **Apply to HP** to apply the rolled amount. Starting an unrelated manual roll invalidates a pending linked healing roll, avoiding incorrectly applying that effect to a different result.
- These controls are aids for player/DM adjudication, **not a comprehensive automated D&D rules engine**. D&D 2014 vs 2024 rules and all homebrew still require review.

**QA gates**: `node tests/test_spell_actions.js` and `python tests/browser_spell_smoke.py` (the latter requires Playwright + Chromium), in addition to the existing regressions. The public website is not automatically updated when this release ZIP is downloaded.

### v0.14 — Optional encounter turns and conditions

- On the **Encounter** tab, click **Start encounter** to track one character's action, bonus action, reaction, and turn number. If the action is already spent, a confirmed use of another configured ability or spell with that same activation is rejected before any Ki/slot is deducted.
- Basic **Attack**, **Damage**, and standalone dice buttons remain manual rolls; when these count toward an action under your DM's rules, click the matching **Action**, **Bonus**, or **Reaction** marker. Ambiguous activation text is never inferred.
- Click **Next turn** once when starting your next turn, which resets those three markers and ticks the existing effect timers. **Undo turn** restores only that last advance before the next saved change. The app does **not** track an entire party's initiative order.
- In **Edit sheet**, configure a spell or custom action's **self-condition** and set its effect to **Apply configured condition to self**. The condition is applied only after confirmed use, and automatically removed when the tracked effect ends only if that effect originally introduced it. Condition results on other creatures require manual DM handling.
- Keep exporting vault backups. The v0.14 source/release candidate is **not automatically deployed to the public site** by downloading these ZIPs.

**QA gates:** `node tests/test_combat_state.js` and `python tests/browser_combat_smoke.py` (latter requires Playwright/Chromium), in addition to existing Node, Python and browser checks.


### v0.15 — Dice interaction overhaul (release candidate)

- Grab dice **above buttons, form fields, and sheet panels**; visible die faces have a forgiving collision target, including d12. The pointer handler intercepts only a genuine die hit, so unrelated buttons still work.
- Drag with left mouse and release to throw, or **right-click to cancel a held or prepared die without throwing it**. The tabletop suppresses its native context menu and accidental selection of sheet text; editable inputs remain editable.
- Throw additional dice while others continue rolling. An in-flight die can be grabbed and rethrown without canceling its original result. Each roll group resolves from its own settled dice rather than a global stop timer.
- Hover and grab highlights make dice easier to target. Simultaneous **healing** effects remain associated with their original dice group; no rule effect is applied without the player confirming it.
- Reference-data approach is explained in `RULES_REFERENCE_DESIGN.md`. No unlicensed or external spell/item database has been added in this patch.
- **Tests:** `node tests/test_dice_interaction.js`, `python tests/browser_dice_interaction_smoke.py`, existing physics/action/spell/vault regressions.


## D&D 2014 SRD reference catalog (v0.17)

The **Reference** workspace tab includes a bundled, searchable starter catalog of **112 spells and 149 equipment entries**, all from the freely published SRD 5.1. Expanded Spells and Inventory entries have **SRD 5.1** reference buttons when their names have a verified SRD match (including a limited set of explicit aliases and ritual suffixes). Standard costs, weights, spell requirements, and summarized rules are **read-only reference data**. Imported data, live combat values, and custom/DM rulings are never overwritten. This is **not** the entire SRD and does not cover the 2024 revision.

Search can filter by spell level, school, components and equipment properties. Ritual markers such as `[R]` on imported spells and two specifically reviewed SRD naming variants are supported; non-SRD names remain unmatched. The permanent **About & licenses** button includes the required Creative Commons attribution and changes notice. See [NOTICE-SRD.md](NOTICE-SRD.md) and [the full SRD](https://dnd.wizards.com/resources/systems-reference-document) for complete rules. This project includes selected SRD 5.1 material licensed under **CC BY 4.0**; that license is distinct from the MIT license covering the application's code.

The canonical catalog source is `web/dnd-2014-reference.json`, not a separate spreadsheet or remote API. The site and desktop application distribute the same JSON. **No gameplay data is fetched from third-party services**, and the catalog does not attempt to infer entries for unlicensed or homebrew spells/items.

### v0.18 — Reference comparison and custom drafts

- Open the **SRD 5.1** reference for an imported spell to compare its PDF level, casting time, range, components, and duration with the 2014 standard. The reference is read-only; missing PDF fields are not silently filled in, and homebrew/DM decisions are never overwritten.
- Use **Open imported spell** to review its existing spell configuration in Edit mode. This avoids generating a second spell/action from the same import.
- For SRD spells **not** on the imported character, the reference dialog offers an optional, confirmed **unconfigured custom action draft** for DM-approved manual customization. It does not teach/grant the spell, mark it prepared, spend a slot, or apply effects.
- This is not a general automatic rules engine. Cross-edition comparisons remain blocked for explicitly 2024-marked characters. Characters whose edition is unspecified must verify which SRD applies.

### Verified melee-hit events (v0.33)

For an Auto or Guided combat encounter, edit an attack to classify **both** its type (weapon/unarmed) and its range (melee/ranged). A settled melee hit against another tracked creature can now unlock event-gated abilities such as a configured Stunning Strike. Auto uses the entered target AC; Guided prompts for Hit or Miss first. The ability is never spent automatically, and an invalid/missing classification stays manual. Existing Deflect Missiles and Warding Flare triggers remain explicit DM events; we do not guess opponent attack timing.
