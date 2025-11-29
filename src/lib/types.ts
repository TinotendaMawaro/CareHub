export type Client = {
  id: string;
  name: string;
  age: number;
  address: string;
  contact: string;
  careNeeds: string[];
  assignedCaregiverId?: string;
  avatarUrl: string;
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  emergencyContact: string;
  diagnosis: string;
  notes: string;
  assignedCaregiver: string;
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
};

export type Shift = {
  id: string;
  clientId: string;
  caregiverId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'Pending' | 'Accepted' | 'In Progress' | 'Completed';
  clientName?: string;
  caregiverName?: string;
};

export type IncidentReport = {
  id: string;
  clientId: string;
  caregiverId: string;
  date: string;
  time: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High';
  status: 'Resolved' | 'Unresolved';
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
