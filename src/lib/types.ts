export type Client = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
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
  assignedCaregivers: string[];
  preferredCaregivers: string[];
  profilePictureUrl: string;
  createdAt: Date;
  updatedAt: Date;
  status: string;
};

export type Caregiver = {
  id: string;
  name: string;
  email: string;
  phone: string;
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
  shiftId: string; // auto-generated
  clientId: string;
  caregiverId: string | null;
  serviceType: 'aged_care' | 'ndis' | 'intercompany' | 'other';
  date: string;
  startTime: string; // timestamp as ISO string
  endTime: string; // timestamp as ISO string
  location: {
    latitude: number;
    longitude: number;
  }; // GeoPoint equivalent
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Late' | 'No Show' | 'Cancelled'; // auto-calculated, never manually edited
  clockInTime?: Date; // timestamp, written by mobile app
  clockOutTime?: Date; // timestamp, written by mobile app
  hoursWorked?: number; // auto-calculated
  createdBy: string;
  createdAt: Date;
  modifiedBy?: string;
  modifiedAt?: Date;
  allowOverlap: boolean;
  deleted: boolean; // soft delete
  // For display purposes (not stored in Firestore)
  clientName?: string;
  caregiverName?: string;
};

export type IncidentReport = {
  id: string;
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
  name?: string; // Client name from Firebase
  severity?: 'Low' | 'Medium' | 'High';
};

export type ShiftNote = {
  id: string;
  caregiverId: string;
  clientId: string;
  note: string;
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
