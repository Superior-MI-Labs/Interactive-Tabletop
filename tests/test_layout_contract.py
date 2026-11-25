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
        # All sheet rows are projections of the same character record;
        # gameplay is no longer constrained to the old four-column grid.
        for name in ('function abilityStrip()', 'function skillRolls()', 'function resourceStrip()',
                     'function resourcePips(', 'attackRows()', 'combatActions()', 'queueRoll('):
            self.assertIn(name,js)
        self.assertIn('${abilityStrip()}',js)
        self.assertIn('${skillRolls()}',js)
        self.assertIn('${resourceStrip()}',js)
        self.assertIn('${workspacePane()}',js)
        self.assertNotIn('hud-four',js)
        self.assertNotIn("panel('Saving throws'",js)
        self.assertNotIn("rollRows('saves'",js)
        self.assertIn('data-roll-kind="save"',js)
        self.assertIn("const choice=d20Mode;",js)
        self.assertIn('dice-canvas',html)
        self.assertIn('class="dice-dock"',html)
        self.assertEqual(html.count('data-d20-mode='),3)
        self.assertNotIn('id="d20-mode"',html)
        self.assertIn('#page .sheet-layout{display:flex',css)
        self.assertIn('#page .skill-chips{display:flex',css)
        self.assertIn('#page .resources-strip .pip-row{display:grid;grid-template-columns:repeat(10,14px)',css)
        self.assertIn('#page .hearts{flex-wrap:wrap',css)
        self.assertIn('function loadThemeAssets()',js)
        self.assertIn('surface.table',(WEB/'theme-assets.json').read_text())
