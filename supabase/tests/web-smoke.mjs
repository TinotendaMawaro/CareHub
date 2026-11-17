// Drives the running web app in a real browser: sign in, visit every dashboard page,
// and report console errors, page crashes and failed network calls.
//   WEB_URL=http://localhost:9002 SMOKE_EMAIL=... SMOKE_PASSWORD=... node supabase/tests/web-smoke.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.WEB_URL ?? 'http://localhost:9002';
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;
const EXE = process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SHOTS = process.env.SHOTS_DIR ?? './.smoke-shots';
if (!EMAIL || !PASSWORD) throw new Error('Set SMOKE_EMAIL and SMOKE_PASSWORD');
mkdirSync(SHOTS, { recursive: true });

const PAGES = ['/dashboard', '/dashboard/scheduling', '/dashboard/schedule', '/dashboard/roster', '/dashboard/approvals',
  '/dashboard/chat', '/dashboard/clients', '/dashboard/caregivers', '/dashboard/onboarding', '/dashboard/users',
  '/dashboard/shift-note', '/dashboard/incidents', '/dashboard/timesheets', '/dashboard/invoices', '/dashboard/reports',
  '/dashboard/pricing', '/dashboard/settings'];

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 850 } })).newPage();
let problems = 0;
const log = [];
page.on('pageerror', (e) => log.push({ kind: 'crash', text: e.message }));
page.on('console', (m) => { if (m.type() === 'error') log.push({ kind: 'console', text: `${m.text().slice(0, 300)} ${m.location().url ?? ''}` }); });
page.on('response', (r) => {
  const u = r.url();
  if (r.status() >= 400) log.push({ kind: `http ${r.status()}`, text: u.replace(/\?.*/, '').slice(0, 160) });
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${SHOTS}/login.png` });
await page.fill('#email', EMAIL);
await page.fill('#password', PASSWORD);
await Promise.all([page.waitForURL('**/dashboard**', { timeout: 30000 }), page.click('button[type=submit]')]);
console.log('signed in ->', page.url());
// Office users must accept the current terms before the dashboard opens; do it as the test user.
for (let i = 0; i < 8; i++) {
  const gate = page.locator('#terms-name');
  if (!(await gate.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false))) break;
  await gate.fill('Smoke Test');
  await page.getByRole('button', { name: /^I accept/ }).click();
  await page.waitForTimeout(1500);
}

for (const path of PAGES) {
  log.length = 0;
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => log.push({ kind: 'nav', text: e.message }));
  await page.waitForTimeout(800);
  const h = (await page.locator('h1').first().textContent({ timeout: 8000 }).catch(() => null))?.trim();
  const body = (await page.locator('body').innerText({ timeout: 15000 }).catch(() => 'TIMEOUT')).slice(0, 4000);
  const crashed = /Application error|Unhandled Runtime Error|This page couldn.t load/i.test(body);
  const bad = log.filter((l) => !/favicon|Download the React DevTools/.test(l.text));
  const ok = page.url().includes(path) && !crashed && bad.length === 0;
  if (!ok) problems++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${path.padEnd(26)} h1=${JSON.stringify(h ?? '')}${page.url().includes(path) ? '' : ' redirected to ' + page.url()}`);
  for (const l of bad.slice(0, 4)) console.log(`       ${l.kind}: ${l.text}`);
  await page.screenshot({ path: `${SHOTS}/${path.replace(/\W+/g, '_')}.png` });
}
await browser.close();
console.log(problems ? `${problems} page(s) with problems` : 'ALL PAGES LOADED CLEAN');
process.exit(problems ? 1 : 0);
