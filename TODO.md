# TODO: Enhance Scheduling Page

## 1. Create Shift Modal Component
- Create `src/components/shifts/shift-modal.tsx` for creating/editing shifts.
- Include form fields: client (dropdown), caregiver (dropdown), date, startTime, endTime, status.
- Use react-hook-form and zod for validation.
- Handle create and edit modes.

## 2. Update Scheduling Page
- Modify `src/app/dashboard/scheduling/page.tsx` to include calendar view using react-big-calendar.
- Add tabs for List and Calendar views.
- Integrate the shift modal on "Add Shift" button and edit actions.

## 3. Update Scheduling Table
- Modify `src/app/dashboard/scheduling/scheduling-table.tsx` to handle edit and delete actions.
- Connect edit to open modal, delete to call deleteShift.

## 4. Integrate with Hooks
- Ensure use-shifts is used in the page instead of static data.
- Update use-clients and use-caregivers for dropdowns.

## 5. Add Cloud Function for Notifications
- Create Firebase Cloud Function in `functions/` to send push notifications when shift is assigned.
- Trigger on shift creation/update.

## 6. Test and Verify
- Test creating, editing, deleting shifts.
- Verify calendar view displays shifts.
- Check notifications are sent.
