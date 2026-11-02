import io
import json
import os
import sys
import unittest
from pathlib import Path

# main establishes the bundled pypdf path. Import it before test-only PDF
# writer helpers so both runtime and tests use the same dependency source.
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import main
from pypdf import PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, TextStringObject, NumberObject

class ImporterTests(unittest.TestCase):
    def test_pdf_dependency_uses_bundled_copy(self):
        import pypdf
        bundled = (main.ROOT / 'vendor' / 'pypdf').resolve()
        self.assertEqual(Path(pypdf.__file__).resolve().parent, bundled)

    def test_generic_default_has_no_character_data(self):
        self.assertFalse((main.ROOT/'web/starter.json').exists())
        self.assertFalse((main.ROOT/'web/portrait.jpg').exists())

    def test_pdf_without_global_acroform(self):
        writer=PdfWriter();page=writer.add_blank_page(612,792)
        ann=DictionaryObject({NameObject('/Type'):NameObject('/Annot'),
          NameObject('/Subtype'):NameObject('/Widget'),NameObject('/T'):TextStringObject('CharacterName'),
          NameObject('/V'):TextStringObject('Test Hero'),
          NameObject('/Rect'):ArrayObject([NumberObject(10),NumberObject(10),NumberObject(100),NumberObject(30)])})
        ann_ref=writer._add_object(ann)
        page[NameObject('/Annots')]=ArrayObject([ann_ref])
        b=io.BytesIO();writer.write(b)
        self.assertEqual(main.read_pdf_fields(b.getvalue())['CharacterName'],'Test Hero')

    def test_invalid_pdf(self):
        with self.assertRaises(ValueError):main.read_pdf_fields(b'not a pdf')

    def test_number(self):
        self.assertEqual(main.number('80,592'),80592)
        self.assertEqual(main.signed('+19'),19)

if __name__=='__main__':
    unittest.main()
