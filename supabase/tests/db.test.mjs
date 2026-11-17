// Run: npm run test:db
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as } from './harness.mjs';

const U = {
  admin:  '00000000-0000-0000-0000-0000000000a1',
  office: '00000000-0000-0000-0000-0000000000a2',
  w1:     '00000000-0000-0000-0000-0000000000b1',
  w2:     '00000000-0000-0000-0000-0000000000b2',
  w3:     '00000000-0000-0000-0000-0000000000b3',
  nobody: '00000000-0000-0000-0000-0000000000ff',
};
const CG = { w1: '10000000-0000-0000-0000-0000000000b1', w2: '10000000-0000-0000-0000-0000000000b2', w3: '10000000-0000-0000-0000-0000000000b3' };
const CL = [1, 2, 3, 4].map((n) => `20000000-0000-0000-0000-00000000000${n}`);
const SYD = { lat: -33.8688, lng: 151.2093 };
const MON = '2027-03-01'; // a Monday; Sydney is on daylight time (UTC+11)

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const rpc = (user, fn, args = []) =>
  as(db, user, async () => {
    const ph = args.map((_, i) => `$${i + 1}`).join(', ');
    const r = await db.query(`select public.${fn}(${ph}) as r`, args.map((a) => (a !== null && typeof a === 'object' && !Array.isArray(a) ? JSON.stringify(a) : a)));
    return r.rows[0].r;
  });
const rejects = (p, re) => assert.rejects(p, (e) => (re.test(e.message) ? true : (console.error('got:', e.message), false)));
const create = (p) => rpc(U.office, 'create_shifts', [p]);

