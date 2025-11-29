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
        const client = clients.find(c => c.id === data.clientId);
        const caregiver = caregivers.find(c => c.id === data.caregiverId);
        return {
          id: doc.id,
          ...data,
          clientName: client?.name || 'Unknown Client',
          caregiverName: caregiver?.name || 'Unknown Caregiver',
        } as Shift;
      });
      setShifts(shiftsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clients, caregivers]);

  const createShift = async (shiftData: Omit<Shift, 'id'>) => {
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

  return {
    shifts,
    loading,
    createShift,
    updateShift,
    deleteShift
  };
}
