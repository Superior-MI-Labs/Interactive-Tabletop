"""Real backend vault compatibility, without touching user home."""
import copy
import json
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch
import main


def example(name='A'):
    return {'schema_version': 1, 'name': name, 'hp': {'max': 10, 'current': 8, 'temp': 0}, 'inventory': []}

class VaultServerTests(TestCase):
    def test_migrate_legacy_safely_and_keep_original(self):
        with tempfile.TemporaryDirectory() as tmp:
            old=Path(tmp)/'character.json';old.write_text(json.dumps(example()))
            with patch.object(main,'STATE_PATH',old),patch.object(main,'VAULT_PATH',Path(tmp)/'vault.json'):
                vault=main.read_vault()
                self.assertEqual(vault['characters'][0]['character']['name'],'A')
                self.assertFalse((Path(tmp)/'vault.json').exists())
                self.assertEqual(json.loads(old.read_text())['name'],'A')
                main.write_vault(vault)
                self.assertTrue((Path(tmp)/'vault.json').exists())
                self.assertEqual(main.read_vault(),vault)
                self.assertEqual(json.loads(old.read_text())['name'],'A')

    def test_reject_invalid_and_duplicate_records_without_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/'vault.json';current={'schema_version':1,'active_id':'a','characters':[{'id':'a','character':example(),'updated_at':'today'}]}
            with patch.object(main,'VAULT_PATH',dest):
                main.write_vault(current)
                bad=copy.deepcopy(current);bad['characters'].append(copy.deepcopy(bad['characters'][0]))
                with self.assertRaises(ValueError):main.write_vault(bad)
                self.assertEqual(main.read_vault(),current)
                bad=copy.deepcopy(current);bad['active_id']='missing'
                with self.assertRaises(ValueError):main.write_vault(bad)
                self.assertEqual(main.read_vault(),current)
