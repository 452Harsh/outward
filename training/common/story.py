"""Story content and the task prompt shared with the app."""
import json

from .paths import CONTENT

STORY = json.loads((CONTENT / "stories" / "quiet-atlas" / "story.json").read_text())
TASK = json.loads((CONTENT / "prompts" / "task.json").read_text())
CHAPTERS = {c["id"]: c for c in STORY["chapters"]}


def messages(chapter_id: str, discovery: str) -> list[dict]:
    ch = CHAPTERS[chapter_id]
    user = TASK["user"].format(context=ch["storyContext"], mission=ch["mission"]["prompt"], discovery=discovery.strip())
    return [{"role": "system", "content": TASK["system"]}, {"role": "user", "content": user}]
