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
import type { CarePlan } from '@/lib/types';

export function useCarePlans() {
  const [carePlans, setCarePlans] = useState<CarePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'carePlans'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const carePlansData: CarePlan[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert Firebase Timestamps to Date objects
        const processedData = {
          ...data,
          startDate: data.startDate?.toDate?.() || new Date(data.startDate),
          endDate: data.endDate?.toDate?.() || data.endDate,
          goals: data.goals?.map((goal: any) => ({
            ...goal,
            targetDate: goal.targetDate?.toDate?.() || goal.targetDate,
          })) || [],
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          modifiedAt: data.modifiedAt?.toDate?.() || data.modifiedAt,
        };
        carePlansData.push({ id: doc.id, ...processedData } as CarePlan);
      });
      setCarePlans(carePlansData);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addCarePlan = async (carePlanData: Omit<CarePlan, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'carePlans'), carePlanData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add care plan');
      throw err;
    }
  };

  const updateCarePlan = async (id: string, carePlanData: Partial<CarePlan>) => {
    try {
      setError(null);
      const carePlanRef = doc(db, 'carePlans', id);
      await updateDoc(carePlanRef, carePlanData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update care plan');
      throw err;
    }
  };

  const deleteCarePlan = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'carePlans', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete care plan');
      throw err;
    }
  };

  return {
    carePlans,
    loading,
    error,
    addCarePlan,
    updateCarePlan,
    deleteCarePlan
  };
}
