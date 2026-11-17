# CareHub TODO

## Phase 0: Data model and data
- [x] Create Phase 0 migration SQL for new pricing/scheduling model
- [x] Create shared pricing/resolution library with tests
- [x] Update shift modal, drawer, roster, and assign caregivers to real CareHub schema
- [ ] Wire dashboard widgets and remove placeholders
- [ ] Summarize integration steps, test plan, and next phases

## Phase 1: Design system
- [ ] Tokens in globals.css and Tailwind config
- [ ] Shared primitives in components/ui
- [ ] Sidebar groups and command palette

## Phase 2: Dashboard
- [ ] Live stat cards
- [ ] Widgets: Who's on now, Late for work, Upcoming shifts, On leave, Birthdays, Work anniversaries, Message wall
- [ ] Money strip for admins

## Phase 3: Scheduling
- [ ] Roster by participant
- [ ] Schedule by support worker
- [ ] Calendar view
- [ ] List view with bulk actions

## Phase 4: Shift notes
- [ ] Live notes in shift drawer
- [ ] Filters and follow-up flag

## Phase 5: Participants and support workers
- [ ] Participant profile page
- [ ] Support worker profile page

## Phase 6: Pricing admin, reports, payroll
- [ ] Pricing and pay admin page
- [ ] Reports with CSV export
- [ ] Invoice and payroll exports

## Phase 7: Quality
- [ ] Row Level Security for mobile app
- [ ] React Query plus realtime invalidation
- [ ] Unit tests for resolve_segments
- [ ] Playwright smoke tests
- [ ] Type check and lint clean
