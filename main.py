#!/usr/bin/env python3
"""Phoenix Tabletop: local-only server and PDF widget extraction adapter.
The JavaScript normalizer owns the only form-fields-to-character model conversion.
"""
from __future__ import annotations
import io
import json
from datetime import datetime, timezone
import threading
import re
import sys
import webbrowser
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from html import escape

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "vendor"))
from pypdf import PdfReader

MAX_UPLOAD = 15 * 1024 * 1024
STATE_PATH = Path.home() / ".skyblueeyes-tabletop" / "character.json"
VAULT_PATH = STATE_PATH.with_name("vault.json")
VAULT_LOCK = threading.RLock()
SKILL_FIELDS = {
    "Acrobatics": "Acrobatics", "Animal Handling": "Animal", "Arcana": "Arcana",
    "Athletics": "Athletics", "Deception": "Deception", "History": "History",
    "Insight": "Insight", "Intimidation": "Intimidation", "Investigation": "Investigation",
    "Medicine": "Medicine", "Nature": "Nature", "Perception": "Perception",
    "Performance": "Performance", "Persuasion": "Persuasion", "Religion": "Religion",
    "Sleight of Hand": "SleightofHand", "Stealth": "Stealth", "Survival": "Survival",
}
ABILITIES = ("STR", "DEX", "CON", "INT", "WIS", "CHA")
SAVES = ("Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma")


def read_pdf_fields(data: bytes) -> dict:
    """Read per-page Widget annotations, including PDFs lacking /AcroForm."""
    if not data.startswith(b"%PDF"):
        raise ValueError("This is not a PDF file.")
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if len(reader.pages) > 50:
            raise ValueError("PDF is too long for a character sheet.")
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
                if key and value and value.lower() not in ("off", "none", "/off"):
                    fields[key] = value
        if not fields:
            raise ValueError("No fillable form fields found. Use a D&D Beyond character sheet PDF.")
        return fields
    except ValueError:
        raise
    except Exception as ex:
        raise ValueError(f"Could not read PDF form fields: {ex}") from ex


def number(s, default=0):
    s = str(s or "").strip().replace(",", "")
    match = re.search(r"-?\d+", s)
    return int(match.group()) if match else default


def signed(s):
    return number(s, 0)



# The PDF action and feature fields are narrative strings, NOT structured D&D
# Beyond action records. Extract only explicit action headings/rules. A missing
# custom action cannot be reconstructed from a PDF which never exported it.
ACTION_SECTIONS = {"=== BONUS ACTIONS ===": "bonus action", "=== REACTIONS ===": "reaction", "=== ACTIONS ===": "action"}
ACTION_MARKER = re.compile(r"(?:\|\s*1\s*(Bonus Action|Reaction|Action)\b|\|\s*Special\b)", re.I)
FEATURE_HEADER = re.compile(r"^\s*\*\s+([^\n•]+?)\s*•[^\n]*", re.M)


