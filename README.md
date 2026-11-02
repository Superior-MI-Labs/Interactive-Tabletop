<div align="center">

# Interactive Tabletop
### Turn your D&D Beyond PDF into an interactive character sheet and dice table.

**FREE · LOCAL-FIRST · EARLY ALPHA / PROTOTYPE**

[**Launch browser alpha**](https://superior-mi-labs.github.io/Interactive-Tabletop/) · [**Download desktop ZIP**](https://superior-mi-labs.github.io/Interactive-Tabletop/downloads/SkyBlueEyes-Tabletop-v0.10.0.zip) · [**Report a bug**](https://github.com/Superior-MI-Labs/Interactive-Tabletop/issues)

![Status: early alpha](https://img.shields.io/badge/status-EARLY%20ALPHA-orange) ![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Linux%20%7C%20Windows-bluegrey)

</div>

> **Early alpha / work in progress.** This is a playable experiment, not a finished rules engine or replacement for D&D Beyond. PDF exports can omit custom abilities; verify imported values. Dice physics and Windows compatibility are still experimental.

## Play in your browser

1. Open [Interactive Tabletop](https://superior-mi-labs.github.io/Interactive-Tabletop/).
2. Select **Upload your D&D Beyond .pdf character sheet here** and choose an exported, fillable PDF.
3. Review the imported sheet, click an attack/save/skill/spell to prepare dice, then throw them around the tabletop.
4. **Export JSON** regularly to back up HP, spell preparation, custom abilities, items, notes and resources.

No signup or application server is needed. The hosted version parses PDF fields in your browser and stores active character data in that browser's local storage. PDF.js code is downloaded from a pinned jsDelivr URL when importing a PDF; the **PDF itself is not intentionally uploaded to any server**. Do not assume local browser storage is permanent, private on shared computers, or synchronized across devices.

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

[**Download desktop alpha ZIP**](https://superior-mi-labs.github.io/Interactive-Tabletop/downloads/SkyBlueEyes-Tabletop-v0.10.0.zip)

This is a **Python 3.10+ and browser-based desktop launcher**, *not* a packaged `.exe` or AppImage. Linux is the tested development environment; Windows batch launchers are supplied but a real Windows machine has not been qualified.

On Linux Mint, after placing the ZIP in `~/Downloads`:

```bash
unzip -p "$HOME/Downloads/SkyBlueEyes-Tabletop-v0.10.0.zip" SkyBlueEyes-Tabletop-v0.10.0/INSTALL.sh | bash
```

Alternatively extract and run `RUN-DESKTOP-LINUX.sh`, or on Windows `RUN-DESKTOP-WINDOWS.bat` (Python 3.10+ required). The desktop app stores the character at `~/.skyblueeyes-tabletop/character.json` (the equivalent user home on Windows). Back up before upgrading.

## Development and architecture

- `web/` — canonical vanilla JavaScript/CSS app and UI assets.
- `docs/` — built GitHub Pages site. **Do not edit generated UI assets here manually.**
- `web/character-import.js` — shared field normalization for browser and desktop imports.
- `web/browser-pdf.js` — browser-only PDF.js field extraction.
- `main.py` and `vendor/pypdf/` — local desktop HTTP API and bundled Python PDF parser.
- `tests/` — parser, model, geometry, and layout regression tests.

Run tests with Python 3, Node.js, and a browser for UI review:

```bash
python3 -I -S -m unittest discover -s tests -p 'test_*.py' -v
node tests/test_import_model.js
node tests/test_dice_physics.js
python3 tools/build_site.py
```

**GitHub Pages:** Repository **Settings → Pages → Deploy from a branch → `main` → `/docs`**. The live URL works only once Pages has actually deployed. The site is static: no Python API is running on GitHub Pages.

## Known limitations and privacy

- **Not all PDF exports include every custom action.** Missing or ambiguous homebrew must be reviewed and entered manually.
- **No universal rules automation.** Imported values are treated as authoritative; automatic modifiers and resource effects are limited.
- **Approximate dice simulation, not a validated physics or fairness engine.**
- **One active character per browser profile.** Export JSON before importing another character or clearing browser data.
- Browser PDF imports load PDF.js from a CDN; an internet connection may be needed for the first import.
- **Windows launchers are unverified** until someone runs the release on Windows.
- Report bugs with steps to reproduce and logs; **do not publish other people's character PDFs, private campaign notes, or personal data** in issues.

## Contributing

Issues, pull requests, and import compatibility reports are welcome. Include a *synthetic or redacted* PDF test fixture when possible. Follow the existing single-character-model architecture—don't add separate parsers or duplicate rule state to solve isolated issues.

MIT-licensed source. This is an unofficial community project under [Superior MI Labs](https://github.com/Superior-MI-Labs), not affiliated with or endorsed by D&D Beyond or Wizards of the Coast. D&D and D&D Beyond are their respective owners' trademarks. Original app artwork is included under the repository's licensing terms.
