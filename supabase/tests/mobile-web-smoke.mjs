// Drives the mobile app's web build as a support worker: sign in, accept terms, start a shift at the
// participant's address (simulated GPS), write a note, end the shift. Needs the fixtures from
// the link test setup (a worker with a live shift). Screenshots go to .smoke-shots/.
import { chromium } from 'playwright-core';

const BASE = process.env.MOBILE_URL ?? 'http://localhost:8082';
const EMAIL = process.env.WORKER_EMAIL;
const PASSWORD = process.env.WORKER_PASSWORD;
const AT = { latitude: -33.8688, longitude: 151.2093 };
const SHOTS = './.smoke-shots';
if (!EMAIL || !PASSWORD) throw new Error('Set WORKER_EMAIL and WORKER_PASSWORD');

const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, geolocation: AT, permissions: ['geolocation'] });
const p = await ctx.newPage();
let failed = 0;
const ok = (m) => console.log('  ok  ', m);
const bad = (m) => { failed++; console.log('  FAIL', m); };
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
p.on('dialog', (d) => void d.accept());
const see = async (text, timeout = 20000) => p.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);

try {
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  (await see('Sign in to see your shifts')) ? ok('sign-in screen shows') : bad('sign-in screen');
  await p.screenshot({ path: `${SHOTS}/m-1-signin.png` });
  await p.locator('input').nth(1).waitFor();
  const inputs = p.locator('input');
  await inputs.nth(0).fill(EMAIL);
  await inputs.nth(1).fill(PASSWORD);
  await p.getByRole('button', { name: 'Sign in' }).click();

  // A new worker must accept the terms before anything else.
  (await see('Please read it, then type your full name')) ? ok('held at the terms screen') : bad('terms screen did not appear');
  await p.screenshot({ path: `${SHOTS}/m-2-terms.png` });
  for (let i = 0; i < 4; i++) {
    const name = p.getByPlaceholder('Type your full name to accept');
    if (!(await name.isVisible().catch(() => false))) break;
    await name.fill('Mobi Worker');
    await p.getByRole('button', { name: /^I accept/ }).click();
    await p.waitForTimeout(1500);
  }
  (await see('My shifts')) ? ok('terms accepted, tabs open') : bad('tabs did not open after terms');
  (await see('Uitest Participant')) ? ok('today\'s shift is listed') : bad('shift not listed');
  await p.screenshot({ path: `${SHOTS}/m-3-shifts.png` });

  await p.getByRole('button', { name: 'View' }).first().click();
  (await see('Start shift')) ? ok('shift detail shows Start shift') : bad('no Start button');
  (await see('1 Test St, Sydney')) ? ok('address shown') : bad('address missing');
  await p.screenshot({ path: `${SHOTS}/m-4-shift.png` });

  await p.getByRole('button', { name: 'Start shift' }).click();
  (await see('In progress')) ? ok('started with the GPS fix at the address') : bad('shift did not start: ' + (await p.locator('body').innerText()).slice(0, 200).replace(/\n/g, ' | '));

  // Ending without a note is refused.
  await p.getByText('Uitest Participant').first().click().catch(() => {});
  await p.getByRole('button', { name: 'End shift' }).click();
  await p.waitForTimeout(800);
  (await see('write a shift note for Uitest Participant', 8000)) ? ok('ending without a note is refused with a clear message') : bad('no notes_required message');

  await p.getByPlaceholder(/What happened with Uitest/).fill('Had a good walk and lunch.');
  await p.getByRole('button', { name: 'Save note' }).click();
  (await see('Had a good walk and lunch.')) ? ok('note saved and listed') : bad('note not shown');
  await p.screenshot({ path: `${SHOTS}/m-5-note.png` });

  await p.getByRole('button', { name: 'End shift' }).click();
  (await see('Finished', 15000)) ? ok('shift ended: back on the list marked Finished') : bad('end did not complete');
  await p.screenshot({ path: `${SHOTS}/m-6-ended.png` });

  // Other tabs render.
  for (const tab of ['Chat', 'Timesheets', 'Me']) {
    await p.getByRole('tab', { name: new RegExp(tab) }).first().click().catch(async () => p.getByText(tab, { exact: true }).first().click());
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${SHOTS}/m-7-${tab}.png` });
    ok(`${tab} tab opens`);
  }
  errors.length === 0 ? ok('no JavaScript errors') : bad('JS errors: ' + errors.slice(0, 3).join(' || '));
} catch (e) {
  bad('unexpected: ' + e.message.split('\n')[0]);
  await p.screenshot({ path: `${SHOTS}/m-error.png` }).catch(() => {});
}
await b.close();
console.log(failed ? `${failed} check(s) FAILED` : 'MOBILE UI TEST PASSED');
process.exit(failed ? 1 : 0);
