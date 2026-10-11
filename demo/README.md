# Demo video

`demo/out/outward-demo.mp4`: 1920×1080, about 2:08. The intro is 18 s; the rest is the live app, recorded offline.

**Voice-over:** ElevenLabs "Chris", the presenter, about 1,480 credits, cached by text hash. The app's own narration is ElevenLabs "George", the Archivist, mixed in on the Home segment.

```bash
node demo/vo.mjs                                  # presenter voice-over (ElevenLabs, .env key)
PORT=10123 npm start &                            # production server
node demo/record.mjs <chrome-profile-with-models> # app clips (full-res CDP frames)
node demo/build.mjs                               # cards, phone frame, audio mix -> mp4 + srt
```

- `storyboard.json` holds the script and segment titles.
- `cards.html` holds the intro, results and outro cards and the per-segment backgrounds.
- The walk is real GPS emulation, sped up 8× in the edit (labelled on screen).
- The model's continuation is live. A take where the app's checks fall back to the pre-written text is re-recorded.
