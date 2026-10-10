"""Run the held-out eval set against a model on Tinker and score it.

  python training/02_eval/run.py --label base-qwen --limit 5     # smoke test (~$0.001)
  python training/02_eval/run.py --label base-qwen               # full 50 prompts
  python training/02_eval/run.py --label ft-qwen --model-path tinker://...

Writes results/<label>.jsonl, results/<label>.summary.json and a spot-check
CSV for human review, and appends the cost to training/costs.jsonl.
"""
import argparse
import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from common.story import messages  # noqa: E402
from common.tinker_util import TEACHER_BASE, log_cost, now, sample_many, service_client  # noqa: E402
from rubric import score  # noqa: E402

CRITERIA = ["uses_discovery", "length_ok", "safe_outdoors", "coherent", "no_unsafe"]


def summarize(rows: list[dict]) -> dict:
    n = len(rows)
    adv = [r for r in rows if r["tag"] == "adversarial"]
    return {
        "n": n,
        "rubric_mean": round(sum(r["score"] for r in rows) / n, 2),
        **{f"{c}_pct": round(100 * sum(r[c] for r in rows) / n) for c in CRITERIA},
        "avg_words": round(sum(r["words"] for r in rows) / n, 1),
        "unsafe": sum(not r["no_unsafe"] for r in rows),
        "adversarial_safe_pct": round(100 * sum(r["safe_outdoors"] for r in adv) / len(adv)) if adv else None,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("--model-path", help="tinker:// path of a fine-tuned checkpoint (default: base model)")
    ap.add_argument("--base-model", default=TEACHER_BASE)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--temperature", type=float, default=0.7)
    args = ap.parse_args()

    prompts = [json.loads(l) for l in (HERE / "eval_prompts.jsonl").read_text().splitlines()][: args.limit]
    sc = service_client()
    client = sc.create_sampling_client(model_path=args.model_path) if args.model_path else sc.create_sampling_client(base_model=args.base_model)
    tok = client.get_tokenizer()

    started = now()
    msgs = [messages(p["chapter"], p["discovery"]) for p in prompts]
    outputs, usage = sample_many(client, tok, msgs, temperature=args.temperature)

    rows = []
    for p, m, out in zip(prompts, msgs, outputs):
        text = out[0]
        prompt_text = " ".join(x["content"] for x in m)
        rows.append({**p, "output": text, **score(text, p["discovery"], prompt_text, p["tag"] == "adversarial")})

    out_dir = HERE / "results"
    out_dir.mkdir(exist_ok=True)
    (out_dir / f"{args.label}.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    summary = {"label": args.label, "model": args.model_path or args.base_model, **summarize(rows), "usage": usage}
    (out_dir / f"{args.label}.summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    with (out_dir / f"{args.label}.spotcheck.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "chapter", "tag", "discovery", "output", "auto_score", *CRITERIA, "human_1to5", "human_notes"])
        for r in rows:
            w.writerow([r["id"], r["chapter"], r["tag"], r["discovery"], r["output"], r["score"], *[int(r[c]) for c in CRITERIA], "", ""])

    cost = log_cost(f"eval:{args.label}", started, usage, note=f"{len(rows)} prompts")
    print(json.dumps(summary, indent=2))
    print(f"cost: ${usage['estimated_usd']} (from tokens); Tinker billed ${cost['billed_usd_same_hours']} in the same hours (can lag)")


if __name__ == "__main__":
    main()
