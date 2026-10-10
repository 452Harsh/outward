"""Distillation data: the fine-tuned teacher writes stories, the rubric keeps the best.

  python training/04_distill/distill.py prompts    # ~2,500 distinct (chapter, discovery) prompts
  python training/04_distill/distill.py sample     # teacher v3, 3 samples per prompt
  python training/04_distill/distill.py filter     # keep up to 2 passing samples per prompt

Eval and dev prompts are excluded, so the student is judged on finds it never saw.
Output: distill.jsonl (chat messages in the shared task-prompt format) for Colab.
"""
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent), str(HERE.parent / "02_eval"), str(HERE.parent / "01_seed")]

from common.story import CHAPTERS, messages  # noqa: E402
from common.tinker_util import log_cost, now, sample_many, service_client  # noqa: E402
from generate import NORMAL_ASK, PLACES, RISK_ASK, RISK_TYPES, RISKY, _lines, _similar  # noqa: E402
from rubric import _grams, score  # noqa: E402

TEACHER = json.loads((HERE.parent / "03_teacher" / "runs" / "teacher-v3.json").read_text())["sampler_path"]
SEED_DIR = HERE.parent / "01_seed"
EVAL_DIR = HERE.parent / "02_eval"
PROMPTS = HERE / "prompts.jsonl"
CANDIDATES = HERE / "candidates.jsonl"
OUT = HERE / "distill.jsonl"
TARGET_PROMPTS = 2500


def _read(p: Path) -> list[dict]:
    return [json.loads(l) for l in p.read_text().splitlines()] if p.exists() else []


def stage_prompts():
    held_out = [r["discovery"] for r in _read(EVAL_DIR / "eval_prompts.jsonl") + _read(EVAL_DIR / "dev_prompts.jsonl")]
    rows, seen = [], []

    def add(r):
        d = r["discovery"]
        if any(_similar(d, h) for h in held_out) or d.lower() in seen:
            return
        seen.append(d.lower())
        tag = "adversarial" if r.get("tag") == "adversarial" or RISKY.search(d) else "normal"
        rows.append({"chapter": r["chapter"], "discovery": d, "tag": tag, **({"risk": r["risk"]} if r.get("risk") else {})})

    for r in _read(SEED_DIR / "discoveries.jsonl") + _read(SEED_DIR / "discoveries_adv.jsonl"):
        add(r)
    print(f"{len(rows)} prompts from seed-stage discoveries")

    # Top up with fresh discoveries from the base teacher (cheap: a few cents).
    sc = service_client()
    base = sc.create_sampling_client(base_model="Qwen/Qwen3.5-4B")
    tok = base.get_tokenizer()
    jobs = []
    for cid, ch in CHAPTERS.items():
        jobs.append((cid, None, NORMAL_ASK.format(mission=ch["mission"]["prompt"], places=PLACES), 8))
        for risk, desc in RISK_TYPES.items():
            jobs.append((cid, risk, RISK_ASK.format(mission=ch["mission"]["prompt"], risk=desc, places=PLACES), 2))
    started = now()
    usage_total = {"prompt_tokens": 0, "sampled_tokens": 0, "estimated_usd": 0.0}
    for n in sorted({j[3] for j in jobs}):
        group = [j for j in jobs if j[3] == n]
        outs, usage = sample_many(base, tok, [[{"role": "user", "content": j[2]}] for j in group], max_tokens=700, temperature=1.0, num_samples=n)
        for k in usage_total:
            usage_total[k] += usage[k]
        for (cid, risk, _, _), samples in zip(group, outs):
            for text in samples:
                for d in _lines(text, max_words=22):
                    if len(rows) < TARGET_PROMPTS * 1.2:
                        add({"chapter": cid, "discovery": d, "tag": "adversarial" if risk else "normal", **({"risk": risk} if risk else {})})
    usage_total["estimated_usd"] = round(usage_total["estimated_usd"], 4)
    random.Random(1).shuffle(rows)
    rows = rows[:TARGET_PROMPTS]
    PROMPTS.write_text("".join(json.dumps(r) + "\n" for r in rows))
    log_cost("distill:prompts", started, usage_total, note=f"{len(rows)} prompts")
    adv = sum(r["tag"] == "adversarial" for r in rows)
    print(f"{len(rows)} prompts ({adv} risky); top-up ${usage_total['estimated_usd']}")


def stage_sample():
    rows = _read(PROMPTS)
    sc = service_client()
    teacher = sc.create_sampling_client(model_path=TEACHER)
    tok = teacher.get_tokenizer()
    started = now()
    outs, usage = sample_many(teacher, tok, [messages(r["chapter"], r["discovery"]) for r in rows], max_tokens=220, temperature=0.9, num_samples=3)
    with CANDIDATES.open("w") as f:
        for r, samples in zip(rows, outs):
            for text in samples:
                f.write(json.dumps({**r, "output": text}) + "\n")
    log_cost("distill:teacher-samples", started, usage, note=f"{len(rows)} prompts x 3, teacher v3")
    print(f"{len(rows) * 3} candidates; ${usage['estimated_usd']}")


def stage_filter():
    by_prompt = {}
    for c in _read(CANDIDATES):
        by_prompt.setdefault((c["chapter"], c["discovery"]), []).append(c)
    kept, outcomes = [], {}
    for (chapter, discovery), cands in by_prompt.items():
        prompt_text = " ".join(m["content"] for m in messages(chapter, discovery))
        passing = []
        for c in cands:
            s = score(c["output"], discovery, prompt_text, c["tag"] == "adversarial")
            why = "ok" if s["score"] == 5 else next(k for k in ("no_unsafe", "safe_outdoors", "uses_discovery", "length_ok", "coherent") if not s[k])
            outcomes[why] = outcomes.get(why, 0) + 1
            # Two kept samples for one prompt must actually differ.
            if why == "ok" and all(len(_grams(c["output"]) & _grams(p["output"])) <= 5 for p in passing):
                passing.append(c)
        kept += passing[:2]
    with OUT.open("w") as f:
        for k in kept:
            msgs = messages(k["chapter"], k["discovery"]) + [{"role": "assistant", "content": k["output"].strip()}]
            f.write(json.dumps({"messages": msgs, "chapter": k["chapter"], "tag": k["tag"], "risk": k.get("risk")}) + "\n")
    prompts_covered = len({(k["chapter"], k["discovery"]) for k in kept})
    adv = sum(k["tag"] == "adversarial" for k in kept)
    print(json.dumps({"candidates_by_outcome": outcomes, "examples": len(kept), "prompts_covered": prompts_covered,
                      "of_prompts": len(by_prompt), "risky_examples": adv}, indent=1))


if __name__ == "__main__":
    {"prompts": stage_prompts, "sample": stage_sample, "filter": stage_filter}[sys.argv[1]]()
