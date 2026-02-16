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
import type { Payroll } from '@/lib/types';

export function usePayroll() {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'payrolls'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const payrollsData: Payroll[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert Firebase Timestamps to Date objects
        const processedData = {
          ...data,
          period: {
            startDate: data.period?.startDate?.toDate?.() || new Date(data.period.startDate),
            endDate: data.period?.endDate?.toDate?.() || new Date(data.period.endDate),
          },
          paymentDate: data.paymentDate?.toDate?.() || data.paymentDate,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          modifiedAt: data.modifiedAt?.toDate?.() || data.modifiedAt,
        };
        payrollsData.push({ id: doc.id, ...processedData } as Payroll);
      });
      setPayrolls(payrollsData);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addPayroll = async (payrollData: Omit<Payroll, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'payrolls'), payrollData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payroll');
      throw err;
    }
  };

  const updatePayroll = async (id: string, payrollData: Partial<Payroll>) => {
    try {
      setError(null);
      const payrollRef = doc(db, 'payrolls', id);
      await updateDoc(payrollRef, payrollData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payroll');
      throw err;
    }
  };

  const deletePayroll = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'payrolls', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete payroll');
      throw err;
    }
  };

  return {
    payrolls,
    loading,
    error,
    addPayroll,
    updatePayroll,
    deletePayroll
  };
}
