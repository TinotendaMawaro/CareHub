// Web <-> mobile link test against a live project. Creates a worker, participant and shifts as the office,
// then acts as the worker with the exact queries the mobile app makes. Everything it creates is deleted.
//   ADMIN_EMAIL=.. ADMIN_PASSWORD=.. WEB_URL=http://localhost:9002 node supabase/tests/link-smoke.mjs
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEB = process.env.WEB_URL ?? 'http://localhost:9002';
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
let failed = 0;
const ok = (m) => console.log('  ok  ', m);
const bad = (m) => { failed++; console.log('  FAIL', m); };
const check = (cond, m) => (cond ? ok(m) : bad(m));
const tag = `smoke-${Date.now()}`;
const made = { users: [], clients: [], shifts: [], series: [] };

// The same select the mobile "My shifts" tab uses.
const SHIFT_SELECT =
  'id,start_time,end_time,status,is_sleepover,ratio,approval_status,reject_reason,shift_publish_state,notes,' +
  'sites(name),shift_workers(caregiver_id,clock_in_time,clock_out_time),shift_clients(clients(first_name,last_name,address))';

try {
  // --- office signs in (as the web app does)
  const office = createClient(URL_, KEY, opts);
  const si = await office.auth.signInWithPassword({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  check(!si.error, 'office signs in');
  const token = si.data.session.access_token;

  // --- invite a worker through the web API route
  const email = `${tag}@carehub-test.invalid`;
  const inv = await fetch(`${WEB}/api/staff/invite`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, firstName: 'Link', lastName: 'Worker', role: 'caregiver', password: 'Link-Test-9x!' }),
  });
  const invJson = await inv.json();
  check(inv.ok && invJson.caregiverId, `invite API created a worker (${inv.status})`);
  if (invJson.userId) made.users.push(invJson.userId);
  const anon = await fetch(`${WEB}/api/staff/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check(anon.status === 401, 'invite API refuses an unauthenticated caller');

  // --- office onboards the worker, makes a participant and shifts
  const st = await office.rpc('start_onboarding', { p_profile: invJson.userId, p_client: null });
  check(!st.error && st.data === 8, `onboarding checklist created (${st.data})`);
  const cl = await office.from('clients').insert({ first_name: 'Link', last_name: 'Participant', address: '1 Test St', state: 'NSW', lat: -33.8688, lng: 151.2093 }).select('id').single();
  check(!cl.error, 'office created a participant'); made.clients.push(cl.data.id);
  await admin.from('support_families').upsert({ family_key: 'link_test', label: 'Link test', default_worker_level: 'level_2' });
  await admin.from('support_items').upsert({ item_number: 'LINK-1', name: 'Link test hourly', family_key: 'link_test', time_band: 'any', unit: 'Hour', price_national: 55 });

  const start = new Date(Date.now() - 10 * 60_000);
  const end = new Date(Date.now() + 110 * 60_000);
  const live = await admin.from('shifts').insert({ client_id: cl.data.id, caregiver_id: invJson.caregiverId, start_time: start.toISOString(), end_time: end.toISOString(), support_family: 'link_test', item_number: 'LINK-1' }).select('id').single();
  check(!live.error, 'a shift is on now for the worker'); made.shifts.push(live.data.id);
  const cr = await office.rpc('create_shifts', { p: { client_ids: [cl.data.id], worker_ids: [invJson.caregiverId], date: '2032-05-03', support_family: 'link_test', blocks: [{ start_time: '08:00', end_time: '12:00', item_number: 'LINK-1' }, { start_time: '12:00', end_time: '16:00', is_sleepover: false }], repeat: { freq: 'daily', count: 2 } } });
  check(!cr.error && cr.data.shift_ids.length === 4, `office created 4 recurring shifts via the RPC${cr.error ? ': ' + cr.error.message : ''}`);
  if (cr.data) { made.shifts.push(...cr.data.shift_ids); made.series.push(...cr.data.series_ids); }

  // --- the worker, exactly as the mobile app
  const mobile = createClient(URL_, KEY, opts);
  const w = await mobile.auth.signInWithPassword({ email, password: 'Link-Test-9x!' });
  check(!w.error, 'worker signs in on the mobile client');
  const prof = await mobile.from('profiles').select('role, active').eq('id', w.data.user.id).maybeSingle();
  const me = await mobile.from('caregivers').select('id, name').eq('user_id', w.data.user.id).maybeSingle();
  check(prof.data?.role === 'caregiver' && me.data?.id === invJson.caregiverId, 'mobile resolves role and caregiver id');
  const org = await mobile.from('organisation').select('*').maybeSingle();
  check(!org.error && org.data, 'mobile reads organisation branding');
  const needs = await mobile.rpc('my_onboarding');
  check(needs.data?.needs_terms === true, 'new worker is held at the terms screen');
  const docs = await mobile.rpc('pending_legal_documents');
  check(docs.data?.length === 3, `3 documents to accept (${docs.data?.map((d) => d.kind).join(', ')})`);
  for (const d of docs.data) { const a = await mobile.rpc('accept_document', { p_doc: d.id, p_typed_name: 'Link Worker' }); if (a.error) bad('accept ' + d.kind + ': ' + a.error.message); }
  check((await mobile.rpc('my_onboarding')).data?.needs_terms === false, 'terms accepted, gate opens');

  const from = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const list = await mobile.from('shifts').select(SHIFT_SELECT).eq('deleted', false).neq('status', 'Cancelled').gte('end_time', from).lte('start_time', new Date(Date.now() + 30 * 86_400_000).toISOString()).order('start_time');
  check(!list.error && list.data.some((s) => s.id === live.data.id), `"My shifts" query works with embeds${list.error ? ': ' + list.error.message : ''}`);
  const mine = list.data?.find((s) => s.id === live.data.id);
  check(mine?.shift_clients?.[0]?.clients?.first_name === 'Link', 'worker sees the participant on their own shift');
  const detail = await mobile.from('shifts').select('id,start_time,end_time,status,is_sleepover,ratio,notes,approval_status,reject_reason,approved_at,geofence_required,sites(name,address),shift_clients(clients(id,first_name,last_name,address,allergies,care_plan,emergency_contact,phone)),shift_workers(caregiver_id,clock_in_time,clock_out_time,hours_worked)').eq('id', live.data.id).maybeSingle();
  check(!detail.error && detail.data, `shift detail query works${detail.error ? ': ' + detail.error.message : ''}`);
  const team = await mobile.from('shift_team').select('caregiver_id,name,role').eq('shift_id', live.data.id);
  check(!team.error && team.data.length === 1, 'shift_team view works');

  const far = await mobile.rpc('start_shift', { p_shift: live.data.id, p_lat: -33.7, p_lng: 151.2093, p_accuracy: 10 });
  check(/outside_geofence/.test(far.error?.message ?? ''), 'start refused away from the address: ' + (far.error?.message ?? '').slice(0, 50));
  const go = await mobile.rpc('start_shift', { p_shift: live.data.id, p_lat: -33.8688, p_lng: 151.2093, p_accuracy: 8 });
  check(!go.error, `worker started the shift${go.error ? ': ' + go.error.message : ''}`);
  const noNote = await mobile.rpc('end_shift', { p_shift: live.data.id, p_lat: -33.8688, p_lng: 151.2093, p_break_minutes: 0 });
  check(/notes_required/.test(noNote.error?.message ?? ''), 'end refused until a note is written');
  const note = await mobile.from('shift_notes').insert({ shift_id: live.data.id, client_id: cl.data.id, caregiver_id: me.data.id, note: 'Good session', category: 'activity', follow_up: true });
  check(!note.error, `note saved${note.error ? ': ' + note.error.message : ''}`);
  const inc = await mobile.from('incidents').insert({ shift_id: live.data.id, client_id: cl.data.id, caregiver_id: me.data.id, incident_type: 'Near miss', severity: 'Low', description: 'Wet floor near the sink', photo_urls: [] });
  check(!inc.error, `incident filed${inc.error ? ': ' + inc.error.message : ''}`);
  await admin.from('shift_workers').update({ clock_in_time: new Date(Date.now() - 3_600_000).toISOString() }).eq('shift_id', live.data.id);
  const done = await mobile.rpc('end_shift', { p_shift: live.data.id, p_lat: -33.8688, p_lng: 151.2093, p_break_minutes: 10 });
  check(!done.error && Number(done.data.hours_worked) === 0.83, `worker ended the shift: ${done.data?.hours_worked} h (1h less 10 min break)`);

  // --- the office sees it (web side) and approves
  const seen = await office.from('shift_notes').select('note, follow_up').eq('shift_id', live.data.id);
  check(seen.data?.length === 1 && seen.data[0].follow_up, 'office sees the worker\'s note with its follow-up flag');
  const incOffice = await office.from('incidents').select('id').eq('shift_id', live.data.id);
  check(incOffice.data?.length === 1, 'office sees the incident');
  const ap = await office.rpc('approve_shift', { p_shift: live.data.id });
  check(!ap.error, `office approved the shift${ap.error ? ': ' + ap.error.message : ''}`);
  const gen = await office.rpc('generate_invoices', { p_from: '2000-01-01', p_to: '2100-01-01', p_client_ids: [cl.data.id] });
  check(!gen.error && gen.data.length === 1, `invoice generated${gen.error ? ': ' + gen.error.message : ''}`);
  const exp = await fetch(`${WEB}/api/invoices/export?ids=${gen.data[0]}`, { headers: { Authorization: `Bearer ${token}` } });
  check(exp.status === 404, 'draft invoice is not exported (must be approved first)');
  await office.rpc('set_invoice_status', { p_id: gen.data[0], p_status: 'approved' });
  const csv = await (await fetch(`${WEB}/api/invoices/export?ids=${gen.data[0]}`, { headers: { Authorization: `Bearer ${token}` } })).text();
  check(/^\*ContactName/.test(csv) && /Link Participant/.test(csv) && /LINK-1/.test(csv), 'Xero CSV export contains the invoice line');
  const w2 = await mobile.from('timesheet_totals').select('*');
  check(!w2.error, 'mobile timesheet_totals view works for a worker');

  // --- chat across web and mobile
  const dm = await office.rpc('get_or_create_dm', { p_other: w.data.user.id });
  check(!dm.error, 'office opened a DM with the worker');
  await office.from('chat_messages').insert({ channel_id: dm.data, sender_id: si.data.user.id, body: 'Welcome aboard' });
  const inbox = await mobile.from('chat_overview').select('*');
  check(inbox.data?.some((c) => c.channel_id === dm.data && Number(c.unread) === 1), 'worker sees the DM with 1 unread');
  await office.from('chat_channels').delete().eq('id', dm.data);
} catch (e) {
  bad('unexpected: ' + (e.message ?? JSON.stringify(e)));
} finally {
  // --- clean up everything this run created
  await admin.from('invoice_lines').delete().in('shift_id', made.shifts);
  const invs = await admin.from('invoices').select('id').in('client_id', made.clients);
  if (invs.data?.length) { await admin.from('shift_segments').update({ invoice_line_id: null }).in('shift_id', made.shifts); await admin.from('invoices').delete().in('id', invs.data.map((i) => i.id)); }
  await admin.from('shifts').delete().in('client_id', made.clients);
  await admin.from('clients').delete().in('id', made.clients);
  await admin.from('support_items').delete().eq('item_number', 'LINK-1');
  await admin.from('support_families').delete().eq('family_key', 'link_test');
  for (const id of made.users) {
    await admin.from('legal_acceptances').delete().eq('profile_id', id);
    await admin.from('caregivers').delete().eq('user_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  const left = await admin.from('clients').select('id', { count: 'exact', head: true }).like('last_name', 'Participant');
  console.log(left.count === 0 ? '  ok   test data removed' : `  WARN ${left.count} test participant(s) remain`);
  console.log(failed ? `${failed} check(s) FAILED` : 'LINK TEST PASSED');
  process.exit(failed ? 1 : 0);
}
