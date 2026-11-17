import type { Client, Caregiver, Shift, IncidentReport } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const getAvatar = (seed: number) => PlaceHolderImages.find(p => p.id === `avatar-${seed}`)?.imageUrl || 'https://picsum.photos/seed/placeholder/100/100';

export const shifts: Shift[] = [];

export const incidentReports: IncidentReport[] = [];
