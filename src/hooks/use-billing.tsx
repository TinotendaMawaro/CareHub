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
import type { Billing } from '@/lib/types';

export function useBilling() {
  const [billing, setBilling] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'billing'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const billingData: Billing[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert Firebase Timestamps to Date objects
        const processedData = {
          ...data,
          period: {
            startDate: data.period?.startDate?.toDate?.() || new Date(data.period.startDate),
            endDate: data.period?.endDate?.toDate?.() || new Date(data.period.endDate),
          },
          dueDate: data.dueDate?.toDate?.() || new Date(data.dueDate),
          paymentDate: data.paymentDate?.toDate?.() || data.paymentDate,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          modifiedAt: data.modifiedAt?.toDate?.() || data.modifiedAt,
        };
        billingData.push({ id: doc.id, ...processedData } as Billing);
      });
      setBilling(billingData);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addBilling = async (billingData: Omit<Billing, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'billing'), billingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add billing');
      throw err;
    }
  };

  const updateBilling = async (id: string, billingData: Partial<Billing>) => {
    try {
      setError(null);
      const billingRef = doc(db, 'billing', id);
      await updateDoc(billingRef, billingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update billing');
      throw err;
    }
  };

  const deleteBilling = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'billing', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete billing');
      throw err;
    }
  };

  return {
    billing,
    loading,
    error,
    addBilling,
    updateBilling,
    deleteBilling
  };
}