before(async () => {
  db = await createDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${U.admin}','admin@x.test'),('${U.office}','office@x.test'),('${U.w1}','w1@x.test'),
      ('${U.w2}','w2@x.test'),('${U.w3}','w3@x.test'),('${U.nobody}','nobody@x.test');
    insert into public.profiles (id,email,first_name,last_name,role) values
      ('${U.admin}','admin@x.test','Ada','Admin','admin'),('${U.office}','office@x.test','Olly','Office','office'),
      ('${U.w1}','w1@x.test','Wendy','One','caregiver'),('${U.w2}','w2@x.test','Walt','Two','caregiver'),
      ('${U.w3}','w3@x.test','Wren','Three','caregiver'),('${U.nobody}','nobody@x.test','No','Body','caregiver');
    insert into public.caregivers (id,user_id,name,email,worker_level) values
      ('${CG.w1}','${U.w1}','Wendy One','w1@x.test','level_2'),
      ('${CG.w2}','${U.w2}','Walt Two','w2@x.test','level_2'),
      ('${CG.w3}','${U.w3}','Wren Three','w3@x.test','level_2');
    insert into public.sites (id,name,kind,address,lat,lng) values
      ('30000000-0000-0000-0000-000000000001','Maple House','sil_home','1 Maple St',${SYD.lat},${SYD.lng});
    insert into public.clients (id,first_name,last_name,email,state,lat,lng) values
      ('${CL[0]}','Cara','Client','c1@x.test','NSW',${SYD.lat},${SYD.lng}),
      ('${CL[1]}','Dev','Client','c2@x.test','NSW',${SYD.lat},${SYD.lng}),
      ('${CL[2]}','Eli','Client','c3@x.test','NSW',${SYD.lat},${SYD.lng}),
      ('${CL[3]}','Fay','NoCoords','c4@x.test','NSW',null,null);
    insert into public.support_families (family_key,label,default_worker_level) values ('community','Community access','level_2'),('sil','SIL','level_2');
    insert into public.support_items (item_number,name,family_key,time_band,ratio,unit,is_sleepover,price_national) values
      ('WD11','Weekday day','community','weekday_day','1:1','Hour',false,60),
      ('WE11','Weekday evening','community','weekday_evening','1:1','Hour',false,66),
      ('WN11','Weekday night','community','weekday_night','1:1','Hour',false,70),
      ('SA11','Saturday','community','saturday','1:1','Hour',false,85),
      ('SU11','Sunday','community','sunday','1:1','Hour',false,110),
      ('PH11','Public holiday','community','public_holiday','1:1','Hour',false,130),
      ('WD12','Weekday day group','community','weekday_day','1:2','Hour',false,35),
      ('SLP1','Sleepover','sil','any','1:1','Each',true,300);
    insert into public.pay_rates (worker_level,time_band,hourly_rate,each_rate,effective_from) values
      ('level_2','weekday_day',40,null,'2026-01-01'),('level_2','weekday_evening',44,null,'2026-01-01'),
      ('level_2','weekday_night',46,null,'2026-01-01'),('level_2','saturday',55,null,'2026-01-01'),
      ('level_2','sunday',70,null,'2026-01-01'),('level_2','public_holiday',80,null,'2026-01-01'),
      ('level_2','any',40,150,'2026-01-01');
    insert into public.public_holidays (date,state,name) values ('2027-03-03','NSW','Test Holiday');
  `);
});

const local = (col, fmt = 'YYYY-MM-DD HH24:MI') => `to_char(${col} at time zone 'Australia/Sydney','${fmt}')`;

describe('security / RLS', () => {
  test('anonymous users see nothing and cannot call RPCs', async () => {
    await as(db, null, async () => {
      assert.equal((await db.query('select * from public.clients')).rows.length, 0);
      assert.equal((await db.query('select * from public.organisation_public')).rows.length, 1);
    });
    await rejects(as(db, null, () => db.query(`select public.create_shifts('{}')`)), /permission denied/);
  });

  test('a worker cannot create shifts, read other workers or escalate their role', async () => {
    await rejects(rpc(U.w1, 'create_shifts', [{}]), /forbidden/);
    await as(db, U.w1, async () => {
      assert.equal((await db.query('select * from public.caregivers')).rows.length, 1);
      assert.equal((await db.query('select * from public.invoices')).rows.length, 0);
      assert.equal((await db.query('select * from public.pay_rates')).rows.length, 0);
    });
    await rejects(as(db, U.w1, () => db.query(`update public.profiles set role='admin' where id='${U.w1}'`)), /forbidden/);
    await rejects(as(db, U.w1, () => db.query(`update public.caregivers set worker_level='level_9' where id='${CG.w1}'`)), /forbidden/);
  });

  test('only admins can edit the organisation; branding is public', async () => {
    await as(db, U.office, () => db.query(`update public.organisation set name='Nope'`));
    assert.notEqual((await one('select name from public.organisation')).name, 'Nope');
    await as(db, U.admin, () => db.query(`update public.organisation set name='Bright Care', brand_color='#112233', logo_url='https://x/logo.png'`));
    const pub = await as(db, null, async () => (await db.query('select * from public.organisation_public')).rows[0]);
    assert.deepEqual([pub.name, pub.brand_color, pub.logo_url], ['Bright Care', '#112233', 'https://x/logo.png']);
  });
});

describe('creating shifts', () => {
  test('multiple blocks per day, each with its own cost code (morning / afternoon / sleepover)', async () => {
    const r = await create({
      client_ids: [CL[0]], worker_ids: [CG.w1], date: MON,
      blocks: [
        { start_time: '06:00', end_time: '14:00', item_number: 'WD11' },
        { start_time: '14:00', end_time: '22:00', item_number: 'WE11' },
        { start_time: '22:00', end_time: '06:00', support_family: 'sil', is_sleepover: true },
      ],
    });
    assert.equal(r.shift_ids.length, 3);
    const rows = await q(
      `select ${local('s.start_time')} st, ${local('s.end_time')} en, s.item_number, s.is_sleepover,
              (select string_agg(ss.item_number || ':' || ss.units || ':' || ss.bill_amount, ',' order by ss.seg_start) from public.shift_segments ss where ss.shift_id = s.id) segs
       from public.shifts s where s.id = any($1) order by s.start_time`, [r.shift_ids]);
    assert.deepEqual(rows.map((x) => [x.st, x.en]), [
      ['2027-03-01 06:00', '2027-03-01 14:00'], ['2027-03-01 14:00', '2027-03-01 22:00'], ['2027-03-01 22:00', '2027-03-02 06:00']]);
    assert.equal(rows[0].segs, 'WD11:8.00:480.00');   // morning billed on the weekday-day code
    assert.equal(rows[1].segs, 'WE11:8.00:528.00');   // afternoon billed on the evening code
    assert.equal(rows[2].segs, 'SLP1:1.00:300.00');   // sleepover is one flat unit
    assert.equal(rows[2].is_sleepover, true);
  });

  test('recurring weekly shifts across weekdays, one series per block', async () => {
    const r = await create({
      client_ids: [CL[1]], worker_ids: [CG.w2], date: MON, support_family: 'community',
      blocks: [{ start_time: '09:00', end_time: '12:00' }],
      repeat: { freq: 'weekly', weekdays: [1, 3, 5], until: '2027-03-14' },
    });
    assert.equal(r.shift_ids.length, 6); // Mon/Wed/Fri x 2 weeks
    assert.equal(r.series_ids.length, 1);
    const days = await q(`select ${local('start_time', 'Dy')} d from public.shifts where series_id = $1 order by start_time`, [r.series_ids[0]]);
    assert.deepEqual(days.map((d) => d.d), ['Mon', 'Wed', 'Fri', 'Mon', 'Wed', 'Fri']);
  });

  test('every-other-week and count limits', async () => {
    const r = await create({
      client_ids: [CL[2]], worker_ids: [CG.w3], date: MON, support_family: 'community',
      blocks: [{ start_time: '09:00', end_time: '10:00' }],
      repeat: { freq: 'weekly', interval: 2, weekdays: [1], count: 3 },
    });
    const d = await q(`select start_time::date from public.shifts where id = any($1) order by start_time`, [r.shift_ids]);
    assert.equal(r.shift_ids.length, 3);
    assert.deepEqual(d.map((x) => x.start_time.toISOString().slice(0, 10)), ['2027-02-28', '2027-03-14', '2027-03-28']); // UTC dates of 09:00 AEDT
  });

  test('worker clash blocks creation unless skip_conflicts, which reports what it skipped', async () => {
    await rejects(
      create({ client_ids: [CL[2]], worker_ids: [CG.w1], date: MON, support_family: 'community', blocks: [{ start_time: '10:00', end_time: '12:00' }] }),
      /worker_clash/);
    const r = await create({
      client_ids: [CL[2]], worker_ids: [CG.w1], date: MON, support_family: 'community', skip_conflicts: true,
      blocks: [{ start_time: '10:00', end_time: '12:00' }], repeat: { freq: 'daily', until: '2027-03-03' },
    });
    assert.equal(r.skipped.length, 1); // Monday clashes with w1's 06:00-14:00 shift
    assert.equal(r.shift_ids.length, 2);
  });

  test('validation: nobody, no blocks, bad range', async () => {
    await rejects(create({ client_ids: [], date: MON, blocks: [{ start_time: '09:00', end_time: '10:00' }] }), /at least one participant/);
    await rejects(create({ client_ids: [CL[0]], date: MON, blocks: [] }), /at least one shift block/);
    await rejects(create({ client_ids: [CL[0]], date: MON, blocks: [{ start_time: '09:00', end_time: '10:00' }], repeat: { freq: 'daily', until: '2025-01-01' } }), /before the start date/);
  });
});

describe('ratios: many workers on a participant, many participants per worker', () => {
  test('two workers on one participant (2:1 support)', async () => {
    const r = await create({ client_ids: [CL[0]], worker_ids: [CG.w2, CG.w3], date: '2027-03-09', support_family: 'community',
      blocks: [{ start_time: '09:00', end_time: '11:00' }] });
    const w = await q('select caregiver_id, role from public.shift_workers where shift_id = $1 order by role', [r.shift_ids[0]]);
    assert.equal(w.length, 2);
    assert.deepEqual(w.map((x) => x.role).sort(), ['primary', 'support']);
    assert.equal((await one('select required_workers from public.shifts where id = $1', [r.shift_ids[0]])).required_workers, 2);
  });

  test('1:4 SIL home — one worker, four participants, each participant billed', async () => {
    const r = await create({ client_ids: CL, worker_ids: [CG.w1], ratio: '1:4', date: '2027-03-10', support_family: 'community',
      blocks: [{ start_time: '09:00', end_time: '11:00' }] });
    assert.equal((await one('select count(*)::int n from public.shift_clients where shift_id = $1', [r.shift_ids[0]])).n, 4);
    assert.equal((await one('select count(distinct client_id)::int n from public.shift_segments where shift_id = $1', [r.shift_ids[0]])).n, 4);
  });

  test('ratio cannot be exceeded', async () => {
    await rejects(create({ client_ids: CL.slice(0, 3), worker_ids: [CG.w1], ratio: '1:2', date: '2027-03-11', support_family: 'community',
      blocks: [{ start_time: '09:00', end_time: '10:00' }] }), /ratio_exceeded/);
    // ...but two workers legitimately cover three participants at 1:2
    const ok = await create({ client_ids: CL.slice(0, 3), worker_ids: [CG.w1, CG.w2], ratio: '1:2', date: '2027-03-11', support_family: 'community',
      blocks: [{ start_time: '09:00', end_time: '10:00' }] });
    assert.equal(ok.shift_ids.length, 1);
  });

  test('1:2 shifts are priced on the group item', async () => {
    const r = await create({ client_ids: CL.slice(0, 2), worker_ids: [CG.w3], ratio: '1:2', date: '2027-03-12', support_family: 'community',
      blocks: [{ start_time: '09:00', end_time: '11:00' }] });
    const segs = await q('select item_number, bill_amount from public.shift_segments where shift_id = $1', [r.shift_ids[0]]);
    assert.deepEqual(segs.map((s) => s.item_number), ['WD12', 'WD12']);
    assert.equal(Number(segs[0].bill_amount), 70);
  });

  test('add a second worker / extra participant to a recurring series', async () => {
    const r = await create({ client_ids: [CL[2]], worker_ids: [CG.w1], ratio: '1:2', date: '2027-04-05', support_family: 'community',
      blocks: [{ start_time: '15:00', end_time: '16:00' }], repeat: { freq: 'daily', count: 3 } });
    const a = await rpc(U.office, 'add_shift_worker', [r.shift_ids[0], CG.w2, 'all']);
    assert.equal(a.added, 3);
    const c = await rpc(U.office, 'add_shift_client', [r.shift_ids[0], CL[0], 'following']);
    assert.equal(c.added, 3);
    const c2 = await rpc(U.office, 'add_shift_client', [r.shift_ids[1], CL[1], 'this']); // 3 clients, 2 workers @1:2 -> ok
    assert.equal(c2.added, 1);
    // 1:1 with one worker is full as soon as a second participant is added
    const solo = await create({ client_ids: [CL[2]], worker_ids: [CG.w3], date: '2027-04-12', support_family: 'community', blocks: [{ start_time: '15:00', end_time: '16:00' }] });
    await rejects(rpc(U.office, 'add_shift_client', [solo.shift_ids[0], CL[0], 'this']), /ratio_exceeded/);
  });
});

describe('pricing: time bands, public holidays, region', () => {
  test('a shift crossing 20:00 is split into day and evening segments', async () => {
    const r = await create({ client_ids: [CL[0]], worker_ids: [], date: '2027-03-02', support_family: 'community', blocks: [{ start_time: '18:00', end_time: '22:00' }] });
    const segs = await q('select item_number, units, bill_amount from public.shift_segments where shift_id = $1 order by seg_start', [r.shift_ids[0]]);
    assert.deepEqual(segs.map((s) => [s.item_number, Number(s.units), Number(s.bill_amount)]), [['WD11', 2, 120], ['WE11', 2, 132]]);
  });
  test('public holiday, saturday and sunday use their own rates', async () => {
    const ph = await create({ client_ids: [CL[0]], worker_ids: [], date: '2027-03-03', support_family: 'community', blocks: [{ start_time: '10:00', end_time: '12:00' }] });
    const sa = await create({ client_ids: [CL[0]], worker_ids: [], date: '2027-03-06', support_family: 'community', blocks: [{ start_time: '10:00', end_time: '12:00' }] });
    const su = await create({ client_ids: [CL[0]], worker_ids: [], date: '2027-03-07', support_family: 'community', blocks: [{ start_time: '10:00', end_time: '12:00' }] });
    const f = async (r) => (await one('select item_number from public.shift_segments where shift_id = $1', [r.shift_ids[0]])).item_number;
    assert.deepEqual([await f(ph), await f(sa), await f(su)], ['PH11', 'SA11', 'SU11']);
  });
  test('a shift with no family or cost code is flagged, not silently free', async () => {
    const r = await create({ client_ids: [CL[0]], worker_ids: [], date: '2027-03-02', blocks: [{ start_time: '13:00', end_time: '14:00' }] });
    const s = await one('select pricing_warning from public.shifts where id = $1', [r.shift_ids[0]]);
    assert.match(s.pricing_warning, /choose a support family or a cost code/);
  });
});

describe('splitting', () => {
  test('split one shift; second half takes a different cost code and keeps staffing', async () => {
    const r = await create({ client_ids: [CL[0]], worker_ids: [CG.w3], date: '2027-05-03', blocks: [{ start_time: '06:00', end_time: '14:00', item_number: 'WD11' }] });
    const second = await rpc(U.office, 'split_shift', [r.shift_ids[0], '2027-05-03T00:00:00Z', 'WE11']); // 10:00 AEST
    const rows = await q(`select ${local('start_time', 'HH24:MI')} st, ${local('end_time', 'HH24:MI')} en, item_number,
         (select string_agg(units::text || '@' || item_number, ',') from public.shift_segments x where x.shift_id = s.id) segs,
         (select count(*)::int from public.shift_workers w where w.shift_id = s.id) workers
       from public.shifts s where id in ($1, $2) order by start_time`, [r.shift_ids[0], second]);
    assert.deepEqual(rows.map((x) => [x.st, x.en, x.item_number, x.workers]), [['06:00', '10:00', 'WD11', 1], ['10:00', '14:00', 'WE11', 1]]);
    assert.equal(rows[0].segs, '4.00@WD11');
    assert.equal(rows[1].segs, '4.00@WE11');
    assert.equal((await one('select split_from from public.shifts where id = $1', [second])).split_from, r.shift_ids[0]);
  });

  test('split cannot happen outside the shift or once started', async () => {
    const r = await create({ client_ids: [CL[0]], worker_ids: [CG.w3], date: '2027-05-04', blocks: [{ start_time: '06:00', end_time: '14:00', item_number: 'WD11' }] });
    await rejects(rpc(U.office, 'split_shift', [r.shift_ids[0], '2027-05-03T00:00:00Z']), /inside the shift/); // 10:00 AEST on the 3rd
    await db.query(`update public.shift_workers set clock_in_time = now() where shift_id = $1`, [r.shift_ids[0]]);
    await rejects(rpc(U.office, 'split_shift', [r.shift_ids[0], '2027-05-03T23:00:00Z']), /not_splittable/);
  });

  test('split a recurring series at 12:00 — this / following / all', async () => {
    const mk = () => create({ client_ids: [CL[1]], worker_ids: [CG.w2], date: '2027-06-07', blocks: [{ start_time: '08:00', end_time: '16:00', item_number: 'WD11' }],
      repeat: { freq: 'daily', count: 5 } });
    const a = await mk();
    const r = await rpc(U.office, 'split_series', [a.shift_ids[2], '12:00', 'following', 'WE11']);
    assert.equal(r.new_shift_ids.length, 3); // days 3,4,5
    const b = await mk().catch(() => null); // same worker/time would clash; only the first series is used below
    assert.equal(b, null);
    const left = await q(`select ${local('start_time', 'DD HH24:MI')} st, ${local('end_time', 'HH24:MI')} en, item_number from public.shifts where series_id = $1 order by start_time`, [a.series_ids[0]]);
    assert.deepEqual(left.map((x) => [x.st, x.en]), [['07 08:00', '16:00'], ['08 08:00', '16:00'], ['09 08:00', '12:00'], ['10 08:00', '12:00'], ['11 08:00', '12:00']]);
    const news = await q('select distinct series_id, item_number from public.shifts where id = any($1)', [r.new_shift_ids]);
    assert.equal(news.length, 1);                      // second halves share one new series
    assert.notEqual(news[0].series_id, a.series_ids[0]);
    assert.equal(news[0].item_number, 'WE11');
    // now split ALL of the original series at 10:00: earlier full-length days split, the already-short ones can't hold 10:00?
    const all = await rpc(U.office, 'split_series', [a.shift_ids[0], '10:00', 'all']);
    assert.equal(all.new_shift_ids.length, 5);
    // 'this' only touches one
    const t = await rpc(U.office, 'split_series', [r.new_shift_ids[0], '14:00', 'this']);
    assert.equal(t.new_shift_ids.length, 1);
  });

  test('series split skips shifts that already started and says why', async () => {
    const a = await create({ client_ids: [CL[0]], worker_ids: [CG.w1], date: '2027-07-05', blocks: [{ start_time: '08:00', end_time: '16:00', item_number: 'WD11' }], repeat: { freq: 'daily', count: 3 } });
    await db.query(`update public.shift_workers set clock_in_time = now() where shift_id = $1`, [a.shift_ids[0]]);
    const r = await rpc(U.office, 'split_series', [a.shift_ids[0], '12:00', 'all']);
    assert.equal(r.new_shift_ids.length, 2);
    assert.equal(r.skipped.length, 1);
    assert.equal(r.skipped[0].reason, 'not_splittable');
  });
});

describe('starting and ending a shift', () => {
  let sid;
  test('inside the geofence: starts and records distance', async () => {
    sid = (await one(`insert into public.shifts (client_id, caregiver_id, start_time, end_time, support_family)
      values ('${CL[0]}','${CG.w1}', now() - interval '30 minutes', now() + interval '3 hours','community') returning id`)).id;
    const r = await rpc(U.w1, 'start_shift', [sid, SYD.lat + 0.0003, SYD.lng, 8]); // ~33 m away
    assert.ok(r.distance_m < 60);
    const s = await one('select status, clock_in_time from public.shifts where id = $1', [sid]);
    assert.equal(s.status, 'In Progress');
    assert.ok(s.clock_in_time);
    await rejects(rpc(U.w1, 'start_shift', [sid, SYD.lat, SYD.lng]), /already_started/);
  });

  test('outside the geofence is refused with the distance', async () => {
    const s = (await one(`insert into public.shifts (client_id, caregiver_id, start_time, end_time, support_family)
      values ('${CL[0]}','${CG.w2}', now() - interval '10 minutes', now() + interval '2 hours','community') returning id`)).id;
    await rejects(rpc(U.w2, 'start_shift', [s, SYD.lat + 0.01, SYD.lng]), /outside_geofence: you are \d+ m from Cara Client/);
    await rejects(rpc(U.w2, 'start_shift', [s, null, null]), /location_required/);
    assert.equal((await one('select status from public.shifts where id = $1', [s])).status, 'Late'); // still not started
  });

  test('geofence is optional per shift and by organisation default', async () => {
    const s = (await one(`insert into public.shifts (client_id, caregiver_id, start_time, end_time, support_family, geofence_required)
      values ('${CL[1]}','${CG.w2}', now() - interval '10 minutes', now() + interval '2 hours','community', false) returning id`)).id;
    const r = await rpc(U.w2, 'start_shift', [s, null, null]);
    assert.equal(r.geofence_checked, false);
    await rpc(U.w2, 'end_shift', [s]).catch(() => {});
    // organisation-wide off
    await as(db, U.admin, () => db.query('update public.organisation set default_geofence_required = false'));
    const s2 = (await one(`insert into public.shifts (client_id, caregiver_id, start_time, end_time, support_family)
      values ('${CL[1]}','${CG.w3}', now() - interval '10 minutes', now() + interval '2 hours','community') returning id`)).id;
    await rpc(U.w3, 'start_shift', [s2, null, null]);
    await as(db, U.admin, () => db.query('update public.organisation set default_geofence_required = true'));
  });

  test('participant without coordinates: clear error rather than a free pass', async () => {
    const s = (await one(`insert into public.shifts (client_id, caregiver_id, start_time, end_time, support_family)
      values ('${CL[3]}','${CG.w3}', now() - interval '10 minutes', now() + interval '2 hours','community') returning id`)).id;
    await rejects(rpc(U.w3, 'start_shift', [s, SYD.lat, SYD.lng]), /no_client_location/);
  });

  test('site coordinates take priority for group shifts', async () => {
    const s = (await one(`insert into public.shifts (client_id, caregiver_id, site_id, start_time, end_time, support_family)
      values ('${CL[3]}','${CG.w3}','30000000-0000-0000-0000-000000000001', now() - interval '10 minutes', now() + interval '2 hours','community') returning id`)).id;
    const r = await rpc(U.w3, 'start_shift', [s, SYD.lat, SYD.lng]);
    assert.equal(r.distance_m, 0);
  });

  test('too early / not assigned / too late', async () => {
    const early = (await one(`insert into public.shifts (client_id, caregiver_id, start_time, end_time, support_family)
      values ('${CL[0]}','${CG.w2}', now() + interval '3 hours', now() + interval '5 hours','community') returning id`)).id;
    await rejects(rpc(U.w2, 'start_shift', [early, SYD.lat, SYD.lng]), /too_early/);
    await rejects(rpc(U.w1, 'start_shift', [early, SYD.lat, SYD.lng]), /not_assigned/);
    await rejects(rpc(U.nobody, 'start_shift', [early, SYD.lat, SYD.lng]), /no support worker profile/);
    const past = (await one(`insert into public.shifts (client_id, caregiver_id, start_time, end_time, support_family)
      values ('${CL[0]}','${CG.w2}', now() - interval '5 hours', now() - interval '3 hours','community') returning id`)).id;
    await rejects(rpc(U.w2, 'start_shift', [past, SYD.lat, SYD.lng]), /too_late/);
  });

  test('ending requires a shift note for every participant, then records hours', async () => {
    const s = (await one(`insert into public.shifts (client_id, caregiver_id, start_time, end_time, support_family, ratio)
      values ('${CL[0]}','${CG.w3}', now() - interval '3 hours', now() + interval '1 hour','community','1:2') returning id`)).id;
    await db.query(`insert into public.shift_clients (shift_id, client_id) values ($1,'${CL[1]}')`, [s]);
    await rpc(U.w3, 'start_shift', [s, SYD.lat, SYD.lng]);
    await db.query(`update public.shift_workers set clock_in_time = now() - interval '2 hours' where shift_id = $1`, [s]);
    await rejects(rpc(U.w3, 'end_shift', [s, SYD.lat, SYD.lng, 0]), /notes_required: write a shift note for .*Cara Client.*Dev Client|notes_required.*Dev Client.*Cara/);
    // a worker can only note participants on their own shift
    await as(db, U.w3, () => db.query(`insert into public.shift_notes (shift_id, client_id, caregiver_id, note) values ($1,'${CL[0]}','${CG.w3}','Cara had a good morning')`, [s]));
    await rejects(as(db, U.w3, () => db.query(`insert into public.shift_notes (shift_id, client_id, caregiver_id, note) values ($1,'${CL[2]}','${CG.w3}','not on this shift')`, [s])), /row-level security/);
    await rejects(as(db, U.w1, () => db.query(`insert into public.shift_notes (shift_id, client_id, caregiver_id, note) values ($1,'${CL[0]}','${CG.w1}','not my shift')`, [s])), /row-level security/);
    await rejects(rpc(U.w3, 'end_shift', [s, SYD.lat, SYD.lng, 0]), /notes_required.*Dev Client/);
    await as(db, U.w3, () => db.query(`insert into public.shift_notes (shift_id, client_id, caregiver_id, note, category, follow_up) values ($1,'${CL[1]}','${CG.w3}','Dev joined the walk','activity', true)`, [s]));
    const r = await rpc(U.w3, 'end_shift', [s, SYD.lat, SYD.lng, 30]);
    assert.equal(Number(r.hours_worked), 1.5); // 2h - 30m break
    const row = await one('select status, hours_worked from public.shifts where id = $1', [s]);
    assert.equal(row.status, 'Completed');
    assert.equal(Number(row.hours_worked), 1.5);
    await rejects(rpc(U.w3, 'end_shift', [s]), /already_ended/);
  });

  test('two workers: shift completes only when both have ended', async () => {
    const r = await create({ client_ids: [CL[0]], worker_ids: [CG.w1, CG.w2], date: '2027-08-02', support_family: 'community', blocks: [{ start_time: '09:00', end_time: '12:00' }] });
    const s = r.shift_ids[0];
    await db.query(`update public.shifts set start_time = now() - interval '1 hour', end_time = now() + interval '2 hours' where id = $1`, [s]);
    await db.query(`update public.shift_workers set clock_in_time = now() - interval '1 hour' where shift_id = $1`, [s]);
    await db.query(`update public.organisation set require_note_on_end = false`);
    await rpc(U.w1, 'end_shift', [s]);
    assert.equal((await one('select status from public.shifts where id = $1', [s])).status, 'In Progress');
    await rpc(U.w2, 'end_shift', [s]);
    assert.equal((await one('select status from public.shifts where id = $1', [s])).status, 'Completed');
    await db.query(`update public.organisation set require_note_on_end = true`);
  });

  test('a worker cannot edit shifts directly', async () => {
    await as(db, U.w1, () => db.query(`update public.shifts set notes='hacked'`));
    assert.equal((await one(`select count(*)::int n from public.shifts where notes = 'hacked'`)).n, 0);
  });

  test('workers only see shifts and participants they are on', async () => {
    await as(db, U.w3, async () => {
      const shifts = (await db.query('select caregiver_id from public.shifts')).rows;
      assert.ok(shifts.length > 0);
            const mine = (await db.query(`select count(*)::int n from public.shift_workers where caregiver_id <> '${CG.w3}'`)).rows[0].n;
      assert.equal(mine, 0);
    });
    await as(db, U.nobody, async () => {
      assert.equal((await db.query('select * from public.shifts')).rows.length, 0);
      assert.equal((await db.query('select * from public.clients')).rows.length, 0);
    });
  });
});

describe('open shifts', () => {
  test('office publishes, a worker accepts, a second worker cannot', async () => {
    const r = await create({ client_ids: [CL[1]], worker_ids: [], date: '2027-09-06', support_family: 'community', blocks: [{ start_time: '09:00', end_time: '11:00' }] });
    await rpc(U.office, 'publish_shift', [r.shift_ids[0]]);
    await as(db, U.w2, async () => assert.equal((await db.query('select id from public.shifts where id = $1', [r.shift_ids[0]])).rows.length, 1));
    await rpc(U.w2, 'accept_offered_shift', [r.shift_ids[0]]);
    await rejects(rpc(U.w3, 'accept_offered_shift', [r.shift_ids[0]]), /no longer available/);
    assert.equal((await one('select caregiver_id from public.shifts where id = $1', [r.shift_ids[0]])).caregiver_id, CG.w2);
    assert.equal((await one(`select count(*)::int n from public.notifications where user_id = '${U.w2}' and type='shift'`)).n > 0, true);
  });
});

describe('approval, timesheets, invoices, Xero', () => {
  let done = []; // approved-able shifts

  test('approve needs completion; computes pay by band; locks the shift', async () => {
    // Monday 2027-10-04: 18:00-22:00 => 2h day @40 + 2h evening @44 = 168 pay; billed 120 + 132 = 252
    const r = await create({ client_ids: [CL[0]], worker_ids: [CG.w1], date: '2027-10-04', support_family: 'community', blocks: [{ start_time: '18:00', end_time: '22:00' }] });
    const s = r.shift_ids[0];
    await rejects(rpc(U.office, 'approve_shift', [s]), /not_complete/);
    await rejects(rpc(U.w1, 'approve_shift', [s]), /forbidden/);
    await db.query(`update public.shift_workers set clock_in_time = '2027-10-04 18:00+11', clock_out_time = '2027-10-04 22:00+11' where shift_id = $1`, [s]);
    await rpc(U.office, 'approve_shift', [s]);
    const w = await one('select approved_hours, pay_amount from public.shift_workers where shift_id = $1', [s]);
    assert.deepEqual([Number(w.approved_hours), Number(w.pay_amount)], [4, 168]);
    const sh = await one('select approval_status, approved_by from public.shifts where id = $1', [s]);
    assert.equal(sh.approval_status, 'approved');
    await rejects(db.query(`update public.shifts set end_time = end_time + interval '1 hour' where id = $1`, [s]), /shift_locked/);
    await rejects(rpc(U.office, 'split_shift', [s, '2027-10-04T08:00:00Z']), /not_splittable/);
    // workers can no longer touch notes on an approved shift
    await rpc(U.office, 'unapprove_shift', [s]);
    await rpc(U.office, 'approve_shift', [s]);
    done.push(s);
  });

  test('sleepover pays the flat each-rate', async () => {
    const r = await create({ client_ids: [CL[1]], worker_ids: [CG.w2], date: '2027-10-05', support_family: 'sil', is_sleepover: true, blocks: [{ start_time: '22:00', end_time: '06:00' }] });
    await rpc(U.office, 'approve_shift', [r.shift_ids[0], true]); // use scheduled times
    assert.equal(Number((await one('select pay_amount from public.shift_workers where shift_id = $1', [r.shift_ids[0]])).pay_amount), 150);
    done.push(r.shift_ids[0]);
  });

  test('bulk approve reports failures instead of aborting', async () => {
    const r = await create({ client_ids: [CL[2]], worker_ids: [CG.w3], date: '2027-10-06', support_family: 'community', blocks: [{ start_time: '09:00', end_time: '10:00' }] });
    const res = await rpc(U.office, 'approve_shifts', [[done[0], r.shift_ids[0]]]);
    assert.equal(res.approved, 1);
    assert.equal(res.failed.length, 1);
    assert.match(res.failed[0].error, /not_complete/);
  });

  test('rejecting a shift notifies the worker', async () => {
    const r = await create({ client_ids: [CL[2]], worker_ids: [CG.w3], date: '2027-10-07', support_family: 'community', blocks: [{ start_time: '09:00', end_time: '10:00' }] });
    await rejects(rpc(U.office, 'reject_shift', [r.shift_ids[0], '']), /give a reason/);
    await rpc(U.office, 'reject_shift', [r.shift_ids[0], 'Please add your break']);
    const n = await one(`select message from public.notifications where user_id = '${U.w3}' and type = 'approval'`);
    assert.equal(n.message, 'Please add your break');
  });

  test('timesheet: pending shifts block approval, then totals add up', async () => {
    await db.query('select public.ensure_pay_periods($1::date, $2::date)', ['2027-09-27', '2027-10-31']);
    const pp = await one(`select id, period_start::text from public.pay_periods where date '2027-10-04' between period_start and period_end`);
    await rpc(U.office, 'ensure_timesheets', [pp.id]);
    const ts = await one('select id from public.timesheets where pay_period_id = $1 and caregiver_id = $2', [pp.id, CG.w1]);
    // a completed-but-unapproved shift in the period blocks the timesheet
    const r = await create({ client_ids: [CL[0]], worker_ids: [CG.w1], date: '2027-10-08', support_family: 'community', blocks: [{ start_time: '09:00', end_time: '11:00' }] });
    await db.query(`update public.shift_workers set clock_in_time='2027-10-08 09:00+11', clock_out_time='2027-10-08 11:00+11' where shift_id=$1`, [r.shift_ids[0]]);
    await rpc(U.w1, 'submit_timesheet', [ts.id]);
    await rejects(rpc(U.office, 'approve_timesheet', [ts.id]), /pending_shifts/);
    await rpc(U.office, 'approve_timesheet', [ts.id, true]); // approves the pending shift too
    const t = await one('select * from public.timesheet_totals where timesheet_id = $1', [ts.id]);
    assert.equal(t.status, 'approved');
    assert.equal(Number(t.gross_pay_segments), 168 + 80); // 4h evening shift + 2h weekday = 168 + 2*40
    assert.equal(t.pending_shifts, 0);
    // approved timesheet locks its shifts against un-approval
    await rejects(rpc(U.office, 'unapprove_shift', [done[0]]), /timesheet_locked/);
    await rpc(U.office, 'reopen_timesheet', [ts.id]);
    // workers see their own timesheet only
    await as(db, U.w2, async () => assert.equal((await db.query('select * from public.timesheets where caregiver_id = $1', [CG.w1])).rows.length, 0));
  });

  test('invoices: generated per participant from approved shifts only, once', async () => {
    const ids = await rpc(U.office, 'generate_invoices', ['2027-10-01', '2027-10-31']);
    const inv = await q('select i.*, c.first_name from public.invoices i join public.clients c on c.id = i.client_id order by c.first_name');
    assert.equal(ids.length, inv.length);
    const cara = inv.find((i) => i.first_name === 'Cara');
    // Cara: 18:00-22:00 shift (120+132) + 09:00-11:00 shift (120)
    assert.equal(Number(cara.subtotal), 372);
    assert.equal(Number(cara.gst_amount), 0);
    assert.match(cara.number, /^INV-\d{5}$/);
    const dev = inv.find((i) => i.first_name === 'Dev');
    assert.equal(Number(dev.subtotal), 300); // the sleepover
    // unapproved shift (Eli's) is not invoiced
    assert.equal(inv.find((i) => i.first_name === 'Eli'), undefined);
    // idempotent
    assert.deepEqual(await rpc(U.office, 'generate_invoices', ['2027-10-01', '2027-10-31']), []);
    // invoiced shifts cannot be un-approved or repriced
    await rejects(rpc(U.office, 'unapprove_shift', [done[0]]), /shift_invoiced/);
    await rejects(db.query(`update public.shifts set support_family = 'sil' where id = $1`, [done[0]]), /shift_locked|shift_invoiced/);
  });

  test('invoice workflow, GST, Xero export view, void', async () => {
    await as(db, U.admin, () => db.query(`update public.organisation set gst_rate = 0.10`));
    const cara = await one(`select id from public.invoices where client_id = '${CL[0]}'`);
    await rpc(U.office, 'set_invoice_status', [cara.id, 'approved']);
    const draftOne = await one(`select id from public.invoices where client_id = '${CL[1]}'`);
    await rejects(rpc(U.office, 'set_invoice_status', [draftOne.id, 'paid']), /cannot move an invoice from draft to paid/);
    const rows = await as(db, U.office, async () => (await db.query('select * from public.xero_invoice_export')).rows);
    assert.ok(rows.length >= 2);
    assert.equal(rows[0].contact_name, 'Cara Client');
    assert.equal(rows[0].account_code, '200');
    assert.equal(rows[0].tax_type, 'GST Free Income');
    assert.equal(await rpc(U.office, 'mark_invoices_exported', [[cara.id], 'XERO-123']), 1);
    // draft invoices are not exported
    const dev = await one(`select id, status from public.invoices where client_id = '${CL[1]}'`);
    assert.equal(dev.status, 'draft');
    assert.equal(rows.filter((r) => r.invoice_id === dev.id).length, 0);
    // void frees segments for re-invoicing
    await rejects(rpc(U.office, 'void_invoice', [dev.id, '']), /reason/);
    await rpc(U.office, 'void_invoice', [dev.id, 'Wrong participant']);
    assert.equal((await one(`select count(*)::int n from public.shift_segments where client_id = '${CL[1]}' and invoice_line_id is not null`)).n, 0);
    const again = await rpc(U.office, 'generate_invoices', ['2027-10-01', '2027-10-31', [CL[1]]]);
    assert.equal(again.length, 1);
    await as(db, U.admin, () => db.query(`update public.organisation set gst_rate = 0`));
  });

  test('only office can see invoices', async () => {
    await as(db, U.w1, async () => assert.equal((await db.query('select * from public.invoices')).rows.length, 0));
    await rejects(rpc(U.w1, 'generate_invoices', ['2027-10-01', '2027-10-31']), /forbidden/);
  });
});

describe('chat', () => {
  test('DMs are private and idempotent', async () => {
    const a = await rpc(U.w1, 'get_or_create_dm', [U.w2]);
    const b = await rpc(U.w2, 'get_or_create_dm', [U.w1]);
    assert.equal(a, b);
    await as(db, U.w1, () => db.query(`insert into public.chat_messages (channel_id, sender_id, body) values ($1, '${U.w1}', 'hi Walt')`, [a]));
    await as(db, U.w2, async () => assert.equal((await db.query('select body from public.chat_messages where channel_id = $1', [a])).rows[0].body, 'hi Walt'));
    await as(db, U.w3, async () => assert.equal((await db.query('select * from public.chat_messages where channel_id = $1', [a])).rows.length, 0));
    await rejects(as(db, U.w3, () => db.query(`insert into public.chat_messages (channel_id, sender_id, body) values ($1, '${U.w3}', 'sneaky')`, [a])), /row-level security/);
    await rejects(as(db, U.w1, () => db.query(`insert into public.chat_messages (channel_id, sender_id, body) values ($1, '${U.w2}', 'spoofed')`, [a])), /row-level security/);
  });

  test('office creates channels; staff join public ones; private ones need an invite', async () => {
    await rejects(rpc(U.w1, 'create_channel', ['general']), /only office staff/);
    const gen = await rpc(U.office, 'create_channel', ['General', 'channel', [], false, 'Everyone']);
    const priv = await rpc(U.office, 'create_channel', ['Managers', 'channel', [U.admin], true]);
    await rejects(rpc(U.office, 'create_channel', ['general']), /already exists/);
    await rpc(U.w1, 'join_channel', [gen]);
    await rejects(rpc(U.w1, 'join_channel', [priv]), /invite only/);
    await as(db, U.w1, async () => {
      const names = (await db.query('select name from public.chat_channels order by name')).rows.map((r) => r.name);
      assert.ok(names.includes('General') && !names.includes('Managers'));
    });
    await as(db, U.w1, () => db.query(`insert into public.chat_messages (channel_id, sender_id, body) values ($1, '${U.w1}', 'hello team')`, [gen]));
    await as(db, U.office, () => db.query(`select public.join_channel($1)`, [gen]));
    const ov = await as(db, U.office, async () => (await db.query('select name, unread from public.chat_overview where channel_id = $1', [gen])).rows[0]);
    assert.equal(Number(ov.unread), 1);
    await rpc(U.office, 'mark_channel_read', [gen]);
  });

  test('any worker can start a private group chat', async () => {
    const g = await rpc(U.w1, 'create_channel', ['Morning crew', 'group', [U.w2, U.w3]]);
    await as(db, U.w3, async () => assert.equal((await db.query('select count(*)::int n from public.chat_members where channel_id = $1', [g])).rows[0].n, 3));
    await as(db, U.nobody, async () => assert.equal((await db.query('select * from public.chat_channels where id = $1', [g])).rows.length, 0));
  });
});

describe('onboarding and terms', () => {
  test('new staff must accept the terms before they are cleared; office reviews uploads', async () => {
    const n = await rpc(U.office, 'start_onboarding', [U.w1, null]);
    assert.equal(n, 8);
    assert.equal(await rpc(U.office, 'start_onboarding', [U.w1, null]), 0); // idempotent
    const before = await rpc(U.w1, 'my_onboarding');
    assert.equal(before.complete, false);
    assert.equal(before.needs_terms, true);

    const docs = await as(db, U.w1, async () => (await db.query('select * from public.pending_legal_documents()')).rows);
    assert.deepEqual(docs.map((d) => d.kind).sort(), ['code_of_conduct', 'privacy', 'terms']);
    assert.ok(docs.every((d) => d.audience !== 'client' && d.audience !== 'office'));
    await rejects(rpc(U.w1, 'accept_document', [docs[0].id, 'x']), /type your full name/);
    for (const d of docs) await rpc(U.w1, 'accept_document', [d.id, 'Wendy One']);
    const mid = await rpc(U.w1, 'my_onboarding');
    assert.equal(mid.needs_terms, false);
    assert.equal(mid.complete, false); // uploads still outstanding

    // upload steps need a file, then office approval
    const tasks = await as(db, U.w1, async () => (await db.query(`select id, step_key, status from public.onboarding_tasks where profile_id = '${U.w1}'`)).rows);
    assert.equal(tasks.filter((t) => t.status === 'approved').length, 3);
    for (const t of tasks.filter((t) => t.status === 'todo' && ['id', 'screening'].includes(t.step_key))) {
      await rejects(rpc(U.w1, 'submit_onboarding_task', [t.id, {}, null]), /attach a file/);
      await rpc(U.w1, 'submit_onboarding_task', [t.id, {}, `${U.w1}/${t.step_key}.pdf`]);
    }
    for (const t of tasks.filter((t) => t.step_key === 'emergency')) await rpc(U.w1, 'submit_onboarding_task', [t.id, { name: 'Sam', phone: '0400' }, null]);
    for (const t of tasks.filter((t) => t.step_key === 'induction')) await rpc(U.office, 'submit_onboarding_task', [t.id, {}, null]); // office marks it done
    const submitted = await q(`select id, step_key from public.onboarding_tasks where profile_id = '${U.w1}' and status = 'submitted'`);
    assert.equal(submitted.length, 3);
    await rejects(rpc(U.office, 'review_onboarding_task', [submitted[0].id, false, '']), /say what needs fixing/);
    await rpc(U.office, 'review_onboarding_task', [submitted[0].id, false, 'Photo is blurry']);
    for (const t of submitted.slice(1)) await rpc(U.office, 'review_onboarding_task', [t.id, true, null]);
    assert.equal((await rpc(U.w1, 'my_onboarding')).complete, false); // one rejected
    await rpc(U.w1, 'submit_onboarding_task', [submitted[0].id, {}, `${U.w1}/retry.pdf`]);
    await rpc(U.office, 'review_onboarding_task', [submitted[0].id, true, null]);
    assert.equal((await rpc(U.w1, 'my_onboarding')).complete, true); // optional first-aid step is not required
    // another worker cannot touch w1's task
    await rejects(rpc(U.w2, 'submit_onboarding_task', [submitted[1].id, {}, 'x']), /not your task|already approved/);
  });

  test('participants are onboarded by the office, signing on their behalf', async () => {
    assert.equal(await rpc(U.office, 'start_onboarding', [null, CL[0]]), 6);
    const sa = await one(`select id from public.legal_documents where kind = 'service_agreement'`);
    await rejects(rpc(U.w1, 'accept_document', [sa.id, 'Cara Client', CL[0]]), /forbidden/);
    await rpc(U.office, 'accept_document', [sa.id, 'Cara Client', CL[0]]);
    assert.equal((await one(`select status from public.onboarding_tasks where client_id = '${CL[0]}' and step_key = 'service_agreement'`)).status, 'approved');
    assert.equal((await one(`select count(*)::int n from public.legal_acceptances where client_id = '${CL[0]}'`)).n, 1);
  });

  test('publishing a new terms version asks everyone to accept again', async () => {
    const t = await one(`select id from public.legal_documents where kind = 'terms' and audience = 'staff'`);
    await as(db, U.admin, () => db.query(`insert into public.legal_documents (kind, title, audience, version, body) values ('terms','Staff Terms of Use','staff',2,'v2 text')`));
    const pend = await as(db, U.w1, async () => (await db.query('select version from public.pending_legal_documents()')).rows);
    assert.deepEqual(pend.map((p) => p.version), [2]);
    assert.equal((await rpc(U.w1, 'my_onboarding')).needs_terms, true);
    await as(db, U.office, async () => assert.equal((await db.query(`select count(*)::int n from public.legal_documents`)).rows[0].n > 0, true));
    assert.ok(t.id);
  });
});

describe('participant privacy', () => {
  test('a worker with no shifts for a participant cannot see them', async () => {
    await as(db, U.nobody, async () => assert.equal((await db.query('select * from public.clients')).rows.length, 0));
    await as(db, U.w3, async () => {
      const seen = (await db.query('select first_name from public.clients')).rows.map((r) => r.first_name);
      assert.ok(seen.includes('Eli')); // w3 has had shifts with Eli
    });
  });
});

describe('mobile app read/write paths (support worker under RLS)', () => {
  test('every view and RPC the mobile app calls works for a worker and is scoped to them', async () => {
    await as(db, U.w2, async () => {
      const q1 = async (sql) => (await db.query(sql)).rows;
      assert.equal((await q1('select * from public.organisation_public')).length, 1);
      assert.ok((await q1('select * from public.staff_directory')).length >= 5);
      assert.ok((await q1('select name from public.shift_team')).every((r) => r.name));
      const team = await q1('select distinct shift_id from public.shift_team');
      const mine = await q1(`select distinct shift_id from public.shift_workers where caregiver_id = '${CG.w2}'`);
      assert.deepEqual(team.map((r) => r.shift_id).sort(), mine.map((r) => r.shift_id).sort()); // only shifts I am on
      await q1('select * from public.chat_overview');
      await q1('select * from public.timesheet_totals');
      assert.equal((await q1(`select count(*)::int n from public.timesheet_totals t where t.caregiver_id <> '${CG.w2}'`))[0].n, 0);
      await q1('select * from public.pending_legal_documents()');
      assert.equal(typeof (await q1('select public.my_onboarding() r'))[0].r.complete, 'boolean');
    });
  });

  test('a worker can file an incident on their own shift, but not on someone else\'s', async () => {
    const own = await one(`select shift_id from public.shift_workers where caregiver_id = '${CG.w2}' limit 1`);
    await as(db, U.w2, () => db.query(
      `insert into public.incidents (shift_id, client_id, caregiver_id, incident_type, severity, description, photo_urls)
       values ($1, '${CL[0]}', '${CG.w2}', 'Fall', 'Low', 'Slipped on the kitchen floor', array['${U.w2}/a.jpg'])`, [own.shift_id]));
    const other = await one(`select shift_id from public.shift_workers where caregiver_id = '${CG.w3}' and shift_id not in (select shift_id from public.shift_workers where caregiver_id = '${CG.w2}') limit 1`);
    await rejects(as(db, U.w2, () => db.query(
      `insert into public.incidents (shift_id, caregiver_id, incident_type, description) values ($1, '${CG.w2}', 'Fall', 'x')`, [other.shift_id])), /row-level security/);
    await rejects(as(db, U.w2, () => db.query(
      `insert into public.incidents (caregiver_id, incident_type, description) values ('${CG.w3}', 'Fall', 'as someone else')`)), /row-level security/);
    // office sees it on the dashboard
    const seen = await as(db, U.office, async () => (await db.query(`select count(*)::int n from public.incidents where description like 'Slipped%'`)).rows[0].n);
    assert.equal(seen, 1);
    // another worker cannot read it
    await as(db, U.w3, async () => assert.equal((await db.query(`select * from public.incidents where description like 'Slipped%'`)).rows.length, 0));
  });

  test('time off: a worker requests, office approves, the worker cannot approve themselves', async () => {
    await as(db, U.w2, () => db.query(`insert into public.time_off_requests (caregiver_id, start_date, end_date, reason) values ('${CG.w2}','2027-12-20','2027-12-24','Holiday')`));
    await rejects(as(db, U.w2, () => db.query(`insert into public.time_off_requests (caregiver_id, start_date, end_date, status) values ('${CG.w2}','2027-12-27','2027-12-28','Approved')`)), /row-level security/);
    await as(db, U.w2, () => db.query(`update public.time_off_requests set status = 'Approved'`));
    assert.equal((await one(`select count(*)::int n from public.time_off_requests where status = 'Approved'`)).n, 0);
    await as(db, U.office, () => db.query(`update public.time_off_requests set status = 'Approved'`));
    assert.equal((await one(`select count(*)::int n from public.time_off_requests where status = 'Approved'`)).n, 1);
  });

  test('workers can mark their own notifications read and nobody else\'s', async () => {
    await as(db, U.w2, () => db.query(`update public.notifications set read = true`));
    assert.equal((await one(`select count(*)::int n from public.notifications where user_id = '${U.w2}' and not read`)).n, 0);
    assert.ok((await one(`select count(*)::int n from public.notifications where user_id <> '${U.w2}' and read`)).n === 0);
  });

  test('uploads go to the worker\'s own folder only', async () => {
    await as(db, U.w2, () => db.query(`insert into storage.objects (bucket_id, name, owner) values ('onboarding', '${U.w2}/id.jpg', '${U.w2}')`));
    await rejects(as(db, U.w2, () => db.query(`insert into storage.objects (bucket_id, name) values ('onboarding', '${U.w3}/steal.jpg')`)), /row-level security/);
    await as(db, U.w3, async () => assert.equal((await db.query(`select * from storage.objects where name like '${U.w2}/%'`)).rows.length, 0));
    await as(db, U.office, async () => assert.equal((await db.query(`select * from storage.objects where name like '${U.w2}/%'`)).rows.length, 1));
    await rejects(as(db, U.w2, () => db.query(`insert into storage.objects (bucket_id, name) values ('branding', '${U.w2}/logo.png')`)), /row-level security/);
  });
});

describe('create_shifts input validation', () => {
  test('empty or unknown participant / worker ids give a clear message', async () => {
    const base = { date: '2031-02-03', support_family: 'community', blocks: [{ start_time: '09:00', end_time: '10:00' }] };
    await rejects(create({ ...base, client_ids: [CL[0]], worker_ids: [null] }), /id is empty/);
    await rejects(create({ ...base, client_ids: ['99999999-0000-0000-0000-000000000000'], worker_ids: [] }), /participants does not exist/);
    await rejects(create({ ...base, client_ids: [CL[0]], worker_ids: ['99999999-0000-0000-0000-000000000000'] }), /workers does not exist/);
  });
});