def extract_actions(features: list, attacks: list) -> list:
    """Normalize PDF-exported named actions while retaining their literal rules.

    No guessed dice, resource costs, hit bonuses or rule automation.
    Imported attack rows remain authoritative and are not duplicated here.
    """
    actions = []
    seen = {re.sub(r"\W+", "", str(a.get("name", "")).lower()) for a in attacks}

    def add(name, activation, description, source):
        name = re.sub(r"\s*•\s*\d+\s*/\s*(?:Short|Long) Rest.*$", "", name, flags=re.I).strip().strip("•| ")
        key = re.sub(r"\W+", "", name.lower())
        if not name or key in seen or name.lower() in ("standard actions", "actions", "bonus actions", "reactions", "ki", "martial arts"):
            return
        seen.add(key)
        dice = re.findall(r"\b\d+d(?:4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+)?\b", description, re.I)
        # A unique explicit formula can be rolled, but its effect isn't inferred.
        roll = re.sub(r"\s+", "", dice[0]) if len(dice) == 1 else ""
        cost_match = re.search(r"\bspend\s+(\d+)\s+ki\s+points?\b", description, re.I)
        cost = int(cost_match.group(1)) if cost_match else 0
        resource = "Ki" if cost else ""
        if name.lower() in ("tears of the phoenix", "warding flare"):
            resource, cost = name, 1
        actions.append({"id": f"pdf-action-{len(actions)}", "name": name,
                        "activation": activation, "description": description.strip(),
                        "roll": roll, "damage": "", "resource": resource, "cost": cost,
                        "source": source, "archived": False})

    for doc in features:
        title = str(doc.get("title", "")); content = str(doc.get("text", ""))
        if title == "Actions":
            section = "action"; name = None; detail = []
            def flush():
                if name:
                    add(name, section, " ".join(detail), "pdf-actions")
            for line in content.splitlines():
                stripped = line.strip()
                if not stripped:
                    continue
                if stripped in ACTION_SECTIONS:
                    flush(); name = None; detail = []; section = ACTION_SECTIONS[stripped]
                elif line.startswith("     ") or line.startswith("\t"):
                    if name: detail.append(stripped)
                elif (stripped != "Standard Actions" and not stripped.startswith("===")
                      and len(stripped) <= 110 and not re.match(r"^(?:As a|You can|Once|The|When|Whenever)\b", stripped, re.I)):
                    flush(); name = stripped; detail = []
            flush()
        elif title.startswith("Features & Traits"):
            matches = list(FEATURE_HEADER.finditer(content))
            for i, match in enumerate(matches):
                name = match.group(1).strip()
                body = content[match.end():matches[i+1].start() if i+1 < len(matches) else len(content)].strip()
                marker = ACTION_MARKER.search(body)
                if not marker and not re.search(r"\b(?:as an action|bonus action|use your reaction)\b", body, re.I):
                    continue
                activation = (marker.group(1) if marker else None) or ("reaction" if re.search(r"\b(?:reaction|warding flare)\b",body,re.I) else "bonus action" if re.search(r"bonus action",body,re.I) else "action")
                activation = activation.lower()
                add(name, activation, body, "pdf-feature")
            # Some form fields cut a feature description across page boundaries.
            # An explicit named limited-use marker can still be recovered.
            for match in re.finditer(r"\|\s*([^\n|:]{3,65}):\s*\d+\s*/\s*(?:Long Rest|Short Rest)[^\n]*", content, re.I):
                name = match.group(1).strip()
                if name.lower() in ("ki points", "hit dice", "spell slots"):
                    continue
                if not re.match(r"^[A-Za-z]", name):
                    continue
                add(name, "reaction" if "reaction" in match.group(0).lower() else "special", match.group(0).strip(), "pdf-feature")
    return actions


def migrate_character(state: dict) -> dict:
    """Read-time, non-destructive compatibility with saves from v0.1–v0.9.1."""
    if not isinstance(state.get("actions"), list):
        state["actions"] = extract_actions(state.get("features", []), state.get("attacks", []))
    for sp in state.get("spells", []):
        sp.setdefault("always_prepared", "always prepared" in str(sp.get("source", "")).lower())
        sp.setdefault("available", True)
        sp.setdefault("level", None)
    return state


def validate_vault(data: dict) -> dict:
    """Validate the saved vault envelope without rewriting character rules."""
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise ValueError("Unsupported character vault format.")
    records = data.get("characters")
    if not isinstance(records, list) or len(records) > 200:
        raise ValueError("Invalid character vault entries.")
    seen = set()
    for entry in records:
        if not isinstance(entry, dict):
            raise ValueError("Invalid vault entry.")
        identifier = entry.get("id")
        character = entry.get("character")
        if (not isinstance(identifier, str) or not 0 < len(identifier) <= 128 or
                identifier in seen or not isinstance(character, dict) or
                character.get("schema_version") != 1 or
                not isinstance(character.get("name"), str) or
                not isinstance(character.get("hp"), dict) or
                not isinstance(character.get("inventory"), list)):
            raise ValueError("Invalid or duplicated character record.")
        seen.add(identifier)
    active = data.get("active_id")
    if active is not None and active not in seen:
        raise ValueError("Active character is missing from vault.")
    return data


