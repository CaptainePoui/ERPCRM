#!/usr/bin/env python3
"""Journal de conversation Claude Code -- ERPCRM/SIPV.

Lit les transcriptions JSONL que Claude Code ecrit deja tout seul dans
~/.claude/projects/-home-simpleip-erpcrm/*.jsonl et les convertit en un
journal texte lisible et cumulatif : docs/platform/CONVERSATION_LOG.md.

Rien n'est resume ni reformule : les messages utilisateur et les reponses
texte de l'assistant sont recopies mot pour mot. Les appels d'outils sont
reduits a une ligne datee (Lu/Cree/Modifie/Execute/...) -- pas leur contenu
brut, qui serait illisible et enorme.

Concu pour tourner via cron (`* * * * *`) : idempotent, ne fait qu'ajouter ce
qui est nouveau depuis le dernier passage (suivi par offset dans
.conversation_log_state.json). Ne touche jamais aux JSONL sources.

Ce script est scope a CE serveur (ERPCRM) uniquement -- il ne lit que les
transcriptions locales de cette machine. DashV16/SIPV ont besoin de leur
propre copie tournant sur leur propre machine (voir CLAUDE.md, jamais de
mirroir de code entre projets).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

PROJECT_DIR = Path.home() / ".claude" / "projects" / "-home-simpleip-erpcrm"
REPO_ROOT = Path(__file__).resolve().parents[2]
LOG_FILE = REPO_ROOT / "docs" / "platform" / "CONVERSATION_LOG.md"
STATE_FILE = Path(__file__).resolve().parent / ".conversation_log_state.json"

TOOL_LABELS = {
    "Read": "Lu",
    "Write": "Cree",
    "Edit": "Modifie",
    "NotebookEdit": "Modifie",
    "Bash": "Execute",
    "Grep": "Recherche",
    "Glob": "Recherche",
    "WebFetch": "Recherche web",
    "WebSearch": "Recherche web",
    "Agent": "Sous-agent lance",
    "Artifact": "Artifact",
    "AskUserQuestion": "Question posee",
}


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"offsets": {}, "seen_sessions": []}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def fmt_ts(iso_ts: str | None) -> str:
    if not iso_ts:
        return "????-??-?? ??:??:??"
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    except ValueError:
        return iso_ts


def tool_use_line(ts: str, name: str, tool_input: dict) -> str:
    label = TOOL_LABELS.get(name, f"Outil {name}")
    target = (
        tool_input.get("file_path")
        or tool_input.get("path")
        or tool_input.get("pattern")
        or tool_input.get("url")
        or tool_input.get("query")
        or tool_input.get("description")
    )
    if name == "Bash":
        target = tool_input.get("description") or tool_input.get("command", "")
        cmd = tool_input.get("command", "")
        if cmd:
            target = f"{target} -- `{cmd[:150]}`"
    if not target:
        target = json.dumps(tool_input, ensure_ascii=False)[:150]
    return f"[{fmt_ts(ts)}] {label} : {target}"


def extract_lines(entry: dict) -> list[str]:
    msg = entry.get("message", {})
    role = msg.get("role")
    if role not in ("user", "assistant"):
        return []
    ts = entry.get("timestamp")
    content = msg.get("content")
    speaker = "Simple IP" if role == "user" else "Claude"
    lines: list[str] = []

    if isinstance(content, str):
        text = content.strip()
        if text:
            lines.append(f"[{fmt_ts(ts)}] {speaker} : {text}")
        return lines

    if not isinstance(content, list):
        return lines

    for block in content:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            text = block.get("text", "").strip()
            if text:
                lines.append(f"[{fmt_ts(ts)}] {speaker} : {text}")
        elif btype == "tool_use":
            lines.append(tool_use_line(ts, block.get("name", "?"), block.get("input", {}) or {}))
        # tool_result et les autres blocs (images, etc.) sont volontairement
        # omis -- trop volumineux, non demande.
    return lines


def process_file(path: Path, state: dict, out) -> bool:
    session_id = path.stem
    offset = state["offsets"].get(session_id, 0)
    with path.open("r", encoding="utf-8") as f:
        f.seek(offset)
        chunk = f.read()
    if not chunk:
        return False

    last_newline = chunk.rfind("\n")
    if last_newline == -1:
        return False  # ligne incomplete, on attend le prochain passage
    complete_chunk = chunk[: last_newline + 1]
    new_offset = offset + len(complete_chunk.encode("utf-8"))

    wrote_anything = False
    for raw_line in complete_chunk.splitlines():
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            entry = json.loads(raw_line)
        except json.JSONDecodeError:
            continue

        if session_id not in state["seen_sessions"]:
            first_ts = entry.get("timestamp")
            out.write(f"\n=== Session {session_id} -- demarree {fmt_ts(first_ts)} ===\n\n")
            state["seen_sessions"].append(session_id)

        for line in extract_lines(entry):
            out.write(line + "\n")
            wrote_anything = True

    state["offsets"][session_id] = new_offset
    return wrote_anything


def main() -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    state = load_state()

    session_files = sorted(PROJECT_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime)
    if not session_files:
        return

    with LOG_FILE.open("a", encoding="utf-8") as out:
        for path in session_files:
            process_file(path, state, out)

    save_state(state)


if __name__ == "__main__":
    main()
