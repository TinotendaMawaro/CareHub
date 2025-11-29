"use client";

import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from './use-auth';
import type { Caregiver } from '@/lib/types';

export function useCaregivers() {
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'caregivers'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const caregiversData: Caregiver[] = [];
      querySnapshot.forEach((doc) => {
        caregiversData.push({ id: doc.id, ...doc.data() } as Caregiver);
      });
      setCaregivers(caregiversData);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addCaregiver = async (caregiverData: Omit<Caregiver, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'caregivers'), caregiverData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add caregiver');
      throw err;
    }
  };

  const updateCaregiver = async (id: string, caregiverData: Partial<Caregiver>) => {
    try {
      setError(null);
      const caregiverRef = doc(db, 'caregivers', id);
      await updateDoc(caregiverRef, caregiverData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update caregiver');
      throw err;
    }
  };

  const deleteCaregiver = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'caregivers', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete caregiver');
      throw err;
    }
  };

  return {
    caregivers,
    loading,
    error,
    addCaregiver,
    updateCaregiver,
    deleteCaregiver
  };
}
