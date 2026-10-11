"""Final eval of on-device models: run a GGUF with llama.cpp (llama-server)
on the same 50 held-out prompts x 3 samples, same task prompt, same rubric
as the Tinker teacher eval. Free (local), and it tests the exact quantized
file the phone downloads.

  python training/06_final_eval/run_gguf.py --label student-q4 --gguf path/to/model.gguf
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent), str(HERE.parent / "02_eval")]

from common.story import messages  # noqa: E402
from rubric import score  # noqa: E402
from run import summarize  # noqa: E402

PORT = 8091
FEWSHOT = json.loads((HERE / "app_fewshot_prompt.json").read_text())


def app_fewshot_messages(chapter_id, discovery):
    """The app's pre-student prompt for stock Gemma (one worked example)."""
    from common.story import CHAPTERS

    turn = lambda ctx, d: f'Story so far: {ctx}\nThe Wayfinder found: "{d}"\nWhat happens to the atlas?'
    return [
        {"role": "system", "content": FEWSHOT["system"]},
        {"role": "user", "content": turn(FEWSHOT["example_context"], FEWSHOT["example_discovery"])},
        {"role": "assistant", "content": FEWSHOT["example_assistant"]},
        {"role": "user", "content": turn(CHAPTERS[chapter_id]["storyContext"], discovery.strip())},
    ]


def post(path, body):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


def wait_ready(proc, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if proc.poll() is not None:
            raise SystemExit("llama-server exited early")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=2) as r:
                if json.load(r).get("status") == "ok":
                    return
        except Exception:
            pass
        time.sleep(1)
    raise SystemExit("llama-server did not start")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("--gguf", required=True)
    ap.add_argument("--samples", type=int, default=3)
    ap.add_argument("--prompts", default=str(HERE.parent / "02_eval" / "eval_prompts.jsonl"))
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--prompt-style", choices=["task", "app-fewshot"], default="task")
    args = ap.parse_args()

    prompts = [json.loads(l) for l in Path(args.prompts).read_text().splitlines()]
    proc = subprocess.Popen(
        ["llama-server", "-m", args.gguf, "--port", str(PORT), "-c", "4096", "-np", "4", "-t", str(args.threads), "--no-webui", "-ngl", "0"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        wait_ready(proc)

        def one(job):
            p, k = job
            msgs = app_fewshot_messages(p["chapter"], p["discovery"]) if args.prompt_style == "app-fewshot" else messages(p["chapter"], p["discovery"])
            res = post("/v1/chat/completions", {"messages": msgs, "temperature": 0.7,
                                                "top_p": 0.95, "max_tokens": 220, "seed": 1000 + k})
            return p, k, res["choices"][0]["message"]["content"], res.get("timings", {})

        jobs = [(p, k) for p in prompts for k in range(args.samples)]
        with ThreadPoolExecutor(4) as pool:
            results = list(pool.map(one, jobs))
    finally:
        proc.terminate()
        proc.wait()

    rows, speeds = [], []
    for p, k, text, timing in results:
        prompt_text = " ".join(m["content"] for m in messages(p["chapter"], p["discovery"]))
        rows.append({**p, "sample": k, "output": text.strip(), **score(text.strip(), p["discovery"], prompt_text, p["tag"] == "adversarial")})
        if timing.get("predicted_per_second"):
            speeds.append(timing["predicted_per_second"])
    out_dir = HERE / "results"
    out_dir.mkdir(exist_ok=True)
    (out_dir / f"{args.label}.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    summary = {"label": args.label, "model": Path(args.gguf).name, "bytes": Path(args.gguf).stat().st_size, "prompt_style": args.prompt_style,
               "samples_per_prompt": args.samples, **summarize(rows),
               "mac_cpu_tokens_per_sec_4_parallel": round(sum(speeds) / len(speeds), 1) if speeds else None}
    (out_dir / f"{args.label}.summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
