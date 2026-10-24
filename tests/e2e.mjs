// End-to-end smoke test: builds nothing, expects `npm run build` first.
// Starts `vite preview`, drives the app in headless Chromium and checks that
// every input mode and view mode puts real pixels on the dome.
//
//   npm run build && npm run test:e2e
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

// Playwright is not a project dependency (keeps installs/deploys light):
// install it once with `npm i -D playwright && npx playwright install chromium`.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'tests/output');
mkdirSync(out, { recursive: true });
const PORT = 4179;
const URL_ = `http://localhost:${PORT}/`;

const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => d.toString().includes(String(PORT)) && res());
  server.on('exit', rej);
  setTimeout(() => rej(new Error('preview server timeout')), 20000);
});

const browser = await chromium.launch({
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--auto-select-desktop-capture-source=Entire screen',
    '--auto-accept-this-tab-capture',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// Average colour + spread of a region of the WebGL canvas (fractions of size),
// read in the same frame it was drawn.
const stats = (rx = 0.3, ry = 0.25, rw = 0.4, rh = 0.4) =>
  page.evaluate(
    ([rx, ry, rw, rh]) =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          const src = document.getElementById('scene');
          const c = document.createElement('canvas');
          c.width = 200; c.height = 128;
          const g = c.getContext('2d');
          g.drawImage(src, 0, 0, 200, 128);
          const d = g.getImageData(rx * 200, ry * 128, rw * 200, rh * 128).data;
          let r = 0, gg = 0, b = 0, sq = 0;
          const n = d.length / 4;
          for (let i = 0; i < d.length; i += 4) {
            r += d[i]; gg += d[i + 1]; b += d[i + 2];
            const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
            sq += l * l;
          }
          const mean = (r + gg + b) / (3 * n);
          resolve({ r: r / n, g: gg / n, b: b / n, mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) });
        })
      ),
    [rx, ry, rw, rh]
  );
const fmt = (s) => `mean ${s.mean.toFixed(1)}, std ${s.std.toFixed(1)}, rgb(${s.r.toFixed(0)},${s.g.toFixed(0)},${s.b.toFixed(0)})`;
const waitFrames = async (n) => {
  const start = await page.evaluate(() => window.__ledDome.frames);
  await page.waitForFunction((t) => window.__ledDome.frames >= t, start + n, { timeout: 60000 });
};
const kind = () => page.evaluate(() => window.__ledDome.contentKind);
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });

try {
  await page.goto(URL_);
  await page.waitForFunction(() => window.__ledDome?.frames > 5, null, { timeout: 60000 });
  // Freeze the idle orbit so screenshots are comparable.
  await page.uncheck('#auto-orbit');

  // 1. Built-in demo, exterior
  await waitFrames(5);
  let s = await stats();
  check('demo: content is the fractal', (await kind()) === 'demo');
  check('demo: dome shows lit, varied pixels', s.mean > 8 && s.std > 4, fmt(s));
  await shot('1-demo-exterior');

  // 2. Video file via the file picker
  await page.setInputFiles('#video-file', path.join(root, 'tests/fixtures/test-pattern.webm'));
  await page.waitForFunction(() => window.__ledDome.contentKind === 'video', null, { timeout: 20000 });
  const t0 = await page.evaluate(() => window.__ledDome.sphere.uniforms.uContent.value.image.currentTime);
  await waitFrames(10);
  const t1 = await page.evaluate(() => window.__ledDome.sphere.uniforms.uContent.value.image.currentTime);
  const v = await page.evaluate(() => {
    const el = window.__ledDome.sphere.uniforms.uContent.value.image;
    return { muted: el.muted, loop: el.loop };
  });
  s = await stats();
  check('video: texture is the uploaded file', true);
  check('video: playing, muted, looped', t1 !== t0 && v.muted && v.loop, `t ${t0.toFixed(2)} -> ${t1.toFixed(2)}`);
  check('video: dome shows lit pixels', s.mean > 8 && s.std > 4, fmt(s));
  await shot('2-video-exterior');

  // 3. Screen capture (Chromium auto-accepts with the flags above)
  await page.click('#capture-btn');
  try {
    await page.waitForFunction(() => window.__ledDome.contentKind === 'screen', null, { timeout: 15000 });
    await waitFrames(10);
    s = await stats();
    check('screen: getDisplayMedia stream is the texture', true, fmt(s));
    await shot('3-screen-exterior');
  } catch {
    const toastText = await page.textContent('#toast');
    check('screen: getDisplayMedia stream is the texture', false, `toast: ${toastText}`);
  }

  // Back to the demo for the view-mode checks
  await page.click('[data-source="demo"]');
  check('source switch back to demo', (await kind()) === 'demo');

  // 4. Interior view, equirect
  await page.click('[data-view="interior"]');
  await waitFrames(5);
  s = await stats(0.1, 0.05, 0.8, 0.5);
  const inside = await page.evaluate(() => window.__ledDome.sphere.uniforms.uInterior.value);
  check('interior: camera inside, content wraps around', inside === 1 && s.mean > 8 && s.std > 4, fmt(s));
  await shot('4-demo-interior-equirect');

  // 5. Interior view, dome master
  await page.click('[data-mapping="1"]');
  await waitFrames(5);
  s = await stats(0.1, 0.05, 0.8, 0.5);
  check('interior: dome-master mapping renders', s.mean > 8 && s.std > 4, fmt(s));
  await shot('5-demo-interior-domemaster');

  // 6. Exterior + dome master, then back to equirect
  await page.click('[data-view="exterior"]');
  await waitFrames(5);
  await shot('6-demo-exterior-domemaster');
  await page.click('[data-mapping="0"]');

  // 7. Cat mode
  await page.check('#cat-mode');
  await page.waitForFunction(() => window.__ledDome.catSource !== 'loading');
  await waitFrames(8);
  s = await stats();
  check('cat: procedural cat is used without assets', (await page.evaluate(() => window.__ledDome.catSource)) === 'procedural');
  check('cat: sphere shows the cat texture', (await kind()) === 'cat' && s.mean > 5, fmt(s));
  await shot('7-cat-exterior');

  // 8. Green screen: corners must be pure chroma green
  await page.check('#green-screen');
  await waitFrames(3);
  const corner = await stats(0.0, 0.0, 0.1, 0.1);
  check('green screen: background is #00FF00', corner.g > 250 && corner.r < 3 && corner.b < 3, fmt(corner));
  await shot('8-cat-greenscreen');
  await page.uncheck('#green-screen');
  await page.uncheck('#cat-mode');

  // 9. Sliders reach the shader
  await page.fill('#density', '60');
  await page.dispatchEvent('#density', 'input');
  const rows = await page.evaluate(() => window.__ledDome.sphere.uniforms.uRows.value);
  check('density slider updates uniform', rows === 60, `rows=${rows}`);

  // 10. Recording (15 s, real time)
  if (!process.env.SKIP_RECORD) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), page.click('#record-btn')]);
    const file = path.join(out, dl.suggestedFilename());
    await dl.saveAs(file);
    const { size } = await import('node:fs').then((fs) => fs.statSync(file));
    check('record: downloads a .webm', file.endsWith('.webm') && size > 10000, `${dl.suggestedFilename()} ${(size / 1024).toFixed(0)} KB`);
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('test run completed', false, e.message);
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in tests/output/`);
process.exit(failed.length ? 1 : 0);
