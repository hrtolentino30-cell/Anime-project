import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log('[qa:pass]', name);
  } catch (error) {
    failures.push({ name, error });
    console.error('[qa:fail]', name, error?.stack || error);
  }
}

async function newPage(options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

async function openCase(page, kind) {
  await page.goto(`${base}/player-qa?case=${kind}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.bbp-root').waitFor();
  assert.equal(await page.locator('[data-testid="qa-case"]').getAttribute('data-case'), kind);
}

async function waitVideoReady(page) {
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return !!video && video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0;
  }, null, { timeout: 35_000 });
}

async function playAndAdvance(page) {
  await waitVideoReady(page);
  await page.locator('video').evaluate(async (video) => {
    await video.play();
  });
  await page.waitForFunction(() => (document.querySelector('video')?.currentTime || 0) > 0.35, null, { timeout: 15_000 });
}

async function touchSwipe(page, start, end) {
  await page.locator('.bbp-root').evaluate((root, points) => {
    const makeTouch = (point) => new Touch({
      identifier: 1,
      target: root,
      clientX: point.x,
      clientY: point.y,
      pageX: point.x,
      pageY: point.y,
      screenX: point.x,
      screenY: point.y,
      radiusX: 2,
      radiusY: 2,
      rotationAngle: 0,
      force: 1,
    });
    const first = makeTouch(points.start);
    const last = makeTouch(points.end);
    root.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, cancelable: true, touches: [first], targetTouches: [first], changedTouches: [first],
    }));
    root.dispatchEvent(new TouchEvent('touchmove', {
      bubbles: true, cancelable: true, touches: [last], targetTouches: [last], changedTouches: [last],
    }));
    root.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [last],
    }));
  }, { start, end });
}

await check('MP4 playback, seek, scrubber, resume, 2x hold and auto-hide controls', async () => {
  const { context, page } = await newPage();
  await openCase(page, 'mp4');
  assert.equal(await page.locator('.bbp-root').getAttribute('data-source-type'), 'direct');
  await playAndAdvance(page);

  const before = await page.locator('video').evaluate((v) => v.currentTime);
  await page.getByRole('button', { name: 'Forward 5 seconds' }).click();
  const afterForward = await page.locator('video').evaluate((v) => v.currentTime);
  assert.ok(afterForward >= before + 3.5, `+5 seek did not advance enough: ${before} -> ${afterForward}`);
  await page.getByRole('button', { name: 'Back 5 seconds' }).click();
  const afterBack = await page.locator('video').evaluate((v) => v.currentTime);
  assert.ok(afterBack <= afterForward - 3.5, `-5 seek did not rewind enough: ${afterForward} -> ${afterBack}`);

  await page.locator('.bbp-progress input').evaluate((el) => {
    el.value = '500';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const scrubbed = await page.locator('video').evaluate((v) => ({ current: v.currentTime, duration: v.duration }));
  assert.ok(Math.abs(scrubbed.current / scrubbed.duration - 0.5) < 0.12, 'scrubber did not seek near 50%');

  const box = await page.locator('video').boundingBox();
  assert.ok(box, 'video has no bounding box');
  await page.mouse.move(box.x + box.width * 0.24, box.y + box.height * 0.42);
  await page.mouse.down();
  await page.waitForTimeout(260);
  assert.equal(await page.locator('video').evaluate((v) => v.playbackRate), 2);
  await page.mouse.up();
  await page.waitForTimeout(80);
  assert.equal(await page.locator('video').evaluate((v) => v.playbackRate), 1);

  await page.locator('video').evaluate((v) => {
    v.currentTime = Math.min(6.2, Math.max(1, v.duration * 0.42));
    v.dispatchEvent(new Event('timeupdate'));
  });
  const saved = await page.evaluate(() => Number(localStorage.getItem('animori-player-progress:9517df52-255a-4216-998b-08629b519a94') || 0));
  assert.ok(saved > 0, 'local resume point was not saved');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitVideoReady(page);
  await page.waitForTimeout(250);
  const resumed = await page.locator('video').evaluate((v) => v.currentTime);
  assert.ok(resumed >= Math.max(0.5, saved - 1.2), `resume point was not restored: saved=${saved}, resumed=${resumed}`);

  await page.waitForTimeout(2400);
  assert.equal(await page.locator('.bbp-root').evaluate((el) => el.classList.contains('bbp-controls')), false);
  await page.locator('.bbp-root').hover({ position: { x: 150, y: 120 } });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('.bbp-root').evaluate((el) => el.classList.contains('bbp-controls')), true);
  await context.close();
});

await check('ordinary HLS uses direct browser-to-origin hls.js path', async () => {
  const { context, page } = await newPage();
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await openCase(page, 'hls');
  await playAndAdvance(page);
  assert.equal(await page.locator('.bbp-root').getAttribute('data-source-id'), 'qa-hls');
  assert.ok(requests.some((url) => url.includes('test-streams.mux.dev')), 'no direct HLS origin request observed');
  assert.ok(!requests.some((url) => url.includes('/api/hls-proxy?url=')), 'ordinary HLS was unnecessarily relayed');
  await context.close();
});

await check('relay-required HLS uses allowlisted relay and plays', async () => {
  const { context, page } = await newPage();
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await openCase(page, 'relay');
  await playAndAdvance(page);
  assert.equal(await page.locator('.bbp-root').getAttribute('data-source-id'), 'qa-relay');
  assert.ok(requests.some((url) => url.includes('/api/hls-proxy?url=')), 'relay HLS did not use the relay route');
  await context.close();
});

await check('source health/expiry filtering, network guard and automatic server failover', async () => {
  const { context, page } = await newPage();
  await openCase(page, 'failover');
  await page.waitForFunction(() => document.querySelector('.bbp-root')?.getAttribute('data-source-id') === 'qa-fallback', null, { timeout: 35_000 });
  await playAndAdvance(page);
  await page.getByRole('button', { name: 'More options' }).click();
  const panelText = await page.locator('.bbp-panel').innerText();
  assert.ok(!panelText.includes('Filtered Unhealthy'), 'unhealthy source was not filtered');
  assert.ok(!panelText.includes('Filtered Expired'), 'expired source was not filtered');
  assert.ok(panelText.includes('QA MP4 Fallback'), 'fallback source missing');
  await context.close();
});

await check('manual playback server switching works both directions', async () => {
  const { context, page } = await newPage();
  await openCase(page, 'servers');
  await playAndAdvance(page);
  assert.equal(await page.locator('.bbp-root').getAttribute('data-source-id'), 'qa-server-mp4');
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: /QA HLS Server/ }).click();
  await page.waitForFunction(() => document.querySelector('.bbp-root')?.getAttribute('data-source-id') === 'qa-server-hls');
  await playAndAdvance(page);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: /QA MP4 Server/ }).click();
  await page.waitForFunction(() => document.querySelector('.bbp-root')?.getAttribute('data-source-id') === 'qa-server-mp4');
  await playAndAdvance(page);
  await context.close();
});

await check('external iframe is sandboxed and non-user popup protection remains active', async () => {
  const { context, page } = await newPage();
  await openCase(page, 'embed');
  const iframe = page.locator('iframe.bbp-embed');
  await iframe.waitFor();
  const sandbox = await iframe.getAttribute('sandbox');
  assert.ok(sandbox?.includes('allow-scripts'), 'embed scripts are not enabled');
  assert.ok(!sandbox?.includes('allow-popups'), 'popup permission leaked into sandbox');
  assert.ok(!sandbox?.includes('allow-top-navigation'), 'top-navigation permission leaked into sandbox');
  const blocked = await page.evaluate(() => {
    const popup = window.open('https://example.com', '_blank');
    if (popup) {
      popup.close();
      return false;
    }
    return true;
  });
  assert.equal(blocked, true, 'non-user popup was not blocked');
  assert.equal(await page.locator('.bbp-root').getAttribute('data-popup-blocked'), 'true');
  await context.close();
});

await check('5-second next-episode countdown can be cancelled with Stay Here', async () => {
  const { context, page } = await newPage();
  await openCase(page, 'mp4');
  await waitVideoReady(page);
  await page.locator('video').evaluate(async (v) => {
    v.currentTime = Math.max(0, v.duration - 4.2);
    await v.play();
  });
  await page.getByRole('button', { name: 'Stay Here' }).waitFor({ timeout: 8_000 });
  await page.getByRole('button', { name: 'Stay Here' }).click();
  const initialUrl = page.url();
  await page.waitForTimeout(4800);
  assert.equal(page.url(), initialUrl, 'autoplay navigated after Stay Here');
  await context.close();
});

await check('episode picker and keyboard previous/next navigation preserve Animori watch routes', async () => {
  const { context, page } = await newPage();
  await openCase(page, 'mp4');
  await page.getByRole('button', { name: 'Episodes' }).click();
  await page.getByRole('button', { name: 'EP 08' }).click();
  await page.waitForURL('**/watch/c3da0332-e418-4643-997b-3db89e871450');
  assert.ok(page.url().includes('/watch/c3da0332-e418-4643-997b-3db89e871450'));

  await page.goto(`${base}/player-qa?case=mp4`, { waitUntil: 'domcontentloaded' });
  await page.locator('.bbp-root').waitFor();
  await page.keyboard.press('ArrowUp');
  await page.waitForURL('**/watch/cfd77a4a-8b0b-4b9e-8fec-b3cf89790045');
  await context.close();
});

await check('mouse-wheel next episode navigation works', async () => {
  const { context, page } = await newPage();
  await openCase(page, 'mp4');
  await page.mouse.move(220, 300);
  await page.mouse.wheel(0, 180);
  await page.waitForURL('**/watch/c3da0332-e418-4643-997b-3db89e871450');
  await context.close();
});

await check('mobile swipe navigation, edge-back, and portrait/landscape state work', async () => {
  const { context, page } = await newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await openCase(page, 'mp4');
  assert.equal(await page.locator('.bbp-root').evaluate((el) => el.classList.contains('bbp-device-landscape')), false);
  await touchSwipe(page, { x: 200, y: 650 }, { x: 200, y: 470 });
  await page.waitForURL('**/watch/c3da0332-e418-4643-997b-3db89e871450');

  await page.goto(`${base}/player-qa?case=mp4`, { waitUntil: 'domcontentloaded' });
  await page.locator('.bbp-root').waitFor();
  await touchSwipe(page, { x: 10, y: 360 }, { x: 150, y: 362 });
  await page.waitForURL('**/anime/rezero-starting-life-in-another-world-season-4');

  await page.goto(`${base}/player-qa?case=mp4`, { waitUntil: 'domcontentloaded' });
  await page.locator('.bbp-root').waitFor();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => document.querySelector('.bbp-root')?.classList.contains('bbp-device-landscape'));
  await context.close();
});

await check('favorite, reactions, reporting, share, Surprise Me and analytics/event hooks remain wired', async () => {
  const { context, page } = await newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => undefined,
    });
  });
  await openCase(page, 'mp4');

  await page.getByRole('button', { name: 'My List' }).click();
  assert.equal(await page.locator('.bbp-root').getAttribute('data-last-event'), null);
  assert.ok((await page.locator('.bbp-toast').last().textContent())?.includes('Added to My List'));

  await page.getByRole('button', { name: 'React' }).click();
  await page.getByRole('button', { name: 'Fire' }).click();
  assert.equal(await page.locator('.bbp-root').getAttribute('data-last-event'), 'reaction');

  await page.getByRole('button', { name: 'Share' }).click();
  await page.waitForFunction(() => document.querySelector('.bbp-root')?.getAttribute('data-last-event') === 'share');

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: 'Report issue' }).click();
  await page.locator('textarea').fill('Automated QA report');
  await page.getByRole('button', { name: 'Send report' }).click();
  await page.waitForFunction(() => document.querySelector('.bbp-root')?.getAttribute('data-last-event') === 'report_issue');

  await page.waitForTimeout(950);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: 'Surprise Me' }).click();
  await page.waitForURL('**/watch/**');
  await context.close();
});

await check('fullscreen control requests fullscreen when supported', async () => {
  const { context, page } = await newPage();
  await openCase(page, 'mp4');
  const supported = await page.evaluate(() => document.fullscreenEnabled);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: 'Landscape / fullscreen' }).click();
  if (supported) {
    await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5_000 });
    await page.keyboard.press('Escape');
  }
  await context.close();
});

await check('real Animori HLS episode loads through the integrated player', async () => {
  const { context, page } = await newPage();
  await page.goto(`${base}/watch/9517df52-255a-4216-998b-08629b519a94`, { waitUntil: 'domcontentloaded' });
  await page.locator('.bbp-root').waitFor();
  assert.equal(await page.locator('.bbp-root').getAttribute('data-source-type'), 'hls');
  await playAndAdvance(page);
  await context.close();
});

await check('real Animori embed-only episode renders the sandboxed player', async () => {
  const { context, page } = await newPage();
  await page.goto(`${base}/watch/3f43487f-277e-4974-8d8d-43a71cb1f1c4`, { waitUntil: 'domcontentloaded' });
  await page.locator('.bbp-root').waitFor();
  assert.equal(await page.locator('.bbp-root').getAttribute('data-source-type'), 'embed');
  const iframe = page.locator('iframe.bbp-embed');
  await iframe.waitFor();
  const sandbox = await iframe.getAttribute('sandbox');
  assert.ok(!sandbox?.includes('allow-popups'));
  assert.ok(!sandbox?.includes('allow-top-navigation'));
  await context.close();
});

await browser.close();

if (failures.length) {
  console.error('\nPlayer QA failures:');
  for (const failure of failures) console.error('-', failure.name);
  process.exit(1);
}
console.log('\nAll player integration QA checks passed.');
