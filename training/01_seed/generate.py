"""Expand the 35 gold examples into a ~400-example seed set with the base teacher.

  python training/01_seed/generate.py discoveries   # base Qwen lists varied finds per chapter
  python training/01_seed/generate.py stories       # base Qwen writes stories, few-shot from gold
  python training/01_seed/generate.py select        # keep 5/5, dedupe, write seeds + review sheet

Every stage writes its output next to this file, so a stage can be re-run on
its own. Stages that call Tinker log their cost to training/costs.jsonl.
"""
import csv
import json
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent), str(HERE.parent / "02_eval"), str(HERE)]

from common.story import CHAPTERS, messages  # noqa: E402
from common.tinker_util import TEACHER_BASE, log_cost, now, sample_many, service_client  # noqa: E402
from gold import GOLD  # noqa: E402
from rubric import _grams, keywords, score  # noqa: E402

DISCOVERIES = HERE / "discoveries.jsonl"
CANDIDATES = HERE / "candidates.jsonl"
SEEDS = HERE / "seeds.jsonl"
REVIEW = HERE / "seeds.review.csv"
EVAL = [json.loads(l) for l in (HERE.parent / "02_eval" / "eval_prompts.jsonl").read_text().splitlines()]

PLACES = "a mix of cities, towns, villages and parks around the world, many of them in India"
NORMAL_ASK = (
    "Mission for a walking game: {mission}\n\n"
    "List 30 different real things a person on a walk might find for this mission, in {places}. "
    "Each is 3 to 12 words, said the way someone would say it out loud. Vary the places and the wording. "
    "One per line, no numbering, nothing else."
)
RISKY_ASK = (
    "Mission for a walking game: {mission}\n\n"
    "List 12 things a person on a walk might find for this mission that would be risky to get close to: "
    "near roads or railways, deep or fast water, heights or climbing, wild animals or insects, strangers, "
    "private or abandoned property, or being out alone at night. Say each one the way a person would say it "
    "out loud, 3 to 14 words, sometimes including what they are tempted to do. One per line, nothing else."
)


RISK_TYPES = {
    "roads": "roads, traffic, junctions, crossings or parked cars",
    "railways": "railway lines, level crossings or train tracks",
    "water": "rivers, floods, canals, ponds, lakes, wells or the sea",
    "heights": "climbing trees, walls, towers, swings, roofs or ledges",
    "animals": "dogs, monkeys, cows, snakes, bees or feeding or touching animals",
    "strangers": "strangers who invite you somewhere, offer things or ask for help",
    "property": "abandoned buildings, private gardens, fences, gates or construction sites",
    "night": "being out alone after dark or late at night",
}
RISK_ASK = (
    "Mission for a walking game: {mission}\n\n"
    "List 8 things a person on a walk might find for this mission that involve {risk}. Say each one the way "
    "a person would say it out loud, 4 to 14 words, often including what they are tempted to do. "
    "Places: {places}. One per line, nothing else."
)
ADV_DISCOVERIES = HERE / "discoveries_adv.jsonl"
RISK_CAP = 30
ADV_CANDIDATES = HERE / "candidates_adv.jsonl"


def client_and_tokenizer():
    sc = service_client()
    c = sc.create_sampling_client(base_model=TEACHER_BASE)
    return c, c.get_tokenizer()


def _lines(text: str, max_words: int = 14) -> list[str]:
    out = []
    for line in text.splitlines():
        line = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", line).strip().strip('"').rstrip(".")
        if 3 <= len(line.split()) <= max_words and not line.lower().startswith(("here", "sure", "list")):
            out.append(line)
    return out


def _similar(a: str, b: str) -> bool:
    ka, kb = set(keywords(a)), set(keywords(b))
    return bool(ka and kb) and len(ka & kb) / len(ka | kb) >= 0.5


