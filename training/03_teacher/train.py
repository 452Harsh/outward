"""LoRA fine-tune of the teacher (Qwen3.5-4B) on the seed set, on Tinker.

  python training/03_teacher/train.py --name smoke --max-steps 2     # pipeline check (~$0.01)
  python training/03_teacher/train.py --name teacher-v1              # full run

Loss is on the story tokens only (prompt tokens have weight 0). Writes
runs/<name>.json with the sampler path, config, train/val losses and cost.
"""
import argparse
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from common.story import messages  # noqa: E402
from common.tinker_util import PRICE, TEACHER_BASE, chat_tokens, log_cost, now, service_client  # noqa: E402

SEEDS = HERE.parent / "01_seed" / "seeds.jsonl"


def build_datum(tok, end_id: int, ex: dict):
    from tinker import types

    prompt = chat_tokens(tok, messages(ex["chapter"], ex["discovery"]))
    completion = tok.encode(ex["output"].strip(), add_special_tokens=False) + [end_id]
    tokens = prompt + completion
    weights = [0.0] * len(prompt) + [1.0] * len(completion)
    inp, target, w = tokens[:-1], tokens[1:], weights[1:]
    datum = types.Datum(
        model_input=types.ModelInput.from_ints(inp),
        loss_fn_inputs={
            "target_tokens": types.TensorData(data=target, dtype="int64", shape=[len(target)]),
            "weights": types.TensorData(data=w, dtype="float32", shape=[len(w)]),
        },
    )
    return datum, len(tokens), sum(w)


def nll(fwd_result, batch_weights) -> float:
    """Mean negative log-likelihood per story token."""
    total, count = 0.0, 0.0
    for out, w in zip(fwd_result.loss_fn_outputs, batch_weights):
        lp = out["logprobs"]
        lp = lp.tolist() if hasattr(lp, "tolist") else lp.data
        total -= sum(a * b for a, b in zip(lp, w))
        count += sum(w)
    return total / max(count, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=5e-4)
    ap.add_argument("--rank", type=int, default=32)
    ap.add_argument("--max-steps", type=int)
    args = ap.parse_args()

    from tinker import types

    seeds = [json.loads(l) for l in SEEDS.read_text().splitlines()]
    rng = random.Random(42)
    rng.shuffle(seeds)
    n_val = max(8, len(seeds) // 10)
    val, train = seeds[:n_val], seeds[n_val:]

    sc = service_client()
    tc = sc.create_lora_training_client(base_model=TEACHER_BASE, rank=args.rank)
    tok = tc.get_tokenizer()
    end_id = tok.convert_tokens_to_ids("<|im_end|>")

    train_data = [build_datum(tok, end_id, ex) for ex in train]
    val_data = [build_datum(tok, end_id, ex) for ex in val]
    steps_per_epoch = (len(train_data) + args.batch - 1) // args.batch
    total_steps = min(args.max_steps or 10**9, steps_per_epoch * args.epochs)
    print(f"train {len(train_data)}  val {len(val_data)}  steps {total_steps}  lr {args.lr}  rank {args.rank}")

    def val_loss():
        batch = [d for d, _, _ in val_data]
        res = tc.forward(batch, "cross_entropy").result()
        return round(nll(res, [d.loss_fn_inputs["weights"].data for d in batch]), 4)

    started = now()
    history = {"val": [{"step": 0, "loss": val_loss()}], "train": []}
    print(f"step 0  val {history['val'][0]['loss']}")
    train_tokens, step = 0, 0
    for epoch in range(args.epochs):
        order = list(range(len(train_data)))
        random.Random(epoch).shuffle(order)
        for i in range(0, len(order), args.batch):
            if step >= total_steps:
                break
            items = [train_data[j] for j in order[i : i + args.batch]]
            batch = [d for d, _, _ in items]
            lr = args.lr * (1 - step / total_steps)  # linear decay
            fb = tc.forward_backward(batch, "cross_entropy")
            opt = tc.optim_step(types.AdamParams(learning_rate=lr))
            res = fb.result()
            opt.result()
            loss = nll(res, [d.loss_fn_inputs["weights"].data for d in batch])
            train_tokens += sum(n for _, n, _ in items)
            step += 1
            history["train"].append({"step": step, "loss": round(loss, 4)})
            if step % 5 == 0 or step == total_steps:
                print(f"step {step}/{total_steps}  train {loss:.4f}")
        history["val"].append({"step": step, "loss": val_loss()})
        # A sampler checkpoint per epoch; the one with the lowest validation loss
        # is used (never chosen by eval-set score, which stays held out).
        ckpt = tc.save_weights_for_sampler(name=f"{args.name}-e{epoch + 1}").result().path
        history["val"][-1]["sampler_path"] = ckpt
        print(f"epoch {epoch + 1}  val {history['val'][-1]['loss']}  saved {ckpt}")
        if step >= total_steps:
            break

    best = min(history["val"][1:], key=lambda v: v["loss"])
    path = best["sampler_path"]
    print(f"best checkpoint by val loss: step {best['step']} ({best['loss']})")
    val_tokens = sum(n for _, n, _ in val_data) * len(history["val"])
    usage = {
        "train_tokens": train_tokens,
        "val_tokens": val_tokens,
        "estimated_usd": round(train_tokens / 1e6 * PRICE["train"] + val_tokens / 1e6 * PRICE["prefill"], 4),
    }
    run = {"name": args.name, "base_model": TEACHER_BASE, "sampler_path": path, "selected_by": "lowest val loss", "config": vars(args),
           "n_train": len(train_data), "n_val": len(val_data), "steps": step, "history": history, "usage": usage}
    (HERE / "runs").mkdir(exist_ok=True)
    (HERE / "runs" / f"{args.name}.json").write_text(json.dumps(run, indent=2) + "\n")
    log_cost(f"teacher-train:{args.name}", started, usage, note=f"{step} steps, rank {args.rank}")
    print(f"saved {path}\ncost ~${usage['estimated_usd']}")


if __name__ == "__main__":
    main()
