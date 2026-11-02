#!/usr/bin/env python3
"""Phoenix Tabletop: local-only server and PDF widgetextraction adapter.
The JavaScript normalizer owns the only form-fields-to-character model conversion.
"""
from __future__ import annotations
import io
import json
import re
import sys
import webbrowser
from pathlib import Path
fromhttp.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from html import escape

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "vendor"))
from pypdf import PdfReader

MAX_UPLOAD = 15* 1024 * 1024
STATE_PATH = Path.home() / ".skyblueeyes-tabletop" / "character.json"
SKILL_FIELDS = {
    "Acrobatics": "Acrobatics", "Animal Handling": "Animal", "Arcana": "Arcana",
    "Athletics": "Athletics", "Deception":"Deception", "History": "History",
    "Insight": "Insight", "Intimidation": "Intimidation", "Investigation": "Investigation",
    "Medicine": "Medicine", "Nature": "Nature", "Perception": "Perception",
    "Performance":"Performance", "Persuasion": "Persuasion", "Religion": "Religion",
    "Sleight of Hand": "SleightofHand", "Stealth": "Stealth", "Survival": "Survival",
}
ABILITIES = ("STR", "DEX", "CON", "INT", "WIS", "CHA")
SAVES =("Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma")


def read_pdf_fields(data: bytes) -> dict:
    """Read per-page Widget annotations, including PDFs lacking /AcroForm."""
    if notdata.startswith(b"%PDF"):
        raise ValueError("This is not a PDF file.")
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if len(reader.pages) > 50:
            raise ValueError("PDF is too long for a charactersheet.")
        fields = {}
        for page in reader.pages:
            annots = page.get("/Annots")
            if not annots:
                continue
            for annot in annots.get_object():
                item = annot.get_object()
key = item.get("/T")
                value = item.get("/V")
                if key is None or value is None:
                    continue
                key, value = str(key).strip(), str(value).strip()
                if key and value andvalue.lower() not in ("off", "none", "/off"):
                    fields[key] = value
        if not fields:
            raise ValueError("No fillable form fields found. Use a D&D Beyond character sheet PDF.")
        return fields
    exceptValueError:
        raise
    except Exception as ex:
        raise ValueError(f"Could not read PDF form fields: {ex}") from ex


def number(s, default=0):
    s = str(s or "").strip().replace(",", "")
    match = re.search(r"-?\d+",s)
    return int(match.group()) if match else default


def signed(s):
    return number(s, 0)



# The PDF action and feature fields are narrative strings, NOT structured D&D
# Beyond action records. Extract only explicit action headings/rules.A missing
# custom action cannot be reconstructed from a PDF which never exported it.
ACTION_SECTIONS = {"=== BONUS ACTIONS ===": "bonus action", "=== REACTIONS ===": "reaction", "=== ACTIONS ===": "action"}
ACTION_MARKER =re.compile(r"(?:\|\s*1\s*(Bonus Action|Reaction|Action)\b|\|\s*Special\b)", re.I)
FEATURE_HEADER = re.compile(r"^\s*\*\s+([^\n•]+?)\s*•[^\n]*", re.M)


def extract_actions(features: list, attacks: list) -> list:
"""Normalize PDF-exported named actions while retaining their literal rules.

    No guessed dice, resource costs, hit bonuses or rule automation.
    Imported attack rows remain authoritative and are not duplicated here.
    """
    actions =[]
    seen = {re.sub(r"\W+", "", str(a.get("name", "")).lower()) for a in attacks}

    def add(name, activation, description, source):
        name = re.sub(r"\s*•\s*\d+\s*/\s*(?:Short|Long) Rest.*$", "", name,flags=re.I).strip().strip("•| ")
        key = re.sub(r"\W+", "", name.lower())
        if not name or key in seen or name.lower() in ("standard actions", "actions", "bonus actions", "reactions", "ki", "martial arts"):
return
        seen.add(key)
        dice = re.findall(r"\b\d+d(?:4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+)?\b", description, re.I)
        # A unique explicit formula can be rolled, but its effect isn't inferred.
        roll = re.sub(r"\s+","", dice[0]) if len(dice) == 1 else ""
        cost_match = re.search(r"\bspend\s+(\d+)\s+ki\s+points?\b", description, re.I)
        cost = int(cost_match.group(1)) if cost_match else 0
        resource = "Ki" if cost else ""
if name.lower() in ("tears of the phoenix", "warding flare"):
            resource, cost = name, 1
        actions.append({"id": f"pdf-action-{len(actions)}", "name": name,
                        "activation": activation, "description":description.strip(),
                        "roll": roll, "damage": "", "resource": resource, "cost": cost,
                        "source": source, "archived": False})

    for doc in features:
        title = str(doc.get("title","")); content = str(doc.get("text", ""))
        if title == "Actions":
            section = "action"; name = None; detail = []
            def flush():
                if name:
                    add(name, section, " ".join(detail),"pdf-actions")
            for line in content.splitlines():
                stripped = line.strip()
                if not stripped:
                    continue
                if stripped in ACTION_SECTIONS:
                    flush(); name =None; detail = []; section = ACTION_SECTIONS[stripped]
                elif line.startswith("     ") or line.startswith("\t"):
                    if name: detail.append(stripped)
                elif (stripped != "Standard Actions" and notstripped.startswith("===")
                      and len(stripped) <= 110 and not re.match(r"^(?:As a|You can|Once|The|When|Whenever)\b", stripped, re.I)):
                    flush(); name = stripped; detail = []
            flush()
        eliftitle.startswith("Features & Traits"):
            matches = list(FEATURE_HEADER.finditer(content))
            for i, match in enumerate(matches):
                name = match.group(1).strip()
                body =content[match.end():matches[i+1].start() if i+1 < len(matches) else len(content)].strip()
                marker = ACTION_MARKER.search(body)
                if not marker and not re.search(r"\b(?:as an action|bonus action|use your reaction)\b",body, re.I):
                    continue
                activation = (marker.group(1) if marker else None) or ("reaction" if re.search(r"\b(?:reaction|warding flare)\b",body,re.I) else "bonus action" if re.search(r"bonus action",body,re.I)else "action")
                activation = activation.lower()
                add(name, activation, body, "pdf-feature")
            # Some form fields cut a feature description across page boundaries.
            # An explicit named limited-usemarker can still be recovered.
            for match in re.finditer(r"\|\s*([^\n|:]{3,65}):\s*\d+\s*/\s*(?:Long Rest|Short Rest)[^\n]*", content, re.I):
                name = match.group(1).strip()
                if name.lower() in ("kipoints", "hit dice", "spell slots"):
                    continue
                if not re.match(r"^[A-Za-z]", name):
                    continue
                add(name, "reaction" if "reaction" in match.group(0).lower() else"special", match.group(0).strip(), "pdf-feature")
    return actions