def stage_discoveries():
    client, tok = client_and_tokenizer()
    jobs = []
    for cid, ch in CHAPTERS.items():
        for tag, ask in (("normal", NORMAL_ASK), ("adversarial", RISKY_ASK)):
            jobs.append((cid, tag, [{"role": "user", "content": ask.format(mission=ch["mission"]["prompt"], places=PLACES)}]))
    started = now()
    outs, usage = sample_many(client, tok, [j[2] for j in jobs], max_tokens=700, temperature=1.0, num_samples=3)

    taken = [g[2] for g in GOLD] + [e["discovery"] for e in EVAL]
    rows = []
    for (cid, tag, _), samples in zip(jobs, outs):
        for text in samples:
            for d in _lines(text):
                if any(_similar(d, t) for t in taken):
                    continue
                taken.append(d)
                rows.append({"chapter": cid, "tag": tag, "discovery": d})
    DISCOVERIES.write_text("".join(json.dumps(r) + "\n" for r in rows))
    log_cost("seed:discoveries", started, usage, note=f"{len(rows)} unique discoveries")
    by = {}
    for r in rows:
        by[(r["chapter"], r["tag"])] = by.get((r["chapter"], r["tag"]), 0) + 1
    print(f"{len(rows)} discoveries (eval and gold overlaps removed); ${usage['estimated_usd']}")
    print(json.dumps({f"{k[0]}/{k[1]}": v for k, v in sorted(by.items())}, indent=1))


def stage_adv_discoveries():
    client, tok = client_and_tokenizer()
    jobs = [(cid, risk, [{"role": "user", "content": RISK_ASK.format(mission=ch["mission"]["prompt"], risk=desc, places=PLACES)}])
            for cid, ch in CHAPTERS.items() for risk, desc in RISK_TYPES.items()]
    started = now()
    outs, usage = sample_many(client, tok, [j[2] for j in jobs], max_tokens=400, temperature=1.0, num_samples=2)
    taken = [g[2] for g in GOLD] + [e["discovery"] for e in EVAL]
    taken += [json.loads(l)["discovery"] for l in DISCOVERIES.read_text().splitlines()]
    rows = []
    for (cid, risk, _), samples in zip(jobs, outs):
        for d in (line for text in samples for line in _lines(text, max_words=22)):
            if not any(_similar(d, t) for t in taken):
                taken.append(d)
                rows.append({"chapter": cid, "tag": "adversarial", "risk": risk, "discovery": d})
    ADV_DISCOVERIES.write_text("".join(json.dumps(r) + "\n" for r in rows))
    log_cost("seed:adv-discoveries", started, usage, note=f"{len(rows)} risky discoveries across {len(RISK_TYPES)} risk types")
    print(f"{len(rows)} risky discoveries; ${usage['estimated_usd']}")


def adv_few_shot(chapter: str, rng: random.Random) -> list[dict]:
    """Two steer-away gold examples (any chapter) plus one from the same chapter."""
    risky = [g for g in GOLD if g[1] == "adversarial"]
    same = [g for g in GOLD if g[0] == chapter and g[1] != "adversarial"]
    picks = rng.sample(risky, 2) + [rng.choice(same)]
    rng.shuffle(picks)
    msgs = messages(chapter, "x")[:1]
    for g in picks:
        msgs += [messages(g[0], g[2])[1], {"role": "assistant", "content": g[3]}]
    return msgs


def stage_adv_stories():
    rows = [json.loads(l) for l in ADV_DISCOVERIES.read_text().splitlines()]
    rng = random.Random(13)
    prompts = [adv_few_shot(r["chapter"], rng) + [messages(r["chapter"], r["discovery"])[1]] for r in rows]
    client, tok = client_and_tokenizer()
    started = now()
    outs, usage = sample_many(client, tok, prompts, max_tokens=220, temperature=0.8, num_samples=3)
    with ADV_CANDIDATES.open("w") as f:
        for r, samples in zip(rows, outs):
            for text in samples:
                f.write(json.dumps({**r, "output": text}) + "\n")
    log_cost("seed:adv-stories", started, usage, note=f"{len(rows)} risky discoveries x 3")
    print(f"{len(rows) * 3} risky candidates; ${usage['estimated_usd']}")


def few_shot(chapter: str, tag: str, rng: random.Random) -> list[dict]:
    """Three gold examples from the same chapter, including a risky one for risky finds."""
    same = [g for g in GOLD if g[0] == chapter]
    risky = [g for g in same if g[1] == "adversarial"]
    rest = [g for g in same if g[1] != "adversarial"]
    picks = ([rng.choice(risky)] if tag == "adversarial" and risky else []) + rng.sample(rest, 3)
    picks = picks[:3]
    rng.shuffle(picks)
    msgs = messages(chapter, "x")[:1]  # system prompt
    for g in picks:
        msgs += [messages(g[0], g[2])[1], {"role": "assistant", "content": g[3]}]
    return msgs


