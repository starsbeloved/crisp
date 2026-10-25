// Run against the running demo: node client/room/nav-browser.mjs [base URL]
// Uses a separate headless Chrome profile; never opens a physical camera or calls providers.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const base = process.argv[2] || 'http://127.0.0.1:5173';
const profile = await mkdtemp(join(tmpdir(), 'crisp-nav-chrome-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chrome', headless: true, chromiumSandbox: true,
  viewport: { width: 1440, height: 900 },
});
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== new URL(base).origin || url.pathname.startsWith('/api/') || /\.(bin|wasm|task)$/.test(url.pathname)) return route.abort();
  return route.continue();
});
await context.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => { throw new Error('Camera disabled for navigation check'); };
});
const page = context.pages()[0];
const results = [];
async function checkNav(label) {
  const hits = await page.locator('header nav a').evaluateAll(links => links.map(link => {
    const bounds = link.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return { text: link.textContent, href: link.getAttribute('href'), hit: hit?.outerHTML.slice(0, 150), matches: hit === link };
  }));
  assert.equal(hits.length, 6);
  console.log(JSON.stringify({ label, hits }));
  assert.ok(hits.every(hit => hit.matches), `${label}: navigation must receive pointer hits`);
  results.push(label);
}
async function checkFill(selector) {
  const bounds = await page.locator(selector).boundingBox();
  const header = await page.evaluate(() => {
    const bounds = !document.fullscreenElement && document.querySelector('header')?.getBoundingClientRect();
    return bounds ? { y: bounds.y, height: bounds.height } : null;
  });
  assert.ok(Math.abs(bounds.y - (header ? header.y + header.height : 0)) <= 1, `${selector}: starts below header`);
  assert.ok(Math.abs(bounds.y + bounds.height - 900) <= 1, `${selector}: fills available height`);
}
async function checkMenu(selector) {
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  await expect(page.locator('header')).toHaveCount(0);
  if (selector) await checkFill(selector);
  await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  await checkNav(`${selector || '/camera'}: menu restored`);
  if (selector) await checkFill(selector);
}
try {
  for (const path of ['/room', '/camera', '/camera?demo=1']) {
    await page.goto(base + path);
    await expect(page.getByRole('button', { name: 'Camera settings', exact: true })).toBeVisible();
    await checkNav(path);
    await page.getByRole('button', { name: 'Camera settings', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await checkNav(`${path}: settings open`);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    if (path === '/room') {
      await checkFill('.room-view');
      const camera = await page.locator('.room-camera').boundingBox();
      const hallway = await page.locator('.room-hallway').boundingBox();
      assert.ok(Math.abs(camera.width / hallway.width - 3) < .01, 'Room camera / hallway split is 3:1');
      await checkMenu('.room-view');
      await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => document.fullscreenElement?.className), 'room-view');
      await checkFill('.room-view');
      await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();
      await checkNav('/room: after fullscreen');
      await page.screenshot({ path: join(profile, 'room.png') });
    } else if (path.includes('demo=1')) {
      await checkFill('.camera-demo-view');
      await checkMenu('.camera-demo-view');
      await page.keyboard.press('Escape');
      await expect(page.locator('.camera-demo-view')).toHaveCount(0);
      await checkNav('/camera: after leaving demo mode');
    } else {
      await checkMenu();
    }
    // An actual pointer click must navigate, beyond the elementFromPoint checks.
    await page.getByRole('navigation', { name: 'Demo pages' }).getByRole('link', { name: 'Check in', exact: true }).click();
    await expect(page).toHaveURL(base + '/check-in');
  }
  console.log(JSON.stringify({ passed: true, viewport: '1440x900', checks: results, profile }));
} finally {
  await context.close();
}
