"""One Chromium launcher for local installed Chromium and CI Playwright browsers."""
import os
from pathlib import Path


def launch_chromium(playwright):
    selected = os.environ.get('TABLETOP_CHROMIUM')
    if not selected and Path('/usr/bin/chromium').is_file():
        selected = '/usr/bin/chromium'
    options = {'headless': True, 'args': ['--no-sandbox']}
    if selected and selected != 'managed':
        options['executable_path'] = selected
    return playwright.chromium.launch(**options)
