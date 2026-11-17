# CareHub

Shift scheduling, timesheets and invoicing for disability and aged-care providers (built around NDIS price guides).

| Part | Where | Who uses it |
| --- | --- | --- |
| Web dashboard (Next.js) | `src/` | Office staff: schedule, approve, invoice, chat, onboard |
| Staff mobile app (Expo) | `mobile/` | Support workers: shifts, start/end, notes, incidents, chat |
| Database (Supabase / Postgres) | `supabase/migrations/` | Both. Business rules live here as RPCs |

## Set up a new Supabase project

1. Create a project at supabase.com. Copy the project URL, the publishable (anon) key and the service role key.
2. Apply the schema. Either `npx supabase link --project-ref <ref> && npx supabase db push`, or paste the files in
   `supabase/migrations/` into the SQL editor in order (`20261102000001` to `20261102000007`).
   The older files in `supabase/legacy_migrations/` conflict with each other and must not be applied.
3. Web: copy the keys into `.env.local`

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # server only (staff invites). Never expose it.
   ```
4. Mobile: `cd mobile && cp .env.example .env`, fill in the URL and publishable key.
5. Create the first administrator: `supabase/seed/README.md` (service role script), then sign in to the web app.
6. In **Settings** add your organisation name, logo and colours. In **Pricing and pay** add your support families,
   cost codes (price guide), pay rates and public holidays. Then **Team** > add support workers.

## Run

```bash
npm install && npm run dev            # web on http://localhost:9002
cd mobile && npm install && npx expo start   # scan the QR code with Expo Go
```

## Test

```bash
npm run test:db       # 51 scenario tests against the real SQL (in-process Postgres, RLS on)
npm run typecheck     # web
cd mobile && npm run typecheck
npx tsx --test src/lib/*.test.ts
```

## How it works

- **Shift** = one block of work. It has many participants (`shift_clients`, e.g. 1:4 in a SIL home) and many workers
  (`shift_workers`, e.g. two workers on one participant). Ratio is checked when staffing changes.
- **Cost code** = a price guide item. Pick one per shift (morning on one code, afternoon on another, a sleepover code),
  or leave it automatic and it is chosen from support family, time of day and ratio.
- **Create / repeat / split**: `create_shifts` makes many shifts, several time blocks a day, with daily or weekly
  repeats. `split_shift` / `split_series` cut a shift at a time (this, following, or all) and the second part can take a
  different cost code.
- **Start / end**: workers call `start_shift` / `end_shift`. Starting can require being within a distance of the
  participant's (or house's) address; this is optional per shift and per organisation. Ending requires a shift note per
  participant (configurable).
- **Approval**: office approves a shift (locks it, freezes worker pay), then a timesheet. Approved shifts feed invoices.
- **Invoices**: `generate_invoices` builds one invoice per participant from approved shifts. Export a Xero-format CSV
  from the Invoices page (Xero > Business > Invoices > Import).

## Known limits

- Xero is a CSV import, not a live API connection.
- Push notifications are not wired up; workers see notifications in the app.
- Public holidays and prices are entered by you; none are bundled.
- Starter terms and onboarding wording are templates, not legal advice.
