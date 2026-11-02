#!/usr/bin/env python3
"""Local desktop host for Sky Blue Eyes. One Python server, one character document.

Prefers Qt WebEngine when installed; otherwise launches Chromium/Edge in app mode.
No separate state model, app services, or network hosting is introduced.
"""
from __future__ import annotations
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import webbrowser
from http.server import ThreadingHTTPServer
from pathlib import Path
from main import Handler

URL = 'http://127.0.0.1:8765/'


def start_server(port=8765):
    class LocalServer(ThreadingHTTPServer):
        allow_reuse_address = True
    server = LocalServer(('127.0.0.1', port), Handler)
    task = threading.Thread(target=server.serve_forever, daemon=True, name='SkyBlueEyesHttp')
    task.start()
    return server, task


def qt_window():
    try:
        from PySide6.QtCore import QUrl
        from PySide6.QtWidgets import QApplication, QMainWindow
        from PySide6.QtWebEngineWidgets import QWebEngineView
    except ImportError:
        return None
    app = QApplication(sys.argv)
    window = QMainWindow()
    window.setWindowTitle('Sky Blue Eyes · Tabletop')
    window.setMinimumSize(800, 550)
    window.resize(1460, 940)
    browser = QWebEngineView(window)
    browser.load(QUrl(URL))
    window.setCentralWidget(browser)
    window.show()
    return app.exec()


def browser_app():
    # Use a fresh, isolated browser profile, so --app creates its own window.
    # The temporary profile is only chrome state; character saves stay in ~/.skyblueeyes-tabletop.
    candidates = (['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge']
                  if os.name != 'nt' else ['msedge.exe', 'chrome.exe'])
    browser = next((shutil.which(name) for name in candidates if shutil.which(name)), None)
    if not browser and os.name == 'nt':
        paths = [Path(os.environ.get('PROGRAMFILES(X86)', r'C:\Program Files (x86)'))/'Microsoft/Edge/Application/msedge.exe',
                 Path(os.environ.get('PROGRAMFILES', r'C:\Program Files'))/'Google/Chrome/Application/chrome.exe']
        browser = next((str(path) for path in paths if path.exists()), None)
    if browser:
        with tempfile.TemporaryDirectory(prefix='skyblueeyes-window-') as profile:
            p = subprocess.Popen([browser, f'--app={URL}', f'--user-data-dir={profile}', '--no-first-run'])
            return p.wait()
    print(f'No embedded/standalone browser found. Opening your normal browser at {URL}')
    webbrowser.open(URL)
    print('Press Ctrl+C to stop the local application server.')
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        return 0


def main():
    try:
        server, task = start_server()
    except OSError as exc:
        print(f'Cannot bind the local tabletop on port 8765: {exc}. Close previous versions first.', file=sys.stderr)
        return 1
    try:
        outcome = qt_window()
        return browser_app() if outcome is None else outcome
    finally:
        server.shutdown()
        task.join(timeout=3)
        server.server_close()


if __name__ == '__main__':
    raise SystemExit(main())
