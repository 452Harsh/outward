// Microphone capture → 16 kHz mono Float32Array for Whisper.

export const MAX_SECONDS = 20;

/**
 * Start recording. Resolves once the microphone is open.
 * @returns {Promise<{ stop: () => Promise<Float32Array>, cancel: () => void }>}
 */
export async function startRecording({ onAutoStop, onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start();

  // Live input level (0..1) for Sprig's listening rings. The screen is on while
  // recording, so a Web Audio analyser on the mic is safe here.
  let meter = null;
  if (onLevel) {
    try {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      let raf = 0;
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      meter = () => {
        cancelAnimationFrame(raf);
        ctx.close();
        onLevel(0);
      };
    } catch {
      meter = null;
    }
  }

  const release = () => {
    meter?.();
    stream.getTracks().forEach((t) => t.stop());
  };
  const timer = setTimeout(() => onAutoStop?.(), MAX_SECONDS * 1000);

  return {
    async stop() {
      clearTimeout(timer);
      if (rec.state !== 'inactive') rec.stop();
      await stopped;
      release();
      return decodeTo16k(new Blob(chunks, { type: rec.mimeType }));
    },
    cancel() {
      clearTimeout(timer);
      if (rec.state !== 'inactive') rec.stop();
      release();
    },
  };
}

async function decodeTo16k(blob) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    return audio.getChannelData(0).slice();
  } finally {
    ctx.close();
  }
}
