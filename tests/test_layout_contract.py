"""Regression contract: persistent character HUD, one workspace, unchanged dice pipeline."""
from pathlib import Path
import unittest

WEB=Path(__file__).resolve().parents[1]/'web'

class LayoutContract(unittest.TestCase):
    def test_workspace_and_handlers(self):
        html=(WEB/'index.html').read_text()
        js=(WEB/'app.js').read_text()
        css=(WEB/'styles.css').read_text()
        self.assertNotIn('id="nav"', html)  # no independent page navigation
        self.assertNotIn('Rules & character details',js)
        for name in ('function identityRibbon()', 'function overview()', 'function workspaceTabs()', 'function workspacePane()', 'function actionWorkspace()', 'function inventory()', 'function spells()', 'function features()'):
            self.assertIn(name,js)
        self.assertIn('hud-four',js)
        for name in ('attackRows()',"rollRows('saves','editable')","rollRows('skills','editable')",'combatActions()', 'queueRoll('):
            self.assertIn(name,js)
        self.assertIn('dice-canvas',html)
        self.assertIn('grid-template-columns:minmax(170px',css)
        self.assertIn('function loadThemeAssets()',js)
        self.assertIn('surface.table',(WEB/'theme-assets.json').read_text())
