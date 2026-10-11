"""Story factory: turns a human-written pack plan into a reviewed story pack.

Runs on a Mac (keys stay in .env, never on Render). Uses the training venv:

  training/.venv/bin/python server/factory/make_pack.py generate second-atlas   # Tinker, ~$0.01
  training/.venv/bin/python server/factory/make_pack.py edit second-atlas       # apply human review edits
  node scripts/narration.mjs --pack second-atlas                                # dry run: ElevenLabs credits
  node scripts/narration.mjs --pack second-atlas --yes                          # narrate
  training/.venv/bin/python server/factory/make_pack.py approve second-atlas    # after reading REVIEW.md

The model (base Qwen3.5-4B on Tinker) writes only prose: title, intro,
story context, a fallback continuation and the cliffhanger. Missions, examples
and safety notes come from the human-written plan. Every generated field must
pass the shared safety filter and format checks, or another sample is used.
Packs stay "draft" (not served) until approved.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path[:0] = [str(ROOT / "training")]

from common.safety import check_text, count_words  # noqa: E402
from common.tinker_util import TEACHER_BASE, log_cost, now, sample_many, service_client  # noqa: E402

PACKS = ROOT / "content" / "packs"
SEASON_ONE = json.loads((ROOT / "content" / "stories" / "quiet-atlas" / "story.json").read_text())

LIMITS = {"title": (2, 7), "intro": (55, 120), "storyContext": (12, 60), "continuationTemplate": (45, 110), "cliffhanger": (35, 90)}
META = re.compile(r"\b(?:as an ai|language model|the user|the listener)\b", re.I)
# Structure words are fine in storyContext (model-facing, like season one's
# "Chapter 2. ...") but not in anything the listener hears.
STRUCTURE = re.compile(r"\b(?:season (?:one|two|1|2)|chapter \d)\b", re.I)
SPOKEN = {"title", "intro", "continuationTemplate", "cliffhanger"}


def chapter_prompt(plan: dict, ch: dict, n: int, previous: list[dict]) -> list[dict]:
    so_far = "\n".join(f"- Chapter {i + 1} \"{p['title']}\": {p['storyContext']} Ended with: {p['cliffhanger']}" for i, p in enumerate(previous)) or "- (this is the first chapter)"
    system = (
        "You write chapters for a calm outdoor adventure story that people listen to while walking. "
        f"Style: {plan['style']} Reply with JSON only."
    )
    user = f"""Story: "{plan['title']}". {plan['premise']}

How season one ended: {SEASON_ONE['chapters'][-1]['cliffhanger']}

Chapters so far:
{so_far}

Write chapter {n} of {len(plan['chapters'])}. Its theme is {ch['theme']}. Its mission (already written, do not change it): "{ch['mission']['prompt']}"

