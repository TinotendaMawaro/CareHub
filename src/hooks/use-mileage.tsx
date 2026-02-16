"use client";

import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from './use-auth';
import type { Mileage } from '@/lib/types';

export function useMileage() {
  const [mileage, setMileage] = useState<Mileage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'mileage'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const mileageData: Mileage[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert Firebase Timestamps to Date objects
        const processedData = {
          ...data,
          date: data.date?.toDate?.() || new Date(data.date),
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          modifiedAt: data.modifiedAt?.toDate?.() || data.modifiedAt,
        };
        mileageData.push({ id: doc.id, ...processedData } as Mileage);
      });
      setMileage(mileageData);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addMileage = async (mileageData: Omit<Mileage, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'mileage'), mileageData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add mileage');
      throw err;
    }
  };

  const updateMileage = async (id: string, mileageData: Partial<Mileage>) => {
    try {
      setError(null);
      const mileageRef = doc(db, 'mileage', id);
      await updateDoc(mileageRef, mileageData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update mileage');
      throw err;
    }
  };

  const deleteMileage = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'mileage', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mileage');
      throw err;
    }
  };

  return {
    mileage,
    loading,
    error,
    addMileage,
    updateMileage,
    deleteMileage
  };
}
