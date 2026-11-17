# CareHub Phase 0 Build Summary

## What was built

### 1. New pricing/scheduling data model
- `support_items` - One row per NDIS support item number, with family grouping, time band, unit, worker level, and national/remote/very-remote prices.
- `support_families` - What admins pick in the UI; groups time-band variants under one label.
- `pay_rates` - Admin-entered pay rules by worker level and time band; never hard-coded.
- `public_holidays` - Date/state/name primary key for holiday lookups.
- `shift_segments` - A shift split at time-band boundaries, with bill/pay rates frozen at calculation time and generated amounts.
- `clients.price_region` / `clients.state` - Participant location for regional pricing and holiday checks.
- `shifts.support_family` / `shifts.is_sleepover` / `shifts.notes` - New shift metadata.

### 2. Segment resolution
- Postgres function `public.resolve_segments(shift_id)` splits a shift at 6am, 8pm, midnight, and public-holiday boundaries, looks up the matching `support_items` row for the family and band, picks the participant's regional price, and writes `shift_segments`.
- Trigger `shifts_resolve_segments` runs after insert/update of `support_family`, `start_time`, `end_time`, `is_sleepover`, or `client_id`.

### 3. Shared TypeScript pricing library (`src/lib/pricing.ts`)
- `bandFor(dt, state, holidays)` - Determines the time band for a given datetime.
- `nextBoundary(dt, band)` - Calculates the next time-band boundary.
- `resolveSegments(start, end, familyKey, region, state, items, payRates, holidays, workerLevel?, isSleepover?)` - Mirrors the Postgres logic for UI preview.
- `summarizeSegments(segments)` - Totals bill/pay/margin.

### 4. Shift API helpers (`src/lib/shiftApi.ts`)
- `expandDates`, `toRanges`, `findClashes` - Recurrence and overlap checks.
- `createShifts` - Creates one or many shifts under one `series_id`, with overlap error handling.
- `assignWorker`, `previewAssign`, `unassignWorker`, `countFutureShifts` - Standing assignment and unassignment with clash preview.

### 5. Updated shift modal (`src/components/shifts/shift-modal.tsx`)
- Adds support family dropdown and sleepover toggle.
- Loads `support_families`, `support_items`, `pay_rates`, `public_holidays` on open.
- Shows live price preview: segments, bill/pay amounts, and margin.

### 6. New shift drawer (`src/components/shifts/shift-drawer.tsx`)
- Slide-over panel for admins.
- Shows shift details, support family, segments table, and live notes.
- Supports assign worker, start for worker, end shift, cancel shift.
- Live notes via Supabase realtime channel.

### 7. New roster page (`src/app/dashboard/roster/page.tsx`)
- Week grid with toggle: By participant / By support worker.
- Shift chips coloured by status.
- Weekly hours per row.
- "+ Add" button on empty cells.

### 8. Cost codes hook and mappers
- `src/hooks/use-cost-codes.tsx` - Collection hook for `cost_codes`.
- `src/lib/supabase/mappers.ts` - Added `mapCostCode`, `toCostCodeRow`, and updated `mapShift`/`toShiftRow` for new fields.
- `src/lib/types.ts` - Added `CostCode` type and extended `Shift` with `supportFamily`, `isSleepover`.

### 9. Seed data
- `cost_codes_seed.sql` - Regenerated from the NDIS text with corrected categories and remote/very-remote variants.
- `parsed_cost_codes.json` - 48 parsed base codes.

## Files changed
- `supabase/migrations/20260930000001_pricing_scheduling_phase0.sql` (new)
- `src/lib/pricing.ts` (new)
- `src/lib/shiftApi.ts` (new)
- `src/components/shifts/shift-drawer.tsx` (new)
- `src/app/dashboard/roster/page.tsx` (new)
- `src/hooks/use-cost-codes.tsx` (new)
- `src/components/shifts/shift-modal.tsx` (updated)
- `src/lib/types.ts` (updated)
- `src/lib/supabase/mappers.ts` (updated)
- `cost_codes_seed.sql` (regenerated)
- `parsed_cost_codes.json` (regenerated)
- `TODO.md` (updated)

## What to test by hand
1. Run the Phase 0 migration in Supabase SQL editor.
2. Seed `support_families` and `support_items` with at least one family and its time-band items.
3. Seed `pay_rates` with at least one worker level and band.
4. Open the shift modal, pick a participant, support family, and times - verify the price preview shows segments.
5. Create a shift, verify `shift_segments` are written by the trigger.
6. Open the shift drawer, verify segments, notes, and live updates.
7. Open the roster page, verify the week grid and chips.

## Next steps
- Phase 1: Design system tokens and shared primitives.
- Phase 2: Dashboard widgets with live data and money strip.
- Phase 3: Full scheduling page with tabs, drag/drop, and bulk actions.
- Phase 4: Shift notes filters and follow-up alerts.
- Phase 5: Participant and support worker profile pages.
- Phase 6: Pricing admin, reports, payroll exports.
- Phase 7: RLS hardening, React Query migration, tests, Playwright.

## Assumptions
- The existing `shifts` table uses `start_time`/`end_time` and `date`, not `scheduled_start`/`scheduled_end`.
- Organisation timezone defaults to `Australia/Sydney`.
- `client_caregivers` join table does not yet exist; will be added in the next migration.
- The `cost_codes` table is kept as-is for now; the new `support_items`/`support_families` model is the source of truth going forward.
- `shift_notes` already exists in the schema.
