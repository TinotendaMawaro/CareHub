export type Client = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  name?: string; // alias for fullName, used in some components
  email: string;
  dateOfBirth: string;
  diagnosis: string;
  allergies: string[];
  carePlan: string;
  notes: string;
  emergencyContact: string;
  location: {
    latitude: number;
    longitude: number;
  };
  address: string;
  phone?: string;
  ndisNumber?: string;
  siteId?: string;
  priceRegion?: 'national' | 'remote' | 'very_remote';
  state?: string;
  geofenceRadiusM?: number;
  assignedCaregivers: string[];
  preferredCaregivers: string[];
  profilePictureUrl: string;
  avatarUrl?: string; // alias for profilePictureUrl, used in some components
  createdAt: Date;
  updatedAt: Date;
  status: string;
};

export type Caregiver = {
  id: string;
  name: string;
  email: string;
  phone: string;
  userId?: string;
  workerLevel?: string;
  qualifications: string[];
  experience: number; // years
  skills: string[];
  availability: 'Available' | 'Unavailable' | 'On Shift';
  profilePictureUrl?: string;
  fcmToken?: string;
  contractStatus: 'Active' | 'Terminated' | 'Suspended';
  currentShiftId?: string;
  evvCompliance: 'On Location' | 'Off Location' | 'Unknown';
  clientsWorkedWith: string[]; // client IDs
  clientsInductedFor: string[]; // client IDs
};

export type Shift = {
  id: string;
  shiftId: string; // auto-generated
  clientId: string;
  caregiverId: string | null;
  serviceType: 'aged_care' | 'ndis' | 'intercompany' | 'other';
  date: string;
  startTime: string; // timestamp as ISO string
  endTime: string; // timestamp as ISO string
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Late' | 'No Show' | 'Cancelled'; // derived by the database, never edited
  siteId?: string;
  seriesId?: string;
  splitFrom?: string;
  itemNumber?: string; // explicit cost code (price guide item); otherwise resolved from supportFamily + time band
  ratio?: string; // workers:participants, e.g. 1:2
  requiredWorkers?: number;
  geofenceRequired?: boolean; // undefined = organisation default
  pricingWarning?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedAt?: Date;
  rejectReason?: string;
  cancelPay?: boolean;
  cancelReason?: string;
  workerIds?: string[]; // when queried with shift_workers
  clientIds?: string[]; // when queried with shift_clients
  clockInTime?: Date; // timestamp, written by mobile app
  clockOutTime?: Date; // timestamp, written by mobile app
  hoursWorked?: number; // auto-calculated
  createdBy: string;
  createdAt: Date;
  modifiedBy?: string;
  modifiedAt?: Date;
  allowOverlap: boolean;
  deleted: boolean; // soft delete
  supportFamily?: string;
  isSleepover?: boolean;
  notes?: string;
  // For display purposes (joined client/caregiver names, not stored)
  clientName?: string;
  caregiverName?: string;
  shiftPublishState?: 'offered' | 'viewed' | 'accepted' | 'declined';
};

export type IncidentReport = {
  id: string;
  shiftId?: string;
  clientId?: string;
  caregiverId: string;
  date: string;
  time: string;
  description: string;
  incidentType: string;
  status: 'Reported' | 'Resolved' | 'Unresolved' | 'Investigation';
  actionsTaken?: string;
  involvedParties?: string;
  photoUrls?: string[];
  name?: string; // Resolved client name, joined in useIncidents
  severity?: 'Low' | 'Medium' | 'High';
};

export type ShiftNote = {
  id: string;
  shiftId?: string;
  caregiverId: string;
  clientId: string;
  note: string;
  category?: 'general' | 'medication' | 'mood' | 'meal' | 'activity' | 'health' | 'handover';
  followUp?: boolean;
  timestamp: Date;
  status: 'Open' | 'Resolved' | 'Closed' | 'Unresolved';
};

export type Notification = {
  id: string;
  title: string;
  message: string;
  type: 'shift' | 'incident' | 'report' | 'note';
  timestamp: Date;
  read: boolean;
  data?: any; // Additional data related to the notification
};

export type TimeOffRequest = {
  id: string;
  caregiverId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
};

export type WallPost = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  createdAt: Date;
  updatedAt: Date;
};

export type Location = {
  id: string;
  caregiverId: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
  accuracy?: number;
};

