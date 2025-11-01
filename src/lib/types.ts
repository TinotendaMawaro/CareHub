export type Client = {
  id: string;
  name: string;
  age: number;
  address: string;
  contact: string;
  careNeeds: string[];
  assignedCaregiverId?: string;
  avatarUrl: string;
};

export type Caregiver = {
  id: string;
  name: string;
  experience: number; // years
  skills: string[];
  availability: 'Available' | 'Unavailable' | 'On Shift';
  contact: string;
  avatarUrl: string;
};

export type Shift = {
  id: string;
  clientId: string;
  caregiverId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'Upcoming' | 'Completed' | 'In Progress' | 'Cancelled';
};

export type IncidentReport = {
  id: string;
  clientId: string;
  caregiverId: string;
  date: string;
  time: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High';
};
