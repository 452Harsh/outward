# Training pipeline

Teacher–student distillation, built in phases 5–6. Every step will be a reproducible script here:

1. `01_seed/`: seed dataset generation + review/filter
2. `02_eval/`: 50 held-out prompts, automatic rubric scorer, spot-check sheet
3. `03_teacher/`: Tinker LoRA on Qwen3.5-4B, base vs. fine-tuned eval
4. `04_distill/`: batched teacher sampling + safety/rubric filtering
5. `05_student/`: Gemma 3 1B (+270M) fine-tune on Colab (Unsloth/TRL)
6. `06_final_eval/`: base Gemma vs. distilled Gemma vs. teacher
7. `07_export/`: merge, quantize, compile for WebLLM, upload to Render disk + Hugging Face

Safety rules come from `../content/safety/rules.json` (shared with the app). Costs are logged in `COSTS.md`.
