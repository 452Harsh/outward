// Monthly byte counter for /models downloads. Render bills $0.15/GB beyond
// the 5 GB included on Hobby, so after a budget we redirect to Hugging Face.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const month = (d = new Date()) => d.toISOString().slice(0, 7);

export function createBandwidthMeter({ file, budgetGB }) {
  let state = { month: month(), bytes: 0 };
  if (file && existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (saved.month === state.month) state = saved;
    } catch {
      // A corrupt counter file just restarts the count.
    }
  }
  let dirty = false;

  const rollover = () => {
    if (state.month !== month()) state = { month: month(), bytes: 0 };
  };

  return {
    add(bytes) {
      rollover();
      state.bytes += bytes;
      dirty = true;
    },
    overBudget() {
      rollover();
      return budgetGB > 0 && state.bytes >= budgetGB * 1e9;
    },
    flush() {
      if (!dirty || !file) return;
      writeFileSync(file, JSON.stringify(state));
      dirty = false;
    },
    snapshot() {
      rollover();
      return { month: state.month, gb: Math.round(state.bytes / 1e7) / 100, budgetGB };
    },
  };
}
