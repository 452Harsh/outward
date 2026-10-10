"""Tinker helpers: auth from .env, chat formatting for Qwen3.5 (thinking off),
batched sampling, and cost logging from Tinker's own billing API."""
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone

from .paths import ROOT, TRAINING

TEACHER_BASE = "Qwen/Qwen3.5-4B"
# Published Tinker prices for Qwen3.5-4B (USD per 1M tokens), used for estimates
# before a step runs. The cost log uses Tinker's billing API for actual spend.
PRICE = {"prefill": 0.33, "sample": 1.005, "train": 0.737}
COSTS_LOG = TRAINING / "costs.jsonl"


def load_key() -> None:
    if os.environ.get("TINKER_API_KEY"):
        return
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("TINKER_API_KEY="):
            os.environ["TINKER_API_KEY"] = line.split("=", 1)[1].strip()
            return
    raise SystemExit("TINKER_API_KEY missing from .env")


def service_client():
    import tinker

    load_key()
    return tinker.ServiceClient()


def chat_tokens(tokenizer, messages: list[dict]) -> list[int]:
    """Qwen3.5 chat template with thinking disabled: we want the story, not reasoning."""
    return tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True, enable_thinking=False)


_THINK = re.compile(r"<think>.*?</think>", re.S)


def clean_output(text: str) -> str:
    return _THINK.sub("", text).replace("<think>", "").replace("</think>", "").strip()


def sample_many(sampling_client, tokenizer, prompts: list[list[dict]], *, max_tokens=220, temperature=0.7, top_p=0.9, num_samples=1):
    """Sample all prompts concurrently. Returns (outputs, usage) where outputs[i] is a list of strings."""
    from tinker import types

    params = types.SamplingParams(max_tokens=max_tokens, temperature=temperature, top_p=top_p, stop=["<|im_end|>", "<|endoftext|>"])
    encoded = [chat_tokens(tokenizer, m) for m in prompts]
    futures = [sampling_client.sample(prompt=types.ModelInput.from_ints(ids), num_samples=num_samples, sampling_params=params) for ids in encoded]
    outputs, usage = [], {"prompt_tokens": 0, "sampled_tokens": 0}
    for ids, fut in zip(encoded, futures):
        res = fut.result()
        texts = []
        for seq in res.sequences:
            texts.append(clean_output(tokenizer.decode(seq.tokens, skip_special_tokens=True)))
            usage["sampled_tokens"] += len(seq.tokens)
        usage["prompt_tokens"] += len(ids)
        outputs.append(texts)
    usage["estimated_usd"] = round(usage["prompt_tokens"] / 1e6 * PRICE["prefill"] + usage["sampled_tokens"] / 1e6 * PRICE["sample"], 4)
    return outputs, usage


def billing_usd(since: datetime, until: datetime | None = None) -> float | None:
    """Spend billed by Tinker in the whole UTC hours covering [since, until].
    The API only accepts hour-aligned windows, so this is a cross-check for the
    exact per-step estimate, not a per-step figure. It can lag a few minutes."""
    try:
        rc = service_client().create_rest_client()
        start = since.replace(minute=0, second=0, microsecond=0)
        end = (until or datetime.now(timezone.utc)).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        resp = rc.get_billing_usage(starting_on=start, ending_before=end).result()
        return round(sum(e.estimated_cost_usd or 0 for e in resp.data), 4)
    except Exception as err:  # billing is informative; never fail a run on it
        print(f"(billing lookup failed: {err})")
        return None


def log_cost(step: str, started: datetime, usage: dict, note: str = "") -> dict:
    entry = {
        "step": step,
        "started": started.isoformat(timespec="seconds"),
        "finished": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **usage,
        "billed_usd_same_hours": billing_usd(started),
        "note": note,
    }
    with COSTS_LOG.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    return entry


def now() -> datetime:
    return datetime.now(timezone.utc)


def wait(seconds: float) -> None:
    time.sleep(seconds)
