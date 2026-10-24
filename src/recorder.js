// "Record 15s": captures the WebGL canvas (plus the user's audio if playing)
// with MediaRecorder and downloads the result.

const TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4', // Safari fallback: no webm support there
];

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export function recordCanvas(canvas, { seconds = 15, audioTrack = null, onTick } = {}) {
  return new Promise((resolve, reject) => {
    const mimeType = pickMimeType();
    if (mimeType === null) return reject(new Error('MediaRecorder is not supported in this browser'));

    const stream = canvas.captureStream(30);
    if (audioTrack) stream.addTrack(audioTrack);
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onerror = (e) => reject(e.error || e);
    rec.onstop = () => {
      stream.getVideoTracks().forEach((t) => t.stop());
      const type = rec.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `led-dome-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      resolve(blob);
    };

    rec.start(1000);
    const started = performance.now();
    const timer = setInterval(() => {
      const left = Math.max(0, seconds - (performance.now() - started) / 1000);
      onTick?.(left);
      if (left <= 0) {
        clearInterval(timer);
        rec.stop();
      }
    }, 250);
  });
}
