"""Guard D&D Beyond form parsing and non-destructive legacy migrations."""
import io
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import main

class ActionPipelineTests(unittest.TestCase):
    def test_exported_action_and_feature_rules(self):
        features=[{'title':'Features & Traits 2','text':'* Quickened Healing • TCoE\nAs an action, you can spend 2 ki points to regain 1d10+6 hit points.\n\n | 1 Action\n* Evasion • PHB\nPassive benefit.'},
                  {'title':'Actions','text':'=== BONUS ACTIONS ===\nPatient Defense\n     You can spend 1 ki point to take Dodge as a bonus action.\n\nStep of the Wind\n     Spend 1 ki point to Dash.\n\n=== REACTIONS ==='}]
        actions=main.extract_actions(features,[])
        lookup={a['name']:a for a in actions}
        self.assertEqual(set(lookup),{'Quickened Healing','Patient Defense','Step of the Wind'})
        self.assertEqual(lookup['Quickened Healing']['roll'],'1d10+6')
        self.assertEqual(lookup['Quickened Healing']['cost'],2)
        self.assertEqual(lookup['Patient Defense']['activation'],'bonus action')
        self.assertFalse(lookup['Step of the Wind']['damage'])

    def test_legacy_character_preserves_preparation_without_injected_actions(self):
        legacy={'schema_version':1,'name':'Any Hero',
            'spells':[{'id':'spell-1','name':'Light','prepared':True}],
            'features':[],'attacks':[]}
        result=main.migrate_character(legacy)
        self.assertTrue(result['spells'][0]['prepared'])
        self.assertIsNone(result['spells'][0]['level'])
        self.assertEqual(result['actions'],[])

    def test_missing_screenshot_actions_are_not_claimed_as_pdf_extracted(self):
        docs=[{'title':'Actions','text':'=== ACTIONS ===\nPatient Defense\n     Bonus action.'}]
        found=main.extract_actions(docs,[])
        self.assertNotIn('Solar Radiance',[a['name'] for a in found])
        self.assertNotIn('Phoenix Healing',[a['name'] for a in found])

    def test_non_sky_not_injected_with_custom_references(self):
        state={'name':'Another Hero','features':[],'attacks':[],'actions':[],'spells':[]}
        self.assertEqual(main.migrate_character(state)['actions'],[])

if __name__=='__main__':unittest.main()
