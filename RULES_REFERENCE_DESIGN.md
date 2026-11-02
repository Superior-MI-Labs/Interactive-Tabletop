# D&D reference data — architecture decision (v0.15 proposal)

**v0.16 ships the first verified 2014 SRD catalog.** Keep D&D as the only game family; avoid storing complete copyrighted sourcebooks, scraping D&D Beyond, or depending on an online API during gameplay.

## Approaches considered

1. **Live third-party API queries for each spell/item** — easy to prototype, but introduces network dependency, latency, rate limits, inconsistent editions and source/license drift. Don't use as the application's runtime source of truth.
2. **A single versioned, attributed, Git-tracked SRD catalog** — preferred. A build-time importer produces deterministic, audited JSON; the app reads an offline, read-only catalog and never stores copies inside active character state.
3. **CSV/Sheets as runtime database** — rejected. CSV is useful as an optional editing/import surface, not as the distribution/query format.

## Proposed implementation contract (not yet implemented)

- `rules/sources.json` records the licensed source, version, date, attribution, URL, review status, and allowed content types.
- `rules/dnd-2014/{spells,equipment,conditions,classes}.json` draws only from the properly attributed **SRD 5.1** (CC-BY-4.0).
- `rules/dnd-2024/...` separately uses **SRD 5.2.1** (CC-BY-4.0); do **not** merge the two editions by name alone.
- Each reference record has stable `{id, edition, kind, name, rules, source_id, source_page_or_section, license}` keys and structured optional fields such as level, casting time, range, duration, concentration, components, cost and weight.
- Case-insensitive exact-name lookup with an explicit edition, followed by aliases and a confidence flag; ambiguities display a choice rather than silently assuming a match.
- Data adapters may use **Open5e v2** or the community **D&D 5e API** at *build time* after auditing each record's license and origin. Never imply those APIs include every D&D Beyond ability or non-SRD spell.
- Imported PDF fields remain authoritative for a character's numbers and description. **User/DM-approved edits override** optional catalog descriptions. A reference match can enrich missing general metadata (e.g., weight or rules description), but must never change attack bonus, HP, spell preparation, resource cost, or custom mechanic without review.
- Keep a clear provenance indicator: `PDF`, `SRD 5.1`, `SRD 5.2.1`, or `Custom/DM`. Never bundle private character PDFs into the public catalog.
- Include licenses, attribution, and per-entry provenance with each published data pack, and run schema validation, duplicate-ID detection, reference integrity and snapshot-diff tests in CI.

## License notes

- Official D&D SRD overview and downloads: https://www.dndbeyond.com/srd
- SRD 5.1 and 5.2.1 are separately available under Creative Commons Attribution 4.0; any redistributed text must use the correct attribution and remain within the licensed material.
- Open5e API docs: https://open5e.com/api-docs/ — v2 is the current API.
- D&D 5e API FAQ: https://docs.dnd5eapi.co/faq — explicitly SRD-only content.
- The app's MIT source license does not supersede the SRD's license, and non-SRD books remain outside the catalog unless separately licensed.

## Release gate before adding the catalog

1. Confirm exact SRD release and required attribution.
2. Import a small, audited set of spells/items into a read-only content index.
3. Check against original PDF exports, homebrew records and 2014/2024 name conflicts.
4. Provide a visible “Reference” panel with provenance and a separate DM override. Confirm offline operation.
5. Only then expand to a larger edition-specific catalog. No need for a database server or spreadsheet dependency.

## v0.16 implemented

`web/dnd-2014-reference.json` contains an edition-isolated, read-only SRD 5.1 catalog with provenance, 35 spells and 149 equipment entries; `web/reference-catalog.js` indexes exact-name matches without mutating saved characters. The persistent About & licenses modal and `NOTICE-SRD.md` contain attribution. Other D&D editions and complete SRD coverage remain future work.

## v0.17 scope and alias policy

The canonical `web/dnd-2014-reference.json` now contains 112 selected SRD 5.1 spells and 149 equipment entries, including short descriptions and spell metadata. A catalog lookup may strip only the exported trailing `[R]`/`[Ritual]` marker and recognize the explicitly reviewed `Tasha's Hideous Laughter` ↔ `Hideous Laughter` and `Leomund's Tiny Hut` ↔ `Tiny Hut` naming variants. No edit-distance/fuzzy matching and no 2014→2024 implicit mapping. Read-only reference descriptions must not be auto-executed as rule effects.