def read_vault() -> dict:
    """Migrate the previous single-character save without modifying/deleting it."""
    with VAULT_LOCK:
        if VAULT_PATH.exists():
            return validate_vault(json.loads(VAULT_PATH.read_text(encoding="utf-8")))
        if STATE_PATH.exists():
            legacy = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            if isinstance(legacy, dict) and legacy.get("name") and legacy.get("hp"):
                return validate_vault({"schema_version": 1, "active_id": "legacy-character",
                    "characters": [{"id": "legacy-character", "character": legacy,
                        "updated_at": datetime.now(timezone.utc).isoformat()}]})
        return {"schema_version": 1, "active_id": None, "characters": []}


def write_vault(data: dict):
    data = validate_vault(data)
    with VAULT_LOCK:
        VAULT_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = VAULT_PATH.with_name("vault.json.tmp")
        try:
            tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(VAULT_PATH)
        finally:
            tmp.unlink(missing_ok=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Avoid logging uploaded character data; only request status/route.
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
        if name=="/api/vault":
            try:
                self.respond(200, json.dumps(read_vault(), ensure_ascii=False).encode("utf-8"))
            except (OSError, ValueError) as ex:
                self.respond(500, json.dumps({"error": str(ex)}).encode())
            return
        if name=="/api/state":
            try:
                data=json.loads(STATE_PATH.read_text(encoding="utf-8")) if STATE_PATH.is_file() else {}
                self.respond(200,json.dumps(migrate_character(data),ensure_ascii=False).encode("utf-8"))
            except OSError as ex:
                self.respond(500,json.dumps({"error":str(ex)}).encode())
            return
        # The web directory is the static asset manifest: avoid maintaining a
        # second, error-prone script allowlist in this HTTP handler.
        filename="index.html" if name=="/" else name.lstrip("/")
        mime={".html":"text/html", ".js":"text/javascript", ".css":"text/css",
              ".json":"application/json", ".jpg":"image/jpeg", ".png":"image/png",
              ".webp":"image/webp", ".webmanifest":"application/manifest+json"}
        suffix=Path(filename).suffix.lower()
        # Deliberately flat: no hidden files, nested paths, or traversal.
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*",filename) or suffix not in mime:
            self.respond(404,b'{"error":"Not found"}')
            return
        path=ROOT/"web"/filename
        if not path.is_file():
            self.respond(404,b'{"error":"File missing"}')
            return
        content_type=mime[suffix]
        self.respond(200,path.read_bytes(),content_type + ("; charset=utf-8" if suffix not in (".jpg",".png",".webp") else ""))

    def do_POST(self):
        if self.path not in ("/api/pdf-fields", "/api/vault"):
            # The old single-character save endpoint is deliberately read-only.
            # vault.json is the only live writable character store.
            self.respond(404,b'{"error":"Not found"}')
            return
        try:
            amount=int(self.headers.get("Content-Length","0"))
        except ValueError:
            amount=0
        if amount<=0 or amount>MAX_UPLOAD:
            self.respond(413,b'{"error":"PDF must be under 15MB."}')
            return
        expected_type="application/json" if self.path=="/api/vault" else "application/pdf"
        if self.headers.get("Content-Type","").split(";")[0].strip().lower()!=expected_type:
            self.respond(415,b'{"error":"Unsupported upload content type"}')
            return
        origin=self.headers.get("Origin")
        if origin and origin not in ("http://127.0.0.1:8765","http://localhost:8765"):
            self.respond(403,b'{"error":"Origin not allowed"}')
            return
        raw=self.rfile.read(amount)
        if self.path=="/api/vault":
            try:
                write_vault(json.loads(raw))
                self.respond(200,b'{"saved":true}')
            except (ValueError,OSError,TypeError) as ex:
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
    print(f"Interactive Tabletop running at http://{host}:{port}/")
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