def migrate_character(state: dict) -> dict:
    """Read-time, non-destructive compatibility with saves from v0.1–v0.9.1."""
    if notisinstance(state.get("actions"), list):
        state["actions"] = extract_actions(state.get("features", []), state.get("attacks", []))
    for sp in state.get("spells", []):
        sp.setdefault("always_prepared", "always prepared" instr(sp.get("source", "")).lower())
        sp.setdefault("available", True)
        sp.setdefault("level", None)
    return state


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Avoid logginguploaded character data; only request status/route.
        sys.stdout.write("[web] " + fmt % args + "\n")

    def respond(self, status, body, content_type="application/json; charset=utf-8"):
        self.send_response(status)
self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        name=urlparse(self.path).path
        if name=="/api/state":
            try:
                data=json.loads(STATE_PATH.read_text(encoding="utf-8")) ifSTATE_PATH.is_file() else {}
                self.respond(200,json.dumps(migrate_character(data),ensure_ascii=False).encode("utf-8"))
            except OSError as ex:
                self.respond(500,json.dumps({"error":str(ex)}).encode())
return
        # The web directory is the static asset manifest: avoid maintaining a
        # second, error-prone script allowlist in this HTTP handler.
        filename="index.html" if name=="/" else name.lstrip("/")
mime={".html":"text/html", ".js":"text/javascript", ".css":"text/css",
              ".json":"application/json", ".jpg":"image/jpeg", ".png":"image/png",
              ".webp":"image/webp"}
suffix=Path(filename).suffix.lower()
        # Deliberately flat: no hidden files, nested paths, or traversal.
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*",filename) or suffix not in mime:
            self.respond(404,b'{"error":"Notfound"}')
            return
        path=ROOT/"web"/filename
        if not path.is_file():
            self.respond(404,b'{"error":"File missing"}')
            return
        content_type=mime[suffix]
self.respond(200,path.read_bytes(),content_type + ("; charset=utf-8" if suffix not in (".jpg",".png",".webp") else ""))

    def do_POST(self):
        if self.path not in ("/api/pdf-fields", "/api/state"):
self.respond(404,b'{"error":"Not found"}')
            return
        try:
            amount=int(self.headers.get("Content-Length","0"))
        except ValueError:
            amount=0
        if amount<=0 or amount>MAX_UPLOAD:
self.respond(413,b'{"error":"PDF must be under 15MB."}')
            return
        expected_type="application/json" if self.path=="/api/state" else "application/pdf"
        ifself.headers.get("Content-Type","").split(";")[0].strip().lower()!=expected_type:
            self.respond(415,b'{"error":"Unsupported upload content type"}')
            return
        origin=self.headers.get("Origin")
        if originand origin not in ("http://127.0.0.1:8765","http://localhost:8765"):
            self.respond(403,b'{"error":"Origin not allowed"}')
            return
        raw=self.rfile.read(amount)
        if self.path=="/api/state":
try:
                state=json.loads(raw)
                if not isinstance(state,dict) or state.get("schema_version")!=1 or not isinstance(state.get("hp"),dict):
                    raise ValueError("Invalid character state.")
state=migrate_character(state)
                STATE_PATH.parent.mkdir(parents=True,exist_ok=True)
                tmp=STATE_PATH.with_suffix(".json.tmp")
tmp.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")
                tmp.replace(STATE_PATH)
                self.respond(200,b'{"saved":true}')
            except (ValueError,OSError) as ex:
self.respond(422,json.dumps({"error":str(ex)}).encode())
            return
        try:
            result={"fields": read_pdf_fields(raw)}
            body=json.dumps(result,ensure_ascii=False).encode("utf-8")
self.respond(200,body)
        except Exception as exc:
            self.respond(422,json.dumps({"error":str(exc)}).encode())


def serve(port=8765, browser=True):
    class LocalServer(ThreadingHTTPServer):
        allow_reuse_address=True
try:
        httpd=LocalServer(("127.0.0.1",port), Handler)
    except OSError as exc:
        print(f"Cannot start tabletop on port {port}: {exc}. Close any previous instance.")
        raise SystemExit(1) from exc
host,port=httpd.server_address
    print(f"Sky Blue Eyes Tabletop running at http://{host}:{port}/")
    print("Local only. Press Ctrl+C here to exit.")
    if browser:
        import threading
threading.Timer(0.4,lambda:webbrowser.open(f"http://{host}:{port}/")).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__ == "__main__":
serve()
