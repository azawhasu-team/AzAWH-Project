"""
AWH Phase 3 — IncidentReportAgent

RAG-grounded LLM incident summary: given SensorDriftAgent's and
ThresholdBreachAgent's findings for one window, retrieves relevant sections
of guides/*.md (see rag_corpus.py) and asks Claude to write a short,
non-specialist-readable summary a field engineer can act on — the RQ3
target from CLAUDE.md ("faster correct intervention decisions... vs.
numeric alert tables").

LLM backend is chosen by AWH_LLM_PROVIDER:
  ollama (default)  local model via Ollama's HTTP API (OLLAMA_URL, OLLAMA_MODEL),
                    free, no credentials. Output is rejected in favour of a plain
                    template if it cites a number that was not in the prompt.
  claude            Anthropic API; needs credentials resolvable by the SDK's
                    default client (ANTHROPIC_API_KEY, or `ant auth login`).
The provider that produced each report is recorded in state['incident_report_source'].
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

from rag_corpus import retrieve
from state import IncidentState

MODEL = "claude-opus-5"
PROVIDER = os.getenv("AWH_LLM_PROVIDER", "ollama").lower()
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
UNITS = {"temperature": "°C", "humidity": "% relative humidity", "weight": "g (collected water)", "power": "W"}
_NUM_RE = re.compile(r"\d+(?:\.\d+)?")

SYSTEM_PROMPT = """You write short incident summaries for AWH (Atmospheric Water \
Harvesting) field engineers who are not data scientists. Given a flagged sensor \
window and grounding documentation, explain in plain language: what looks wrong, \
which physical system it likely traces to, and what a field engineer should \
physically go check first. Be concrete and brief — 3-5 sentences. Do not include \
statistical jargon (no "z-score", "percentile rank", "isolation forest") — \
translate findings into what a person standing at the station would observe or \
should do. If the grounding documentation doesn't directly cover the situation, \
say so rather than inventing detail."""


def _build_query_terms(state: IncidentState) -> list[str]:
    terms = []
    drift = state.get("drift")
    if drift:
        terms.append(drift["causal_parameter"])
    threshold = state.get("threshold")
    if threshold:
        terms.extend(b["parameter"] for b in threshold["breaches"])
    return terms


def _format_grounding(chunks: list[tuple[str, str]]) -> str:
    if not chunks:
        return "(No directly relevant documentation found in guides/.)"
    return "\n\n".join(f"### {title}\n{body}" for title, body in chunks)


def _numbers(text: str) -> set[str]:
    """Numbers as normalised floats so 04 == 4 and 36.60 == 36.6."""
    return {str(float(n)) for n in _NUM_RE.findall(text)}


def _ollama_chat(system: str, user: str, timeout: int = 180) -> str | None:
    body = json.dumps({
        "model": OLLAMA_MODEL, "stream": False, "options": {"temperature": 0},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.load(resp).get("message", {}).get("content", "").strip() or None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None


def _template_report(state: IncidentState, drift: dict, threshold: dict) -> str:
    """Deterministic fallback: states the findings, adds no interpretation."""
    parts = [f"Station {state['station_id']}, {state['window_start']} to {state['window_end']}."]
    if drift["is_anomaly"]:
        parts.append(f"The monitoring model flagged unusual behaviour, most likely in {drift['causal_parameter']}.")
    for b in threshold["breaches"]:
        parts.append(f"{b['parameter']} was {b['direction']} its allowed bound ({b['value']} vs {b['bound']}).")
    parts.append("No automatic explanation was produced; inspect the station.")
    return " ".join(parts)


def _call_claude(system: str, user: str) -> str:
    import anthropic

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    if response.stop_reason == "refusal":
        return "(Report generation was declined by safety filtering — escalate manually.)"
    return next((b.text for b in response.content if b.type == "text"), "")


def incident_report_agent(state: IncidentState) -> dict:
    """LangGraph node: reads drift/threshold findings + raw readings, returns
    {'incident_report': str, 'incident_report_source': str}. Only called when
    needs_incident is True."""
    query_terms = _build_query_terms(state)
    grounding_chunks = retrieve(query_terms, top_k=3)
    grounding_text = _format_grounding(grounding_chunks)

    drift = state.get("drift", {"is_anomaly": False, "causal_parameter": "none", "confidence": 0.0})
    threshold = state.get("threshold", {"breached": False, "breaches": []})

    readings = "; ".join(
        f"{k} {'not available (sensor gave no data)' if v is None else f'{v:.1f} {UNITS.get(k, "")}'.strip()}"
        for k, v in state["raw_readings"].items()
    )

    user_prompt = f"""Station: {state['station_id']}
Window: {state['window_start']} to {state['window_end']}
Raw readings: {readings}

SensorDriftAgent finding: {"anomaly detected" if drift["is_anomaly"] else "no anomaly"}, \
likely cause: {drift["causal_parameter"]}, confidence: {drift["confidence"]:.2f}

ThresholdBreachAgent finding: {"breach detected" if threshold["breached"] else "no breach"}
{threshold["breaches"] if threshold["breaches"] else ""}

Grounding documentation:
{grounding_text}

Write the incident summary."""

    if PROVIDER == "claude":
        return {"incident_report": _call_claude(SYSTEM_PROMPT, user_prompt), "incident_report_source": "claude"}

    text = _ollama_chat(SYSTEM_PROMPT, user_prompt)
    if text and _numbers(text) <= _numbers(user_prompt):
        return {"incident_report": text, "incident_report_source": f"ollama:{OLLAMA_MODEL}"}
    return {"incident_report": _template_report(state, drift, threshold),
            "incident_report_source": "template (model unavailable or cited a number not in the input)"}
