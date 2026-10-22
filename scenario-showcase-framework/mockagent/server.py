#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""mockAgent — returns message content for scenario-showcase cases.

A tiny stateful HTTP service (stdlib only) that stands in for real agents:
the frontend MockAgentDriver pulls every message / step / panel event from
here, so a scenario's interaction content lives in a per-case "bank" file
instead of the frontend bundle.

API (POST, JSON):
    /mockagent/start  {case}     -> {ok, session, total}
    /mockagent/next   {session}  -> {ok, event, remaining} | {ok, event:{type:'done'}}
    /mockagent/reset  {session}  -> {ok}
    /health                      -> {ok}

Banks: banks/<case>.json = [ {"waitMs": 1600, "event": {...}}, ... ]
Events use the same schema as case script[] timeline events:
    {type:'message', from, to, kind, step, text:{zh,en}, attachments?, a2at?}
    {type:'step', id, status}
    {type:'panel', panel, action, data}

Run:  python3 server.py  (listens on 0.0.0.0:9015)
"""
import collections
import datetime
import json
import os
import re
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BANK_DIR = os.path.join(BASE_DIR, "banks")
PORT = int(os.environ.get("MOCKAGENT_PORT", "9015"))
SAFE_ID = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

_LOCK = threading.Lock()
_SESSIONS = {}  # session -> {"case": str, "bank": list, "idx": int}
_LOG_LOCK = threading.Lock()
_LOG_LINES = collections.deque(maxlen=600)  # ring buffer for GET /mockagent/logs


def agent_log(line):
    """Timestamped Agent log line → stdout (mockagent.log) + in-memory ring."""
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{ts}] {line}"
    with _LOG_LOCK:
        _LOG_LINES.append(entry)
        print(entry, flush=True)


def describe_event(ev):
    """One-line human summary of a served bank event."""
    if not ev or ev.get("type") == "done":
        return "DONE (session complete)"
    t = ev.get("type")
    if t == "message":
        a2at = " [A2A-T]" if ev.get("a2at") else ""
        att = f" +{len(ev['attachments'])}att" if ev.get("attachments") else ""
        return f"message {ev.get('from')} -> {ev.get('to')} kind={ev.get('kind')} step={ev.get('step')}{a2at}{att}"
    if t == "step":
        return f"step {ev.get('id')} -> {ev.get('status')}"
    if t == "panel":
        return f"panel {ev.get('panel')} {ev.get('action')}"
    return str(t or "?")


def _q(s):
    """Quote a message text for a log line (strip quotes/newlines, truncate)."""
    s = str(s or "").replace('"', "'").replace("\n", " ").strip()
    return s[:120] + ("…" if len(s) > 120 else "")


def msg_texts(ev):
    t = ev.get("text") or {}
    if isinstance(t, str):
        return t, t
    return t.get("zh", ""), t.get("en", "")


def log_message_served(sess, case, n, total, ev):
    """Agent-perspective message logging — for every served message, the
    SENDER gets a SENT/REPLY line and the RECEIVER a RECV line; both carry
    the message text (zh + en) so each agent's tab shows the requests it
    received (with the msg) and the replies it sent."""
    zh, en = msg_texts(ev)
    kind = ev.get("kind") or "info"
    frm, to = ev.get("from"), ev.get("to")
    verb = "REPLY" if kind == "response" else "SENT"
    agent_log(f'{verb} session={sess} case={case} [{n}/{total}] from={frm} to={to} kind={kind} msg_zh="{_q(zh)}" msg_en="{_q(en)}"')
    agent_log(f'RECV session={sess} case={case} [{n}/{total}] to={to} from={frm} kind={kind} msg_zh="{_q(zh)}" msg_en="{_q(en)}"')


def load_bank(case_key):
    if not SAFE_ID.match(case_key or ""):
        raise ValueError("invalid case id")
    path = os.path.join(BANK_DIR, f"{case_key}.json")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"no bank for case '{case_key}'")
    with open(path, encoding="utf-8") as fh:
        bank = json.load(fh)
    if not isinstance(bank, list):
        raise ValueError("bank must be a JSON array of turns")
    return bank


class Handler(BaseHTTPRequestHandler):
    server_version = "mockAgent/1.0"

    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # quiet access log
        pass

    def do_OPTIONS(self):  # CORS preflight
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            self._send(200, {"ok": True, "service": "mockAgent", "sessions": len(_SESSIONS)})
            return
        if self.path.startswith("/mockagent/logs"):
            qs = parse_qs(urlparse(self.path).query)
            try:
                limit = max(1, min(int(qs.get("limit", ["200"])[0]), 600))
            except ValueError:
                limit = 200
            sess = (qs.get("session", [""])[0] or "")[:8]
            with _LOG_LOCK:
                lines = list(_LOG_LINES)
            if sess:
                lines = [ln for ln in lines if f"session={sess}" in ln]
            self._send(200, {"ok": True, "count": len(lines), "lines": lines[-limit:]})
            return
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception as exc:  # noqa: BLE001
            agent_log(f"BAD-JSON from {self.client_address[0]}: {exc}")
            self._send(400, {"ok": False, "error": f"bad json: {exc}"})
            return

        if self.path.rstrip("/").endswith("/start"):
            case_key = str(body.get("case") or "")
            try:
                bank = load_bank(case_key)
            except Exception as exc:  # noqa: BLE001
                agent_log(f"SESSION FAIL case={case_key} client={self.client_address[0]} error={exc}")
                self._send(404, {"ok": False, "error": str(exc)})
                return
            session = uuid.uuid4().hex
            with _LOCK:
                _SESSIONS[session] = {"case": case_key, "bank": bank, "idx": 0}
            agent_log(f"SESSION START case={case_key} session={session[:8]} total={len(bank)} client={self.client_address[0]}")
            self._send(200, {"ok": True, "session": session, "total": len(bank)})
            return

        session = str(body.get("session") or "")
        with _LOCK:
            state = _SESSIONS.get(session)
            if state is None:
                agent_log(f"UNKNOWN-SESSION {session[:8]} client={self.client_address[0]}")
                self._send(404, {"ok": False, "error": "unknown session"})
                return
            if self.path.rstrip("/").endswith("/reset"):
                state["idx"] = 0
                agent_log(f"RESET session={session[:8]} case={state['case']}")
                self._send(200, {"ok": True, "remaining": len(state["bank"])})
                return
            # /next
            idx = state["idx"]
            total = len(state["bank"])
            if idx >= total:
                agent_log(f"NEXT session={session[:8]} case={state['case']} [{total}/{total}] DONE")
                self._send(200, {"ok": True, "event": {"type": "done"}, "remaining": 0})
                return
            turn = state["bank"][idx] or {}
            state["idx"] = idx + 1
            event = turn.get("event") or {"type": "done"}
            if event.get("type") == "message":
                # agent-perspective lines: sender SENT/REPLY + receiver RECV
                # (both carry the message text) instead of the flat NEXT line
                log_message_served(session[:8], state["case"], idx + 1, total, event)
            else:
                agent_log(f"NEXT session={session[:8]} case={state['case']} [{idx + 1}/{total}] {describe_event(event)}")
            self._send(200, {"ok": True, "event": event, "remaining": total - state["idx"]})


if __name__ == "__main__":
    agent_log(f"mockAgent listening on 0.0.0.0:{PORT}, banks dir: {BANK_DIR}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
