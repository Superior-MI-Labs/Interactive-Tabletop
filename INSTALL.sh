#!/usr/bin/env bash
# One-ZIP Phoenix Tabletop installer. Run via:
# unzip -p "$HOME/Downloads/SkyBlueEyes-Tabletop-v0.48.0.zip" SkyBlueEyes-Tabletop-v0.48.0/INSTALL.sh | bash
set -Eeuo pipefail

VERSION='v0.48.0'
ROOT_NAME="SkyBlueEyes-Tabletop-$VERSION"
DOWNLOADS="${SKY_DOWNLOADS_DIR:-$HOME/Downloads}"
ZIP="$DOWNLOADS/$ROOT_NAME.zip"
APP="${SKY_INSTALL_DIR:-$HOME/Applications/SkyBlueEyes-Tabletop}"
PARENT="$(dirname "$APP")"
SAVE="${SKY_SAVE_DIR:-$HOME/.skyblueeyes-tabletop}"
STAMP="$(date +%Y%m%d-%H%M%S)-$$"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -f "$ZIP" ]] || fail "Cannot find $ZIP. Put the ZIP in Downloads first."
command -v python3 >/dev/null || fail 'Python 3.10 or newer is required.'
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || fail 'Python 3.10 or newer is required.'

# Do not overwrite the app while an earlier local server is running.
if ! python3 - <<'PY'
import socket,sys
with socket.socket() as s:
    s.settimeout(.5)
    sys.exit(0 if s.connect_ex(('127.0.0.1',8765)) else 1)
PY
then
    fail 'Something is already using port 8765. Close the old Phoenix Tabletop window/terminal (Ctrl+C), then rerun.'
fi

[[ ! -L "$APP" ]] || fail "Install location is a symlink: $APP"
mkdir -p -- "$PARENT"
STAGE="$(mktemp -d "$PARENT/.skyblueeyes-install.XXXXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT

printf 'Checking and extracting %s...\n' "$ZIP"
python3 - "$ZIP" "$STAGE" "$ROOT_NAME" <<'PY'
import stat, sys
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
archive, target, expected = sys.argv[1:]
with ZipFile(archive) as z:
    if z.testzip() is not None:
        raise SystemExit('ZIP integrity check failed. Download a fresh copy.')
    found=set()
    for entry in z.infolist():
        name=entry.filename
        path=PurePosixPath(name)
        mode=entry.external_attr >> 16
        if (path.is_absolute() or '..' in path.parts or not path.parts or
                path.parts[0] != expected or stat.S_ISLNK(mode) or
                name in found):
            raise SystemExit(f'Unexpected/unsafe ZIP entry: {name}')
        found.add(name)
    z.extractall(target)
PY
SOURCE="$STAGE/$ROOT_NAME"
for file in main.py desktop.py RUN-LINUX.sh RUN-DESKTOP-LINUX.sh web/index.html web/app.js web/dice-physics.js web/dnd-slots.js vendor/pypdf/__init__.py; do
    [[ -f "$SOURCE/$file" ]] || fail "Incomplete release: missing $file"
done
printf 'Running offline tests...\n'
(cd "$SOURCE" && python3 -I -S -m unittest discover -s tests -q)

# Back up both the old single-character file and the new multi-character vault.
# Save data lives outside the application directory.
for filename in character.json vault.json; do
    if [[ -f "$SAVE/$filename" ]]; then
        mkdir -p -- "$SAVE/backups"
        cp -p -- "$SAVE/$filename" "$SAVE/backups/${filename%.json}-before-$VERSION-$STAMP.json"
        echo "Backed up $filename to $SAVE/backups"
    fi
done

PREVIOUS=""
if [[ -e "$APP" ]]; then
    [[ -d "$APP" ]] || fail "Install destination exists but is not a directory: $APP"
    PREVIOUS="$PARENT/.skyblueeyes-previous-$STAMP"
    mv -- "$APP" "$PREVIOUS"
fi
if ! mv -- "$SOURCE" "$APP"; then
    [[ -z "$PREVIOUS" ]] || mv -- "$PREVIOUS" "$APP"
    fail 'Installation failed; previous app restored.'
fi
printf 'Installed at: %s\n' "$APP"

# Application menu shortcut only for normal installs, never testing overrides.
if [[ -z "${SKY_INSTALL_DIR:-}" && "$APP" != *$'\n'* && "$APP" != *'"'* && "$APP" != *'\\'* ]]; then
    MENU="$HOME/.local/share/applications/skyblueeyes-tabletop.desktop"
    mkdir -p -- "$(dirname "$MENU")"
    cat > "$MENU" <<EOF
[Desktop Entry]
Type=Application
Name=Interactive Tabletop
Comment=Offline character sheet and physical dice table
Exec=/bin/bash "$APP/RUN-DESKTOP-LINUX.sh"
Icon=$APP/web/solar-crest.png
Terminal=false
Categories=Game;Utility;
EOF
    echo 'Application-menu shortcut installed.'
fi

# Restrict removal to explicitly known, versioned old release artifacts.
# Prefer Trash; never delete character saves, images, other project files.
discard_old() {
    local path="$1"
    [[ -e "$path" || -L "$path" ]] || return 0
    if command -v gio >/dev/null 2>&1 && gio trash -- "$path" 2>/dev/null; then
        printf 'Trashed old release: %s\n' "$path"
    else
        # These paths are exclusively fixed names of prior SkyBlueEyes releases.
        rm -rf -- "$path"
        printf 'Removed old release: %s\n' "$path"
    fi
}
[[ -z "$PREVIOUS" ]] || discard_old "$PREVIOUS"
for folder in "$DOWNLOADS" "$PARENT"; do
    [[ -d "$folder" ]] || continue
    for version in v0.24.0 v0.23.0 v0.22.0 v0.21.0 v0.20.0 v0.19.0 v0.18.0 v0.17.0 v0.16.0 v0.15.0 v0.14.0 v0.13.0 v0.12.0 v0.11.0 v0.1 v0.2 v0.3 v0.4 v0.5 v0.6 v0.7 v0.7.1 v0.8 v0.9 v0.9.1 v0.9.2 v0.10.0; do
        discard_old "$folder/SkyBlueEyes-Tabletop-$version"
        discard_old "$folder/SkyBlueEyes-Tabletop-$version.zip"
    done
done
# Current ZIP is retained in Downloads for reinstall; don't discard it.

if [[ "${SKY_INSTALL_ONLY:-0}" == '1' ]]; then
    echo 'Install-only mode: launch skipped.'
    exit 0
fi
printf '\nStarting Phoenix Tabletop. Close the application to stop the server.\n'
if [[ "${SKY_LAUNCH_MODE:-desktop}" == 'browser' ]]; then
    exec bash "$APP/RUN-LINUX.sh"
else
    exec bash "$APP/RUN-DESKTOP-LINUX.sh"
fi
