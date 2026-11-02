<div align="center">

# Interactive Tabletop
### Turn your D&D Beyond PDF into an interactive character sheet and dice table.

**FREE · LOCAL-FIRST · EARLY ALPHA / PROTOTYPE**

> **v0.18.0 public alpha.** This is experimental software. Back up your Character Vault before upgrades, and verify PDF-imported values and DM-approved rules.

[**Launch browser alpha**](https://superior-mi-labs.github.io/Interactive-Tabletop/) · [**Download desktop ZIP**](https://superior-mi-labs.github.io/Interactive-Tabletop/downloads/SkyBlueEyes-Tabletop-v0.18.0.zip) · [**Report a bug**](https://github.com/Superior-MI-Labs/Interactive-Tabletop/issues)

![Status: early alpha](https://img.shields.io/badge/status-EARLY%20ALPHA-orange) ![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Linux%20%7C%20Windows-bluegrey)

</div>

> **Early alpha / work in progress.** This is a playable experiment, not a finished rules engine or replacement for D&D Beyond. PDF exports can omit custom abilities; verify imported values. Dice physics and Windows compatibility are still experimental.

## Play in your browser

1. Open [Interactive Tabletop](https://superior-mi-labs.github.io/Interactive-Tabletop/).
2. Select **Upload your D&D Beyond .pdf character sheet here** and choose an exported, fillable PDF.
3. Review the imported sheet, click an attack/save/skill/spell to prepare dice, then throw them around the tabletop.
4. **Export JSON** regularly to back up HP, spell preparation, custom abilities, items, notes and resources.

No signup or application server is needed. The hosted version parses PDF fields in your browser and stores a multi-character vault in IndexedDB. Previously saved single-character localStorage data is migrated without deleting the recovery copy. PDF.js code is downloaded from a pinned jsDelivr URL when importing a PDF; the **PDF itself is not intentionally uploaded to any server**. Do not assume local browser storage is permanent, private on shared computers, or synchronized across devices.

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

**Test coverage:** Synthetic automated parser tests plus private QA against three D&D Beyond exports (Fighter 1, Bard 19, Monk 19 / Cleric 1). This is not a guarantee that every class, rules edition, spell, or homebrew field imports correctly.

## Download for Linux / Windows

[**Download desktop alpha ZIP**](https://superior-mi-labs.github.io/Interactive-Tabletop/downloads/SkyBlueEyes-Tabletop-v0.18.0.zip)

This is a **Python 3.10+ and browser-based desktop launcher**, *not* a packaged `.exe` or AppImage. Linux is the tested development environment; Windows batch launchers are supplied but a real Windows machine has not been qualified.

On Linux Mint, after placing the ZIP in `~/Downloads`:

```bash
unzip -p "$HOME/Downloads/SkyBlueEyes-Tabletop-v0.18.0.zip" SkyBlueEyes-Tabletop-v0.18.0/INSTALL.sh | bash
```

Alternatively extract and run `RUN-DESKTOP-LINUX.sh`, or on Windows `RUN-DESKTOP-WINDOWS.bat` (Python 3.10+ required). The desktop app stores its character vault at `~/.skyblueeyes-tabletop/vault.json` (the equivalent user home on Windows). An existing `character.json` remains untouched as a migration backup. Back up before upgrading.

## Development and architecture

- `web/` — canonical vanilla JavaScript/CSS app and UI assets.
- `docs/` — built GitHub Pages site. **Do not edit generated UI assets here manually.**
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

**GitHub Pages:** Repository **Settings → Pages → Deploy from a branch → `main` → `/docs`**. The live URL works only once Pages has actually deployed. The site is static: no Python API is running on GitHub Pages.

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
