#!/usr/bin/env bash
# Publish the tested canonical source ZIP to the existing Superior MI Labs repository.
set -euo pipefail
# The released source is authoritative; no hardcoded previous release number.
VERSION="${TABLETOP_VERSION:-$(cat "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/VERSION")}"
ZIP="${TABLETOP_SOURCE_ZIP:-$HOME/Downloads/Interactive-Tabletop-v${VERSION}-source.zip}"
REMOTE="${TABLETOP_REMOTE:-https://github.com/Superior-MI-Labs/Interactive-Tabletop.git}"
TARGET="${TABLETOP_CLONE:-$HOME/Projects/Interactive-Tabletop}"
for cmd in git unzip mktemp python3 node; do command -v "$cmd" >/dev/null || { echo "Missing: $cmd" >&2; exit 1; }; done
[[ -f "$ZIP" ]] || { echo "Download the v${VERSION} SOURCE ZIP into $HOME/Downloads first." >&2; exit 1; }
[[ -n "$TARGET" && "$TARGET" != / && "$TARGET" != "$HOME" ]] || { echo 'Unsafe target folder' >&2; exit 1; }
# The publisher refuses archives containing symlink or traversal paths.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" -d "$TMP/source"
[[ -f "$TMP/source/web/app.js" && -f "$TMP/source/tools/build_site.py" && -f "$TMP/source/.github/workflows/pages.yml" && "$(tr -d '\n' < "$TMP/source/VERSION")" == "$VERSION" ]] || { echo 'Not a complete Tabletop release package' >&2; exit 1; }
# Review/qualify locally without touching the current working tree or browser saves.
(cd "$TMP/source" && python3 -I -S -m unittest discover -s tests -p 'test_*.py' -q && for test in tests/test_*.js; do node "$test"; done)
if [[ ! -d "$TARGET/.git" ]]; then
  [[ ! -e "$TARGET" || -z "$(ls -A "$TARGET" 2>/dev/null)" ]] || { echo "Target $TARGET exists and is not a Git clone; refusing to overwrite." >&2; exit 1; }
  mkdir -p "$(dirname "$TARGET")"
  git clone --branch main "$REMOTE" "$TARGET"
fi
CURRENT=$(git -C "$TARGET" remote get-url origin)
[[ "$CURRENT" == "$REMOTE" ]] || { echo "Unexpected origin remote: $CURRENT" >&2; exit 1; }
[[ -z "$(git -C "$TARGET" status --porcelain)" ]] || { echo 'Repository contains uncommitted changes; inspect them first.' >&2; exit 1; }
[[ "$(git -C "$TARGET" branch --show-current)" == main ]] || { echo 'Expected main branch; switch branches explicitly first.' >&2; exit 1; }
git -C "$TARGET" pull --ff-only origin main
if ! git -C "$TARGET" var GIT_AUTHOR_IDENT >/dev/null 2>&1; then
  echo "Set your Git author name and email first: git config --global user.name YOUR_NAME ; git config --global user.email YOU@EXAMPLE.COM" >&2
  exit 1
fi
# The GitHub Pages and desktop downloads are generated from canonical web/ and tools/.
# Remove only this repo's generated docs tree, not unrelated files.
rm -rf "$TARGET/docs"
cp -a "$TMP/source/." "$TARGET/"
# The source archive must not carry an embedded .git folder.
git -C "$TARGET" add -A
if git -C "$TARGET" diff --cached --quiet; then echo 'Already up to date.'; exit 0; fi
git -C "$TARGET" commit -m "Release Interactive Tabletop v${VERSION}: gameplay and deployment qualification"
git -C "$TARGET" push origin main
printf '\nPushed source to %s\nGitHub Pages build: https://github.com/Superior-MI-Labs/Interactive-Tabletop/actions\nPublic app: https://superior-mi-labs.github.io/Interactive-Tabletop/\nWait for the Pages workflow to report success before treating the update as live.\n' "$REMOTE"