Return a JSON object with exactly these keys:
"title": 2 to 6 words.
"intro": 70 to 110 words, spoken by the Archivist to "you" before the walk, leading up to the mission without repeating it.
"storyContext": one or two sentences summarising the story so far and what this chapter needs.
"continuationTemplate": 60 to 100 words in second person that react to what the listener found. It must contain the exact text {{discovery}} once, inside quotes, standing for their words.
"cliffhanger": 45 to 80 words that end the chapter on a gentle mystery{"" if n < len(plan['chapters']) else " and close the story warmly"}."""
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def parse(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    return obj if isinstance(obj, dict) else None


def problems(obj: dict | None) -> list[str]:
    if not obj:
        return ["not json"]
    out = []
    for key, (lo, hi) in LIMITS.items():
        val = obj.get(key)
        if not isinstance(val, str) or not val.strip():
            out.append(f"missing {key}")
            continue
        words = count_words(val)
        if not lo <= words <= hi:
            out.append(f"{key} {words} words")
        text = val.replace("{discovery}", "a small stream")
        if check_text(text)["violations"]:
            out.append(f"{key} unsafe: {[v['rule'] for v in check_text(text)['violations']]}")
        if META.search(val) or (key in SPOKEN and STRUCTURE.search(val)):
            out.append(f"{key} meta/structure words")
    tpl = obj.get("continuationTemplate") or ""
    if tpl.count("{discovery}") != 1:
        out.append("continuationTemplate needs exactly one {discovery}")
    if not re.search(r"\byou\b", (obj.get("intro") or "").lower()):
        out.append("intro not in second person")
    return out


def generate(pack_id: str):
    plan = json.loads((HERE / "packs" / f"{pack_id}.config.json").read_text())
    sc = service_client()
    client = sc.create_sampling_client(base_model=TEACHER_BASE)
    tok = client.get_tokenizer()
    started = now()
    usage_total = {"prompt_tokens": 0, "sampled_tokens": 0, "estimated_usd": 0.0}
    chapters, log = [], []
    for n, ch in enumerate(plan["chapters"], start=1):
        outs, usage = sample_many(client, tok, [chapter_prompt(plan, ch, n, chapters)], max_tokens=900, temperature=0.9, num_samples=6)
        for k in usage_total:
            usage_total[k] += usage[k]
        chosen = None
        for text in outs[0]:
            obj = parse(text)
            issues = problems(obj)
            log.append({"chapter": ch["id"], "issues": issues})
            if not issues:
                chosen = obj
                break
        if not chosen:
            raise SystemExit(f"{ch['id']}: no sample passed the checks; see issues: {log[-6:]}")
        chapters.append({
            "id": ch["id"], "number": n, "title": chosen["title"].strip(), "intro": chosen["intro"].strip(),
            "mission": ch["mission"], "storyContext": chosen["storyContext"].strip(),
            "continuationTemplate": chosen["continuationTemplate"].strip(), "cliffhanger": chosen["cliffhanger"].strip(),
            "unlock": {"minMeters": {"10": 250, "30": 700, "60": 1400}},
        })
        print(f"  ✓ {ch['id']} \"{chosen['title']}\" ({sum(1 for x in log if x['chapter'] == ch['id'])} samples tried)")

    usage_total["estimated_usd"] = round(usage_total["estimated_usd"], 4)
    old = PACKS / pack_id / "pack.json"
    version = json.loads(old.read_text()).get("version", 0) + 1 if old.exists() else 1
    pack = {
        "id": plan["id"], "version": version, "status": "draft", "title": plan["title"], "tagline": plan["tagline"],
        "narrator": plan["narrator"], "premise": plan["premise"], "requires": plan["requires"],
        "generatedBy": {"model": TEACHER_BASE, "via": "Tinker", "usd": usage_total["estimated_usd"]},
        "chapters": chapters,
        "audio": {"base": f"/packs/{pack_id}/audio/", "clips": {}},
    }
    (PACKS / pack_id).mkdir(parents=True, exist_ok=True)
    old.write_text(json.dumps(pack, indent=2) + "\n")
    review = [f"# Review: {pack['title']} (v{version}, draft)\n", "Read every line. Approve with `make_pack.py approve " + pack_id + "`.\n"]
    for c in chapters:
        review += [f"\n## {c['number']}. {c['title']}\n", f"**Intro.** {c['intro']}\n", f"**Mission (human).** {c['mission']['prompt']}  \n*{c['mission']['safetyNote']}*\n",
                   f"**Context.** {c['storyContext']}\n", f"**Fallback continuation.** {c['continuationTemplate']}\n", f"**Cliffhanger.** {c['cliffhanger']}\n"]
    (PACKS / pack_id / "REVIEW.md").write_text("\n".join(review))
    log_cost(f"factory:{pack_id}", started, usage_total, note=f"{len(chapters)} chapters")
    print(f"draft written: content/packs/{pack_id}/pack.json + REVIEW.md; ${usage_total['estimated_usd']}")


def apply_edits(pack: dict, pack_id: str) -> None:
    """Human review edits (server/factory/packs/<id>.edits.json), recorded in the pack."""
    f = HERE / "packs" / f"{pack_id}.edits.json"
    if not f.exists():
        return
    edits = json.loads(f.read_text())
    pack["reviewEdits"] = []
    for ch in pack["chapters"]:
        for field, e in edits.get(ch["id"], {}).items():
            if field not in LIMITS:
                raise SystemExit(f"cannot edit {field}")
            ch[field] = e["text"]
            pack["reviewEdits"].append({"chapter": ch["id"], "field": field, "reason": e["reason"]})
    bad = {c["id"]: problems({k: c[k] for k in LIMITS}) for c in pack["chapters"]}
    bad = {k: v for k, v in bad.items() if v}
    if bad:
        raise SystemExit(f"edited pack fails checks: {bad}")


def approve(pack_id: str):
    path = PACKS / pack_id / "pack.json"
    pack = json.loads(path.read_text())
    apply_edits(pack, pack_id)
    texts = [t for c in pack["chapters"] for t in (c["intro"], c["mission"]["prompt"], c["mission"]["safetyNote"], c["cliffhanger"], c["continuationTemplate"].replace("{discovery}", "x"))]
    bad = [t for t in texts if check_text(t)["violations"]]
    if bad:
        raise SystemExit(f"refusing to approve, safety filter flags: {bad}")
    missing = [f"{c['id']}-{part}" for c in pack["chapters"] for part in ("intro", "mission", "cliffhanger") if f"{c['id']}-{part}" not in pack["audio"]["clips"]]
    pack["status"] = "approved"
    path.write_text(json.dumps(pack, indent=2) + "\n")
    print(f"approved {pack_id} v{pack['version']}" + (f" (no narration for {len(missing)} clips: device voice will read them)" if missing else ""))


def edit(pack_id: str):
    path = PACKS / pack_id / "pack.json"
    pack = json.loads(path.read_text())
    apply_edits(pack, pack_id)
    path.write_text(json.dumps(pack, indent=2) + "\n")
    print(f"applied {len(pack.get('reviewEdits', []))} review edits to {pack_id} (still draft)")


if __name__ == "__main__":
    cmd, pack_id = sys.argv[1], sys.argv[2]
    {"generate": generate, "edit": edit, "approve": approve}[cmd](pack_id)