export type Message = {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: Date;
  read: boolean;
  type: 'text' | 'group';
  groupId?: string; // For group messages
};

export type Expense = {
  id: string;
  caregiverId: string;
  clientId?: string;
  shiftId?: string;
  category: 'Travel' | 'Supplies' | 'Equipment' | 'Meals' | 'Other';
  description: string;
  amount: number;
  currency: string;
  date: Date;
  receiptUrl?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
  modifiedAt?: Date;
};

export type NewExpense = {
  id?: string;
  caregiverId: string;
  clientId?: string;
  planId?: string;
  categoryNo?: number;
  shiftId?: string;
  kind: 'transport_km' | 'activity_cost' | 'consumables' | 'purchase' | 'other';
  description: string;
  incurredOn: string;
  amount: number;
  reimburseWorker: boolean;
  receiptUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdBy?: string;
  createdAt?: Date;
};

export type Mileage = {
  id: string;
  caregiverId: string;
  clientId?: string;
  shiftId?: string;
  startLocation: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  endLocation: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  distance: number; // in kilometers or miles
  unit: 'km' | 'miles';
  date: Date;
  purpose: string;
  vehicleType?: string;
  createdAt: Date;
  modifiedAt?: Date;
};

export type CarePlan = {
  id: string;
  clientId: string;
  title: string;
  description: string;
  goals: {
    id: string;
    description: string;
    targetDate?: Date;
    status: 'Active' | 'Completed' | 'Cancelled';
  }[];
  tasks: {
    id: string;
    description: string;
    frequency: 'Daily' | 'Weekly' | 'Monthly' | 'As Needed';
    assignedCaregiverId?: string;
    status: 'Active' | 'Completed' | 'Cancelled';
  }[];
  startDate: Date;
  endDate?: Date;
  status: 'Active' | 'Completed' | 'Cancelled';
  createdBy: string;
  createdAt: Date;
  modifiedBy?: string;
  modifiedAt?: Date;
};

export type Assessment = {
  id: string;
  clientId: string;
  caregiverId: string;
  type: 'Initial' | 'Periodic' | 'Discharge' | 'Other';
  date: Date;
  results: {
    category: string;
    score?: number;
    notes: string;
  }[];
  overallNotes: string;
  recommendations: string[];
  nextAssessmentDate?: Date;
  status: 'Draft' | 'Completed' | 'Reviewed';
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
  modifiedAt?: Date;
};

