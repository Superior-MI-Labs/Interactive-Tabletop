"""Private QA against user-provided PDFs. Never package sample files into the release."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import main
root=Path('/mnt/data')
files=['Ekrei_Bravin_33696962.pdf','EmilyMaratus_172925036(1).pdf','Ekrei_Bravin_49802967(2).pdf']
fields=[main.read_pdf_fields((root/f).read_bytes()) for f in files]
p=Path('/tmp/tabletop-private-pdf-fields.json');p.write_text(json.dumps(fields))
print('PDF widget counts:',[len(x) for x in fields])
