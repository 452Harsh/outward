"""Python port of content/safety/filter.js. Reads the same rules.json, so the
app, the story factory and the training pipeline agree on what is unsafe."""
import json
import re

from .paths import CONTENT

_rules = json.loads((CONTENT / "safety" / "rules.json").read_text())
_compiled = [(r["id"], r["label"], [re.compile(p, re.I) for p in r["patterns"]]) for r in _rules["rules"]]
_negation = re.compile(
    r"(?:^|\s)(?:" + "|".join(re.escape(n) for n in _rules["negations"]) + r")(?=\s|$|[,:])", re.I
)
_exceptions = re.compile("(?:" + "|".join(re.escape(e) for e in _rules["negationExceptions"]) + ")", re.I)
LIMITS = _rules["maxWords"]


def normalize(text: str) -> str:
    t = (text or "").replace("‘", "'").replace("’", "'").replace("ʼ", "'")
    t = t.replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", t).strip()


def count_words(text: str) -> int:
    t = normalize(text)
    return len(t.split(" ")) if t else 0


def _is_negated(text: str, index: int) -> bool:
    clause = re.split(r"[.!?;:\n]", text[:index])[-1]
    words = " ".join(clause.strip().split(" ")[-_rules["negationWindow"]:])
    return bool(_negation.search(" " + _exceptions.sub(" ", words) + " "))


def check_text(text: str, max_words: int | None = None) -> dict:
    t = normalize(text)
    violations = []
    for rule_id, label, regexes in _compiled:
        for rx in regexes:
            for m in rx.finditer(t):
                if not _is_negated(t, m.start()):
                    violations.append({"rule": rule_id, "label": label, "match": m.group(0)})
    words = count_words(t)
    too_long = max_words is not None and words > max_words
    return {"ok": not violations and not too_long, "words": words, "too_long": too_long, "violations": violations}
