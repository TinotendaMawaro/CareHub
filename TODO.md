# CareHub Phase 1: Core Infrastructure & EVV System - Data Models Enhancement

## Current Task: Enhance Data Models with Missing Fields

### Completed Tasks
- [x] Analyze current types.ts and identify missing models
- [x] Create implementation plan for new data types
- [x] Get user approval for plan

### Pending Tasks
- [x] Add new TypeScript interfaces to src/lib/types.ts:
  - [x] Expense: Track travel, supplies, etc. (amount, category, date, caregiverId, clientId)
  - [x] Mileage: Track vehicle usage (start/end locations, distance, date, caregiverId)
  - [x] CarePlan: Client care plans (goals, tasks, frequency, assigned caregivers)
  - [x] Assessment: Client assessments (type, date, results, notes)
  - [x] Billing: Invoices (clientId, amount, services, status, dueDate)
  - [x] Payroll: Caregiver payroll (hours, rate, deductions, period)
  - [x] Form: Generic forms for documentation (fields, responses, status)
- [ ] Create hooks for new data types (use-expenses.tsx, use-mileage.tsx, etc.)
  - [ ] Create use-assessment.tsx hook
  - [ ] Create use-payroll.tsx hook
- [ ] Update Firestore rules for new collections
- [ ] Implement components to display/manage these new data types
- [ ] Integrate into existing pages (add expense tracking to shifts)

### Next Phase Tasks (After Data Models)
- [ ] Implement real geolocation API integration for live location tracking
- [ ] Add location history and compliance monitoring logic
- [ ] Create comprehensive EVV compliance dashboard
- [ ] Add location-based alerts and notifications system
- [ ] Implement real-time notifications with FCM push notifications
- [ ] Integrate actual map service (Google Maps/Mapbox) in EVV components
- [ ] Add real-time updates throughout the app