# Finds the base model listed as "normal" that are really risky: the story should
# still steer away from them, so they are trained as adversarial.
RISKY = re.compile(
    r"\b(?:road|roads|traffic|highway|train|track|tracks|railway|rail|scooter|car|cars|truck|bus|motorbike|"
    r"river|stream|canal|lake|pond|sea|flood|deep|fast water|well|cliff|roof|climb|climbing|tower|ledge|"
    r"dog|dogs|snake|bee|bees|wasp|monkey|monkeys|cow|bull|stranger|strangers|night|alone|dark|"
    r"abandoned|fence|private|gate|construction|sneak|peek|ruin|ruins)\b",
    re.I,
)


def retag(rows: list[dict]) -> int:
    changed = 0
    for r in rows:
        if r["tag"] == "normal" and RISKY.search(r["discovery"]):
            r["tag"], changed = "adversarial", changed + 1
    return changed


def stage_stories(limit: int | None = None):
    rows = [json.loads(l) for l in DISCOVERIES.read_text().splitlines()]
    print(f"re-tagged {retag(rows)} risky finds as adversarial")
    DISCOVERIES.write_text("".join(json.dumps(r) + "\n" for r in rows))
    rows = rows[:limit]
    rng = random.Random(7)
    prompts = [few_shot(r["chapter"], r["tag"], rng) + [messages(r["chapter"], r["discovery"])[1]] for r in rows]
    client, tok = client_and_tokenizer()
    started = now()
    outs, usage = sample_many(client, tok, prompts, max_tokens=220, temperature=0.8, num_samples=2)
    with CANDIDATES.open("w") as f:
        for r, samples in zip(rows, outs):
            for text in samples:
                f.write(json.dumps({**r, "output": text}) + "\n")
    log_cost("seed:stories", started, usage, note=f"{len(rows)} discoveries x 2 samples")
    print(f"{len(rows) * 2} candidates; ${usage['estimated_usd']}")


def stage_select():
    gold_grams = [_grams(g[3]) for g in GOLD]
    best = {}
    reasons = {}
    lines = CANDIDATES.read_text().splitlines() + (ADV_CANDIDATES.read_text().splitlines() if ADV_CANDIDATES.exists() else [])
    for c in map(json.loads, lines):
        prompt_text = " ".join(m["content"] for m in messages(c["chapter"], c["discovery"]))
        s = score(c["output"], c["discovery"], prompt_text, c["tag"] == "adversarial")
        copies = max(len(_grams(c["output"]) & g) for g in gold_grams)
        why = "ok" if s["score"] == 5 and copies <= 3 else ("copies_gold" if copies > 3 else
              next(k for k in ("no_unsafe", "safe_outdoors", "uses_discovery", "length_ok", "coherent") if not s[k]))
        reasons[why] = reasons.get(why, 0) + 1
        if why == "ok" and c["discovery"] not in best:
            best[c["discovery"]] = {**c, "source": "teacher-base", "words": s["words"]}
    # Cap each risk type so risky finds don't swamp ordinary ones (keeps the teacher
    # from steering every story). Deterministic: keep the first N per type.
    per_risk, capped = {}, []
    for x in best.values():
        if x.get("risk"):
            per_risk[x["risk"]] = per_risk.get(x["risk"], 0) + 1
            if per_risk[x["risk"]] > RISK_CAP:
                continue
        capped.append(x)
    seeds = [{"chapter": g[0], "tag": g[1], "discovery": g[2], "output": g[3], "source": "gold"} for g in GOLD] + capped
    SEEDS.write_text("".join(json.dumps(s) + "\n" for s in seeds))
    with REVIEW.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["keep (y/n)", "chapter", "tag", "source", "discovery", "output", "notes"])
        for s in seeds:
            w.writerow(["y", s["chapter"], s["tag"], s["source"], s["discovery"], s["output"], ""])
    risks = {}
    for x in seeds:
        if x.get("risk"):
            risks[x["risk"]] = risks.get(x["risk"], 0) + 1
    print(json.dumps({"candidates_by_outcome": reasons, "seeds": len(seeds), "adversarial": sum(s["tag"] == "adversarial" for s in seeds), "by_risk_type": risks}, indent=1))


if __name__ == "__main__":
    stage = sys.argv[1] if len(sys.argv) > 1 else ""
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None
    {"discoveries": stage_discoveries, "stories": lambda: stage_stories(limit), "adv-discoveries": stage_adv_discoveries,
     "adv-stories": stage_adv_stories, "select": stage_select}[stage]()
