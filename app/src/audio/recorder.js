// Microphone capture → 16 kHz mono Float32Array for Whisper.

export const MAX_SECONDS = 20;

/**
 * Start recording. Resolves once the microphone is open.
 * @returns {Promise<{ stop: () => Promise<Float32Array>, cancel: () => void }>}
 */
export async function startRecording({ onAutoStop } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start();

  const release = () => stream.getTracks().forEach((t) => t.stop());
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
