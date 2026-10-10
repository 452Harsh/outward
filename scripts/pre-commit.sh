#!/bin/sh
# Blocks commits that contain API keys or a .env file.
# Install: cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
if git diff --cached --name-only | grep -qE '(^|/)\.env$'; then
  echo "pre-commit: refusing to commit .env" >&2
  exit 1
fi
if git diff --cached -U0 | grep -E '^\+' | grep -qE 'sk_[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY'; then
  echo "pre-commit: staged changes contain what looks like an API key. Move it to .env." >&2
  exit 1
fi
