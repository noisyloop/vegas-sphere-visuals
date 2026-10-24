// Plays an audio file the user picks (nothing is bundled). Routed through Web
// Audio so we can (a) read a level for the cat bounce and (b) hand a
// MediaStream track to the recorder so recordings include the sound.

export class AudioPlayer {
  constructor() {
    this.el = new Audio();
    this.el.loop = true;
    this.url = null;
    this.ctx = null;
    this.analyser = null;
    this.streamDest = null;
    this.data = null;
  }

  get loaded() {
    return !!this.url;
  }

  get playing() {
    return !this.el.paused;
  }

  load(file) {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(file);
    this.el.src = this.url;
  }

  // AudioContext must be created from a user gesture (play button).
  ensureGraph() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaElementSource(this.el);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.streamDest = this.ctx.createMediaStreamDestination();
    src.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.analyser.connect(this.streamDest);
  }

  async toggle() {
    if (!this.loaded) return false;
    this.ensureGraph();
    await this.ctx.resume();
    if (this.el.paused) await this.el.play();
    else this.el.pause();
    return this.playing;
  }

  // Bass-weighted level, 0..1.
  level() {
    if (!this.analyser || this.el.paused) return 0;
    this.analyser.getByteFrequencyData(this.data);
    let sum = 0;
    const n = 16;
    for (let i = 0; i < n; i++) sum += this.data[i];
    return sum / (n * 255);
  }

  audioTrack() {
    return this.playing ? this.streamDest?.stream.getAudioTracks()[0] : null;
  }
}
