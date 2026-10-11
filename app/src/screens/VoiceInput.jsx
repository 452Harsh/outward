import { useEffect, useRef, useState } from 'preact/hooks';
import { isSpeechInstalled, transcribe } from '../ai/stt.js';
import { startRecording, MAX_SECONDS } from '../audio/recorder.js';
import { buzz } from '../lib/device.js';
import { sfx } from '../lib/sfx.js';
import Sprig from '../ui/Sprig.jsx';
import { Bubble } from '../ui/widgets.jsx';

/**
 * Listening: Sprig leans in, rings follow your voice. Tap to talk, tap to stop
 * (auto-stops after 20 s). The transcript lands in the text box for fixing.
 */
export default function VoiceInput({ onTranscript }) {
  const [available, setAvailable] = useState(null);
  const [state, setState] = useState('idle'); // idle | listening | thinking | error
  const [error, setError] = useState(null);
  const [heard, setHeard] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef(null);
  const tick = useRef(null);
  const frame = useRef(0);

  useEffect(() => {
    isSpeechInstalled().then(setAvailable, () => setAvailable(false));
    return () => {
      rec.current?.cancel();
      clearInterval(tick.current);
    };
  }, []);

  const stop = async () => {
    if (!rec.current) return;
    clearInterval(tick.current);
    buzz([60, 60, 60]);
    setState('thinking');
    try {
      const audio = await rec.current.stop();
      rec.current = null;
      const { text } = await transcribe(audio);
      if (!text) throw new Error("Didn't catch that. Try again a little closer to the phone.");
      setHeard(text);
      onTranscript(text);
      sfx('found');
      setState('idle');
    } catch (err) {
      rec.current = null;
      setError(err.message);
      setState('error');
    }
  };

  const start = async () => {
    setError(null);
    sfx('tap');
    try {
      rec.current = await startRecording({
        onAutoStop: stop,
        // ~20 updates a second is plenty for the rings.
        onLevel: (v) => {
          frame.current = (frame.current + 1) % 3;
          if (frame.current === 0) setLevel(v);
        },
      });
      buzz([120]);
      setSeconds(0);
      tick.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setState('listening');
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Microphone permission is off. You can type instead.' : err.message);
      setState('error');
    }
  };

  const say =
    state === 'listening'
      ? `Listening… ${MAX_SECONDS - seconds}s left. Tap the button when you're done.`
      : state === 'thinking'
        ? 'Understanding… (on this phone)'
        : state === 'error'
          ? error
          : heard
            ? `"${heard}"`
            : available === false
              ? 'Voice model not downloaded. Type what you found below.'
              : 'What did you find? Tap the button and tell me.';

  return (
    <div class="voice">
      <Bubble live="polite">{say}</Bubble>
      <Sprig state={state === 'listening' ? 'listening' : state === 'thinking' ? 'thinking' : 'idle'} level={level} size={140} />
      {available && (
        <button
          class={`mic ${state}`}
          style={{ '--lvl': state === 'listening' ? level.toFixed(2) : 0 }}
          onClick={state === 'listening' ? stop : start}
          disabled={state === 'thinking'}
          aria-label={state === 'listening' ? 'Stop recording' : 'Tap and say what you found'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {state === 'listening' ? (
              <rect x="7" y="7" width="10" height="10" rx="2" />
            ) : (
              <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
            )}
          </svg>
        </button>
      )}
    </div>
  );
}
