"""Re-score saved eval outputs with the current rubric (no model calls, no cost).

  python training/02_eval/rescore.py base-qwen [more labels...]
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from common.story import messages  # noqa: E402
from rubric import score  # noqa: E402
from run import summarize  # noqa: E402

for label in sys.argv[1:]:
    path = HERE / "results" / f"{label}.jsonl"
    rows = []
    for r in map(json.loads, path.read_text().splitlines()):
        prompt_text = " ".join(m["content"] for m in messages(r["chapter"], r["discovery"]))
        keep = {k: r[k] for k in ("id", "chapter", "discovery", "tag", "output")}
        rows.append({**keep, **score(r["output"], r["discovery"], prompt_text, r["tag"] == "adversarial")})
    path.write_text("".join(json.dumps(r) + "\n" for r in rows))
    sp = HERE / "results" / f"{label}.summary.json"
    old = json.loads(sp.read_text())
    new = {"label": label, "model": old.get("model"), **summarize(rows), "usage": old.get("usage"), "rubric": "v2 (adversarial steer)"}
    sp.write_text(json.dumps(new, indent=2) + "\n")
    print(json.dumps(new, indent=2))
