# Clients Page Implementation TODO

## 1. Update Client Type ✅
- Modify `src/lib/types.ts` to include new fields: fullName, dateOfBirth, email, phone, emergencyContact, diagnosis, notes, assignedCaregiver

## 2. Initialize Firestore ✅
- Add Firestore initialization to `src/lib/firebase/client.ts`

## 3. Create Clients Hook ✅
- Create `src/hooks/use-clients.tsx` for CRUD operations (fetch, add, update, delete) using Firestore under `clients/{clientId}`

## 4. Update Clients Page ✅
- Modify `src/app/dashboard/clients/page.tsx` to use the hook, add sorting/searching, integrate modal

## 5. Enhance Client Table ✅
- Update `src/app/dashboard/clients/client-table.tsx` with sorting/searching and connect actions

## 6. Create Client Modal ✅
- Create `src/components/clients/client-modal.tsx` for Add/Edit form with validation

## 7. Implement Delete Confirmation ✅
- Add confirmation dialog for delete action

## 8. Add Profile Picture Upload
- Add file upload functionality to client modal for profile pictures

## 9. Create Client Details Modal
- Create a detailed view modal showing all client information

## 10. Add View Schedule Functionality
- Add button to view shifts/schedule for a specific client
- Create schedule view component
