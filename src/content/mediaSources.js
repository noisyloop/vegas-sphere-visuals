import * as THREE from 'three';

// Video-file and screen-capture inputs. Both end up as a <video> element that
// feeds a THREE.VideoTexture.

function makeVideoTexture(video) {
  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

function makeVideoElement() {
  const video = document.createElement('video');
  video.muted = true; // always muted: autoplay-safe, audio comes from the audio picker
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  return video;
}

export class VideoFileSource {
  constructor() {
    this.video = null;
    this.texture = null;
    this.url = null;
    this.name = '';
  }

  async load(file) {
    this.dispose();
    this.url = URL.createObjectURL(file);
    this.name = file.name;
    this.video = makeVideoElement();
    this.video.src = this.url;
    await this.video.play();
    this.texture = makeVideoTexture(this.video);
    return this.texture;
  }

  get ready() {
    return !!this.texture;
  }

  dispose() {
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.texture?.dispose();
    this.video = this.texture = this.url = null;
  }
}

export class ScreenCaptureSource {
  constructor() {
    this.stream = null;
    this.video = null;
    this.texture = null;
    this.onEnded = null; // called when the user stops sharing from the browser UI
  }

  static get supported() {
    return !!navigator.mediaDevices?.getDisplayMedia;
  }

  async start() {
    this.stop();
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      audio: false,
    });
    const [track] = this.stream.getVideoTracks();
    track.addEventListener('ended', () => {
      this.stop();
      this.onEnded?.();
    });
    this.video = makeVideoElement();
    this.video.loop = false;
    this.video.srcObject = this.stream;
    await this.video.play();
    this.texture = makeVideoTexture(this.video);
    return this.texture;
  }

  get ready() {
    return !!this.texture;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.video) this.video.srcObject = null;
    this.texture?.dispose();
    this.stream = this.video = this.texture = null;
  }
}
