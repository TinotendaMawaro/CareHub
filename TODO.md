# TODO: Implement Push Notifications for CareHub Admin Portal

## Tasks
- [ ] Set up FCM Client:
  - [ ] Add `getMessaging` import and export in `src/lib/firebase/client.ts`
  - [ ] Create `public/firebase-messaging-sw.js` service worker
  - [ ] Add VAPID key configuration (BF2Bw1LNL00JeWuJw1PgWP2B0TgPbdeCAOb0TevwfJStWLxYNAPLMpbA2heDS3vvY7hBewCaoPh6H_VT0Meb2F4)

- [ ] Create Notification Service:
  - [ ] New file: `src/lib/notifications.ts` for sending notifications via admin SDK
  - [ ] New hook: `src/hooks/use-notifications.tsx` for managing notification state

- [ ] Implement Event Listeners:
  - [ ] Add Firestore listeners for shift status changes (accept/decline, start/complete)
  - [ ] Listen for new incident reports
  - [ ] Monitor shift notes updates
  - [ ] Monitor reports analysis updates

- [ ] Update UI Components:
  - [ ] Modify `src/components/app/app-header.tsx` to show real notification count
  - [ ] Create notification dropdown component
  - [ ] Add permission request handling

- [ ] Add Notification Types:
  - [ ] Update `src/lib/types.ts` with notification interfaces

- [ ] Testing:
  - [ ] Test notification permissions
  - [ ] Verify service worker registration
  - [ ] Test each notification trigger event (caregiver accept/decline, shift started/completed, incident logged, shift notes, reports analysis)
