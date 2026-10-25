// Run after starting the P7 demo servers on API_PORT=8788 WEB_PORT=5188.
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto('http://127.0.0.1:5188/check-in?crispdemo=1');
  await page.getByText('Connected', { exact: false }).waitFor();
  for (const state of ['idle', 'listening', 'thinking', 'talking', 'happy', 'pointing']) {
    await page.getByLabel('Character state').selectOption(state);
    if (!await page.getByRole('region', { name: 'Crisp character preview' }).getByRole('img', { name: `Crisp, ${state}`, exact: true }).isVisible()) throw new Error(`Missing ${state}`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animations = await page.locator('.crisp-character .crisp-body').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).animationName));
  if (animations.some(name => name !== 'none')) throw new Error('Reduced motion did not disable animation');
  await page.setViewportSize({ width: 375, height: 812 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Page overflows at 375px');
  if (await page.getByRole('button', { name: 'Talk to Crisp', exact: true }).count()) throw new Error('Voice unexpectedly visible without agent id');
  if (errors.length) throw new Error(JSON.stringify(errors));
  await page.screenshot({ path: 'output/p7-crisp-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel('Character state').selectOption('talking');
  await page.screenshot({ path: 'output/p7-crisp-preview.png', fullPage: true });
  console.log(JSON.stringify({ states: 6, reducedMotion: true, mobileWidth: 375, overflow: false, voiceHiddenWithoutId: true, consoleErrors: errors }));
} finally { await browser.close(); }
