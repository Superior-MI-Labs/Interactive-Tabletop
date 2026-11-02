"""Real HTTP vault smoke, isolated from the user's home and application port."""
import json
import tempfile
import threading
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import main

class TestServer(ThreadingHTTPServer):allow_reuse_address=True

with tempfile.TemporaryDirectory() as tmp:
    old=Path(tmp)/'character.json'
    old.write_text(json.dumps({'schema_version':1,'name':'Legacy Character','hp':{'max':10,'current':6,'temp':0},'inventory':[]}))
    with patch.object(main,'STATE_PATH',old), patch.object(main,'VAULT_PATH',Path(tmp)/'vault.json'):
        server=TestServer(('127.0.0.1',0),main.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            base=f'http://127.0.0.1:{server.server_address[1]}'
            with urlopen(base+'/api/vault') as r: vault=json.load(r)
            assert vault['active_id']=='legacy-character'
            vault['characters'].append({'id':'second','updated_at':'2026','character':{'schema_version':1,'name':'New','hp':{'max':12,'current':12},'inventory':[]}})
            vault['active_id']='second'
            req=Request(base+'/api/vault',data=json.dumps(vault).encode(),headers={'Content-Type':'application/json'},method='POST')
            with urlopen(req) as r: assert r.status==200
            with urlopen(base+'/api/vault') as r: now=json.load(r)
            assert now==vault and old.exists() and old.read_text().find('Legacy Character')!=-1
            with urlopen(base+'/vault-store.js') as r: assert r.status==200
            print('PASS HTTP: legacy migration, GET/POST vault, new asset served, legacy data retained')
        finally:
            server.shutdown();thread.join();server.server_close()
