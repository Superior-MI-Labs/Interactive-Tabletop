<div align="center">

# Interactive Tabletop
### Turn your D&D Beyond PDF into an interactive character sheet and dice table.

**FREE · LOCAL-FIRST · EARLY ALPHA / PROTOTYPE**

> **v0.31.0 alpha:** GitHub Pages deploys from the canonical `web/` source after its release checks pass. Verify the site version in the browser before assuming a push is live.

[**Launch browser alpha**](https://superior-mi-labs.github.io/Interactive-Tabletop/) · [**Download desktop ZIP**](https://superior-mi-labs.github.io/Interactive-Tabletop/downloads/SkyBlueEyes-Tabletop-v0.31.0.zip) · [**Report a bug**](https://github.com/Superior-MI-Labs/Interactive-Tabletop/issues)

![Status: early alpha](https://img.shields.io/badge/status-EARLY%20ALPHA-orange) ![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Linux%20%7C%20Windows-bluegrey)

</div>

> **Early alpha / work in progress.** This is a playable experiment, not a finished rules engine or replacement for D&D Beyond. PDF exports can omit custom abilities; verify imported values. Dice physics and Windows compatibility are still experimental.

## Play in your browser

1. Open [Interactive Tabletop](https://superior-mi-labs.github.io/Interactive-Tabletop/).
2. Select **Upload your D&D Beyond .pdf character sheet here** and choose an exported, fillable PDF.
3. Review the imported sheet, click an attack/save/skill/spell to prepare dice, then throw them around the tabletop.
4. **Export JSON** regularly to back up HP, spell preparation, custom abilities, items, notes and resources.

No signup or application server is needed. The hosted version parses PDF fields in your browser and stores a multi-character vault in IndexedDB. Previously saved single-character localStorage data is migrated without deleting the recovery copy. PDF.js code is downloaded from a pinned jsDelivr URL when importing a PDF; the **PDF itself is not intentionally uploaded to any server**. Do not assume local browser storage is permanent, private on shared computers, or synchronized across devices.


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
| D&D Beyond fillable-PDF import | Mouse-controlled 3D-looking dice throws |
| Abilities, saving throws and skills | d4, d6, d8, d10, d12, d20 and percentile dice |
| Attacks, damage, custom actions and features | Reuse matching dice already on the table |
| HP, conditions and expendable resources | Dice travel across the sheet and table |
| Spellbook with prepared and available filters | Persistent rolls and roll history |
| Inventory, notes and JSON import/export | Hideable sheet, expandable dice controls |

**v0.28 release gates:** Python, Node and all 18 real-browser gameplay smoke tests run on every push and PR. Pages deployment waits for those checks to succeed. The spell planner also refuses 2014 automation unless the character has an explicitly confirmed D&D 2014 edition; manual play is unaffected. To run the same checks locally, install `tools/requirements-qa.txt` plus Chromium and run `bash tools/qualify.sh`.

**v0.31 safety:** The optional Deflect Missiles counterthrow now spends Ki when you actually throw the prepared dice, not when you confirm or prepare them. Switching characters clears prepared dice; in-flight results never affect another character's history or HP. Existing action economy and verified rules are unchanged.

**v0.30 attack permissions:** A DM-approved **Flurry of Blows (2014)** template is available in Edit sheet → Ability template. It requires a confirmed 2014 character, a completed Attack action immediately beforehand, 1 Ki, and an unused bonus action. It grants two **unarmed-only** bonus strikes, not another Attack action or two extra-action units. In Edit sheet, mark the relevant attack as **Unarmed** (classification is explicit, not inferred from its name). Bonus Strike buttons appear on that attack and consume grants only when their physical dice launch. This permission system also supports scoped homebrew bonus strikes; manual mode keeps player-controlled accounting. Any ambiguous imported attack classification stays unqualified. Current limitations: the app tracks declared actions on the character's own turn, not movement timing, other creatures' turns, or every 2014 reaction exception.

**v0.29 configurable combat economy:** The Actions tab now supports automatic or manual action counting, DM-approved action/bonus/reaction pool capacities, attacks per Attack action, custom resources with rest/turn resets, and explicit abilities that consume multiple action units, require a prior Attack action, grant points, or grant scoped extra actions. Weapon Attack actions are charged when the physical dice **launch**, not when prepared. Two attacks from Extra Attack still consume a single Attack action; Haste-style grants permit one extra attack, while unrestricted Action Surge-style grants permit a new action. All custom effects and resource mechanics require confirmation; no features are inferred from imported text. You can configure three action points as a basis for other game systems, but Pathfinder rules themselves are **not yet implemented**.

**v0.29 effect integrity:** Long rests now end effects through the shared cleanup owner instead of deleting tracked arrays, while manual conditions remain for DM/player adjudication. Concentration checks have stable per-character IDs; undoing damage is blocked after its linked concentration check resolves, and Empty Body only removes Invisibility it introduced. Both engine and Chromium regression tests cover these cases.

**v0.27 spellcasting:** For a D&D 2014 edition character with optional encounter tracking enabled, casting a bonus-action spell blocks other same-turn spells except 1-action cantrips, regardless of whether the spell is an automated SRD profile or a manually adjudicated entry. Action cantrips can precede a bonus spell; a different spell already cast that turn blocks a later bonus spell. The tracker does not model out-of-turn reactions or initiative across all creatures.

**v0.21 gameplay:** Older saves with `First-level Spell Slots` work with the same casting controls as modern imports. The Dice panel offers normal/advantage/disadvantage d20 rolls. A resolved natural-20 attack prepares doubled weapon damage dice (flat damage stays unchanged), and encounter targets have manually toggled conditions. Imported spell preparation still matters and is not bypassed.

**Test coverage:** Synthetic automated parser tests plus private QA against three D&D Beyond exports (Fighter 1, Bard 19, Monk 19 / Cleric 1). This is not a guarantee that every class, rules edition, spell, or homebrew field imports correctly.

## Download for Linux / Windows

[**Download desktop alpha ZIP**](https://superior-mi-labs.github.io/Interactive-Tabletop/downloads/SkyBlueEyes-Tabletop-v0.31.0.zip)

This is a **Python 3.10+ and browser-based desktop launcher**, *not* a packaged `.exe` or AppImage. Linux is the tested development environment; Windows batch launchers are supplied but a real Windows machine has not been qualified.

On Linux Mint, after placing the ZIP in `~/Downloads`:

```bash
unzip -p "$HOME/Downloads/SkyBlueEyes-Tabletop-v0.31.0.zip" SkyBlueEyes-Tabletop-v0.31.0/INSTALL.sh | bash
```

Alternatively extract and run `RUN-DESKTOP-LINUX.sh`, or on Windows `RUN-DESKTOP-WINDOWS.bat` (Python 3.10+ required). The desktop app stores its character vault at `~/.skyblueeyes-tabletop/vault.json` (the equivalent user home on Windows). An existing `character.json` remains untouched as a migration backup. Back up before upgrading.

## Release and publishing

The `VERSION` file is authoritative for release metadata. The single CI workflow runs `bash tools/qualify.sh` (Python, JavaScript and 18 actual Chromium smoke tests) before building the Pages site and desktop ZIP from `web/`. The same command is required by `PUBLISH-LINUX.sh`. Generated `docs/` are not a second source of UI truth.

The release publisher requires Playwright and Chromium to be installed for local qualification, refuses to overwrite dirty or unrelated clones, and checks the source version. To publish from Linux, save the source ZIP to `~/Downloads`, extract it there, then run `bash ~/Downloads/Interactive-Tabletop-v0.31.0/PUBLISH-LINUX.sh`. The script verifies the archive, checks tests, uses a clean Git clone and performs a fast-forward-only pull before pushing. Git credentials must be configured on your machine. Publish only after local qualification; GitHub Actions must report a successful Pages deployment before calling the site live.

## Development and architecture

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

Open **Actions → Encounter targets**. Add a manually configured creature with a name, AC and HP, or select **Self**. You can enter the target's six save modifiers and explicit damage resistances, vulnerabilities and immunities. The shared tabletop rolls actual dice for attacks and saving throws; a result indicates hit/miss or save success/failure **without changing HP**. Damage rolls produce a **Review & apply** option in the Dice panel, where you approve the target, damage type, and optional save reduction before HP changes. You can undo the most recently applied damage until another saved action intervenes.

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

- On the **Actions** tab, click **Start encounter** to track one character's action, bonus action, reaction, and turn number. If the action is already spent, a confirmed use of another configured ability or spell with that same activation is rejected before any Ki/slot is deducted.
- Basic **Attack**, **Damage**, and standalone dice buttons remain manual rolls; when these count toward an action under your DM's rules, click the matching **Action**, **Bonus**, or **Reaction** marker. Ambiguous activation text is never inferred.
- Click **Next turn** once when starting your next turn, which resets those three markers and ticks the existing effect timers. **Undo turn** restores only that last advance before the next saved change. The app does **not** track an entire party's initiative order.
- In **Edit sheet**, configure a spell or custom action's **self-condition** and set its effect to **Apply configured condition to self**. The condition is applied only after confirmed use, and automatically removed when the tracked effect ends only if that effect originally introduced it. Condition results on other creatures require manual DM handling.
- Keep exporting vault backups. The v0.14 source/release candidate is **not automatically deployed to the public site** by downloading these ZIPs.

**QA gates:** `node tests/test_combat_state.js` and `python tests/browser_combat_smoke.py` (latter requires Playwright/Chromium), in addition to existing Node, Python and browser checks.


### v0.15 — Dice interaction overhaul (release candidate)

- Grab dice **above buttons, form fields, and sheet panels**; visible die faces have a forgiving collision target, including d12. The pointer handler intercepts only a genuine die hit, so unrelated buttons still work.
- Drag with left mouse and release to throw, or **right-click while holding a die to release it**. The tabletop suppresses its native context menu and accidental selection of sheet text; editable inputs remain editable.
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
