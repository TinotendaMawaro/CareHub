import type { Client, Caregiver, Shift, IncidentReport } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const getAvatar = (seed: number) => PlaceHolderImages.find(p => p.id === `avatar-${seed}`)?.imageUrl || 'https://picsum.photos/seed/placeholder/100/100';

export const clients: Client[] = [
  { id: 'cli-001', name: 'John Doe', age: 78, address: '123 Maple St, Springfield', contact: '555-0101', careNeeds: ['Medication Reminder', 'Mobility Assistance'], assignedCaregiverId: 'car-001', avatarUrl: getAvatar(1) },
  { id: 'cli-002', name: 'Jane Smith', age: 85, address: '456 Oak Ave, Springfield', contact: '555-0102', careNeeds: ['Meal Preparation', 'Companionship'], assignedCaregiverId: 'car-002', avatarUrl: getAvatar(2) },
  { id: 'cli-003', name: 'Peter Jones', age: 65, address: '789 Pine Ln, Springfield', contact: '555-0103', careNeeds: ['Post-operative Care', 'Physical Therapy'], assignedCaregiverId: 'car-003', avatarUrl: getAvatar(3) },
  { id: 'cli-004', name: 'Mary Williams', age: 92, address: '101 Birch Rd, Springfield', contact: '555-0104', careNeeds: ['Dementia Care', 'Personal Hygiene'], assignedCaregiverId: 'car-004', avatarUrl: getAvatar(4) },
  { id: 'cli-005', name: 'David Brown', age: 72, address: '212 Cedar Blvd, Springfield', contact: '555-0105', careNeeds: ['Diabetes Management'], assignedCaregiverId: 'car-005', avatarUrl: getAvatar(5) },
];

export const caregivers: Caregiver[] = [
  { id: 'car-001', name: 'Alice Johnson', experience: 5, skills: ['CPR Certified', 'Geriatric Care', 'Mobility Assistance'], availability: 'On Shift', contact: '555-0201', avatarUrl: getAvatar(6) },
  { id: 'car-002', name: 'Bob Williams', experience: 3, skills: ['Culinary Training', 'Companionship', 'First Aid'], availability: 'Available', contact: '555-0202', avatarUrl: getAvatar(1) },
  { id: 'car-003', name: 'Charlie Brown', experience: 7, skills: ['Physical Therapy Aide', 'Wound Care'], availability: 'Available', contact: '555-0203', avatarUrl: getAvatar(3) },
  { id: 'car-004', name: 'Diana Miller', experience: 10, skills: ['Dementia Care Specialist', 'Hospice Care'], availability: 'Unavailable', contact: '555-0204', avatarUrl: getAvatar(4) },
  { id: 'car-005', name: 'Ethan Davis', experience: 4, skills: ['Certified Nursing Assistant (CNA)', 'Diabetes Management'], availability: 'Available', contact: '555-0205', avatarUrl: getAvatar(5) },
];

export const shifts: Shift[] = [
  { id: 'sh-001', clientId: 'cli-001', caregiverId: 'car-001', date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '17:00', status: 'In Progress' },
  { id: 'sh-002', clientId: 'cli-002', caregiverId: 'car-002', date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], startTime: '10:00', endTime: '14:00', status: 'Upcoming' },
  { id: 'sh-003', clientId: 'cli-003', caregiverId: 'car-003', date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], startTime: '08:00', endTime: '12:00', status: 'Completed' },
  { id: 'sh-004', clientId: 'cli-004', caregiverId: 'car-004', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], startTime: '13:00', endTime: '18:00', status: 'Completed' },
  { id: 'sh-005', clientId: 'cli-001', caregiverId: 'car-001', date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], startTime: '09:00', endTime: '17:00', status: 'Upcoming' },
];

export const incidentReports: IncidentReport[] = [
  { id: 'inc-001', clientId: 'cli-001', caregiverId: 'car-001', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], time: '10:30', description: 'Client had a minor fall in the living room. No visible injuries, but seemed shaken. Monitored for the rest of the shift.', severity: 'Low' },
  { id: 'inc-002', clientId: 'cli-004', caregiverId: 'car-004', date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], time: '15:00', description: 'Client experienced a moment of confusion and agitation, refusing medication. Was able to de-escalate the situation after 15 minutes.', severity: 'Medium' },
  { id: 'inc-003', clientId: 'cli-002', caregiverId: 'car-002', date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], time: '11:00', description: 'Kitchen smoke alarm went off due to burnt toast. No fire or damage. Client was not in the room.', severity: 'Low' },
];

export const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Unknown Client';
export const getCaregiverName = (caregiverId: string) => caregivers.find(c => c.id === caregiverId)?.name || 'Unknown Caregiver';
