"use client";

import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Shift } from '@/lib/types';
import { useClients } from './use-clients';
import { useCaregivers } from './use-caregivers';

export function useShifts() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const { clients } = useClients();
  const { caregivers } = useCaregivers();

  useEffect(() => {
    const q = query(collection(db, 'shifts'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const shiftsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        // Convert any Firebase Timestamps to strings
        const processedData = Object.keys(data).reduce((acc, key) => {
          const value = data[key];
          if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
            acc[key] = value.toDate().toISOString();
          } else {
            acc[key] = value;
          }
          return acc;
        }, {} as any);
        const client = clients.find(c => c.id === processedData.clientId);
        const caregiver = caregivers.find(c => c.id === processedData.caregiverId);
        return {
          id: doc.id,
          shiftId: doc.id,
          ...processedData,
          date: processedData.date?.split('T')[0] || processedData.date,
          clientName: client?.name || 'Unknown Client',
          caregiverName: caregiver?.name || 'Unknown Caregiver',
        } as Shift;
      });
      setShifts(shiftsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clients, caregivers]);

  const createShift = async (shiftData: Omit<Shift, 'shiftId' | 'clientName' | 'caregiverName'>) => {
    try {
      const docRef = await addDoc(collection(db, 'shifts'), shiftData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating shift:', error);
      throw error;
    }
  };

  const updateShift = async (id: string, shiftData: Partial<Shift>) => {
    try {
      const shiftRef = doc(db, 'shifts', id);
      await updateDoc(shiftRef, shiftData);
    } catch (error) {
      console.error('Error updating shift:', error);
      throw error;
    }
  };

  const deleteShift = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'shifts', id));
    } catch (error) {
      console.error('Error deleting shift:', error);
      throw error;
    }
  };

  // Automatic status updates based on time and clock events
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      shifts.forEach(async (shift) => {
        if (shift.status === 'Completed' || shift.status === 'Cancelled') return;

        let newStatus: Shift['status'] | null = null;

        if (shift.clockOutTime) {
          // If clockOutTime exists → Completed
          newStatus = 'Completed';
        } else if (shift.clockInTime) {
          // If clockInTime exists → In Progress
          newStatus = 'In Progress';
        } else if (now >= shift.endTime) {
          // If no clockInTime and now > endTime → No Show
          newStatus = 'No Show';
        } else if (now >= shift.startTime) {
          // If now >= startTime AND no clockInTime → Late
          newStatus = 'Late';
        } else {
          // If now < startTime → Scheduled
          newStatus = 'Scheduled';
        }

        if (newStatus && newStatus !== shift.status) {
          try {
            await updateShift(shift.shiftId, { status: newStatus });
          } catch (error) {
            console.error('Error updating shift status automatically:', error);
          }
        }
      });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [shifts, updateShift]);

  return {
    shifts,
    loading,
    createShift,
    updateShift,
    deleteShift
  };
}