export type Billing = {
  id: string;
  clientId: string;
  invoiceNumber: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  services: {
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  dueDate: Date;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Cancelled';
  paymentDate?: Date;
  paymentMethod?: string;
  notes?: string;
  createdAt: Date;
  modifiedAt?: Date;
};

export type Payroll = {
  id: string;
  caregiverId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  hoursWorked: number;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  overtimeRate: number;
  grossPay: number;
  deductions: {
    description: string;
    amount: number;
  }[];
  netPay: number;
  currency: string;
  status: 'Pending' | 'Processed' | 'Paid';
  paymentDate?: Date;
  paymentMethod?: string;
  notes?: string;
  createdAt: Date;
  modifiedAt?: Date;
};

export type CostCode = {
  id: string;
  code: string;
  description: string;
  supportCategory?: string;
  weekdayRate?: number;
  eveningRate?: number;
  saturdayRate?: number;
  sundayRate?: number;
  publicHolidayRate?: number;
  ndisPrice?: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Form = {
  id: string;
  title: string;
  description?: string;
  type: 'Assessment' | 'Incident' | 'Care Plan' | 'Other';
  clientId?: string;
  caregiverId?: string;
  shiftId?: string;
  fields: {
    id: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'number';
    required: boolean;
    options?: string[]; // for select, checkbox, radio
    placeholder?: string;
  }[];
  responses: {
    fieldId: string;
    value: any;
  }[];
  status: 'Draft' | 'Submitted' | 'Reviewed' | 'Approved';
  submittedAt?: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdBy: string;
  createdAt: Date;
  modifiedAt?: Date;
};

export type PayrollSettings = {
  id: string;
  fortnightAnchor: string;
  timezone: string;
  varianceFlagMinutes: number;
  ordinaryHoursFlag: number;
  cancellationBillablePercent: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PayPeriod = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'open' | 'closed' | 'paid';
  createdAt: Date;
};

export type Timesheet = {
  id: string;
  payPeriodId: string;
  caregiverId: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'exported' | 'paid';
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
  rejectReason?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TimesheetAdjustment = {
  id: string;
  timesheetId: string;
  shiftId?: string;
  kind: 'unpaid_break' | 'travel_time' | 'allowance' | 'correction';
  hours: number;
  amount: number;
  reason: string;
  createdBy?: string;
  createdAt: Date;
};

export type TimesheetTotal = {
  timesheetId: string;
  caregiverId: string;
  payPeriodId: string;
  status: string;
  completedShifts: number;
  inProgressShifts: number;
  pendingShifts: number;
  approvedHours: number;
  grossPaySegments: number;
  adjustments: number;
  totalGross: number;
};

export type SupportCategory = {
  categoryNo: number;
  name: string;
  budgetGroup: 'Core' | 'Capacity Building' | 'Capital';
};

export type ParticipantPlan = {
  id: string;
  clientId: string;
  ndisNumber?: string;
  managementType: 'ndia' | 'plan_managed' | 'self_managed';
  planManagerName?: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'ended';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PlanBudget = {
  id: string;
  planId: string;
  categoryNo: number;
  allocated: number;
  createdAt: Date;
  updatedAt: Date;
};

export type BudgetSummary = {
  planId: string;
  categoryNo: number;
  name: string;
  budgetGroup: string;
  allocated: number;
  spent: number;
  committed: number;
  remaining: number;
  percentUsed: number;
};

export type BudgetAdjustment = {
  id: string;
  planId: string;
  categoryNo?: number;
  amount: number;
  reason: string;
  createdBy?: string;
  createdAt: Date;
};


// ---------------------------------------------------------------------------
// Organisation, invoicing, chat, onboarding
// ---------------------------------------------------------------------------
export type Organisation = {
  name: string;
  legalName?: string;
  abn?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  logoUrl?: string;
  brandColor: string;
  accentColor: string;
  timezone: string;
  state?: string;
  currency: string;
  invoicePrefix: string;
  invoiceTermsDays: number;
  gstRate: number;
  invoiceFooter?: string;
  bankDetails?: string;
  xeroAccountCode: string;
  xeroTaxType: string;
  defaultGeofenceRequired: boolean;
  defaultGeofenceRadiusM: number;
  enforceGeofenceOnEnd: boolean;
  clockInEarlyMinutes: number;
  requireNoteOnEnd: boolean;
  requireMfa: boolean;
};

export type Invoice = {
  id: string;
  number: string;
  clientId: string;
  clientName?: string;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  dueDate: string;
  status: 'draft' | 'approved' | 'sent' | 'paid' | 'void';
  subtotal: number;
  gstAmount: number;
  total: number;
  reference?: string;
  externalId?: string;
  exportedAt?: Date;
  voidReason?: string;
};

export type InvoiceLine = {
  id: string;
  invoiceId: string;
  shiftId?: string;
  itemNumber?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type ChatChannel = {
  channelId: string;
  name?: string;
  kind: 'channel' | 'group' | 'dm';
  isPrivate: boolean;
  description?: string;
  unread: number;
  lastMessageAt?: Date;
  dmUserId?: string;
};

export type ChatMessage = {
  id: string;
  channelId: string;
  senderId: string;
  body: string;
  attachmentUrl?: string;
  createdAt: Date;
  editedAt?: Date;
  deleted: boolean;
};

export type LegalDocument = {
  id: string;
  kind: string;
  title: string;
  audience: 'staff' | 'office' | 'client' | 'all';
  version: number;
  body: string;
  active: boolean;
};

export type OnboardingTask = {
  id: string;
  subjectType: 'staff' | 'office' | 'client';
  profileId?: string;
  clientId?: string;
  stepKey: string;
  title: string;
  description?: string;
  kind: 'accept_document' | 'form' | 'upload' | 'info';
  documentKind?: string;
  required: boolean;
  status: 'todo' | 'submitted' | 'approved' | 'rejected';
  data: Record<string, unknown>;
  fileUrl?: string;
  reviewNote?: string;
};

export type SupportItem = {
  itemNumber: string;
  name: string;
  familyKey: string;
  timeBand: string;
  ratio: string;
  unit: 'Hour' | 'Each' | 'Day' | 'Week';
  isSleepover: boolean;
  priceNational: number;
  priceRemote?: number;
  priceVeryRemote?: number;
  active: boolean;
};

export type SupportFamily = { familyKey: string; label: string; category?: string };
