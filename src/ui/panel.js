// Wires the control panel in index.html to the app. Kept free of Three.js so
// the UI and the rendering code stay independent.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function setActive(attr, value) {
  for (const b of $$(`[data-${attr}]`)) {
    const on = b.dataset[attr] === String(value);
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
    b.setAttribute('role', 'radio');
  }
}

function bindSlider(id, onInput, format = (v) => v.toFixed(2)) {
  const input = $(`#${id}`);
  const out = $(`output[for="${id}"]`);
  const update = () => {
    const v = parseFloat(input.value);
    out.textContent = format(v);
    onInput(v);
  };
  input.addEventListener('input', update);
  update();
}

export function bindPanel(app) {
  // Collapse / expand (starts collapsed on small screens).
  const panel = $('#panel');
  const collapse = $('#collapse');
  const setCollapsed = (c) => {
    panel.classList.toggle('collapsed', c);
    collapse.textContent = c ? '+' : '–';
    collapse.setAttribute('aria-expanded', !c);
    collapse.title = c ? 'Show controls' : 'Hide controls';
  };
  collapse.addEventListener('click', () => setCollapsed(!panel.classList.contains('collapsed')));
  if (window.matchMedia('(max-width: 600px)').matches) setCollapsed(true);

  // --- Content source ---
  const videoInput = $('#video-file');
  const captureBtn = $('#capture-btn');

  for (const b of $$('[data-source]')) {
    b.addEventListener('click', () => {
      const s = b.dataset.source;
      if (s === 'video' && !app.hasVideo()) return videoInput.click();
      if (s === 'screen' && !app.hasCapture()) return app.startCapture();
      app.setSource(s);
    });
  }
  videoInput.addEventListener('change', () => {
    const f = videoInput.files[0];
    if (f) app.loadVideo(f);
    videoInput.value = '';
  });
  if (!app.captureSupported) {
    captureBtn.disabled = true;
    captureBtn.title = 'Screen capture is not supported in this browser';
    captureBtn.textContent = 'Capture n/a';
  }
  captureBtn.addEventListener('click', () => app.startCapture());

  // Drag-and-drop anywhere on the page.
  const hint = $('#drop-hint');
  let depth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; hint.hidden = false; });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; hint.hidden = true; } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    hint.hidden = true;
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (f.type.startsWith('video/')) app.loadVideo(f);
    else if (f.type.startsWith('audio/')) app.loadAudio(f);
    else toast('Drop a video file (mp4 / webm / mov)');
  });

  // --- View ---
  for (const b of $$('[data-view]')) b.addEventListener('click', () => app.setView(b.dataset.view));
  for (const b of $$('[data-mapping]')) b.addEventListener('click', () => app.setMapping(+b.dataset.mapping));
  const autoOrbit = $('#auto-orbit');
  autoOrbit.addEventListener('change', () => app.setAutoOrbit(autoOrbit.checked));

  // --- Sliders ---
  bindSlider('brightness', (v) => app.set('brightness', v));
  bindSlider('dot-size', (v) => app.set('dotSize', v));
  bindSlider('density', (v) => app.set('density', v), (v) => `${v} rows`);
  bindSlider('bloom', (v) => app.set('bloom', v));
  bindSlider('rotation', (v) => app.set('rotation', v), (v) => `${v.toFixed(2)} rad/s`);
  bindSlider('cat-spin', (v) => app.set('catSpin', v), (v) => `${v.toFixed(1)} rad/s`);

  // --- Cat mode ---
  const catMode = $('#cat-mode');
  const green = $('#green-screen');
  catMode.addEventListener('change', () => app.setCatMode(catMode.checked));
  green.addEventListener('change', () => {
    if (green.checked && !catMode.checked) {
      catMode.checked = true;
      app.setCatMode(true);
    }
    app.setGreenScreen(green.checked);
  });

  const audioInput = $('#audio-file');
  const audioBtn = $('#audio-toggle');
  audioInput.addEventListener('change', () => {
    const f = audioInput.files[0];
    if (f) app.loadAudio(f);
    audioInput.value = '';
  });
  audioBtn.addEventListener('click', async () => {
    audioBtn.textContent = (await app.toggleAudio()) ? 'Pause' : 'Play';
  });

  // --- Record ---
  const rec = $('#record-btn');
  rec.addEventListener('click', async () => {
    if (rec.classList.contains('recording')) return;
    rec.classList.add('recording');
    try {
      await app.record((left) => (rec.textContent = `● Recording… ${Math.ceil(left)}s`));
      toast('Saved recording');
    } catch (e) {
      toast(e.message || 'Recording failed');
    } finally {
      rec.classList.remove('recording');
      rec.textContent = '● Record 15s';
    }
  });

  // The app calls back into these to reflect state changes.
  return {
    showSource(source, text) {
      setActive('source', source);
      $('#source-status').textContent = text;
    },
    showView(view) { setActive('view', view); },
    showMapping(m) { setActive('mapping', m); },
    showAutoOrbit(on) { autoOrbit.checked = on; },
    showCat(text) { $('#cat-status').textContent = text; },
    showAudio(name) {
      audioBtn.disabled = !name;
      audioBtn.textContent = 'Play';
      if (name) toast(`Audio loaded: ${name}`);
    },
  };
}
