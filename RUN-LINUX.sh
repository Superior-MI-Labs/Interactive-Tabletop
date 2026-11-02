#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  exec python3 main.py
else
  echo "Python 3.10+ is required."; exit 1
fi
