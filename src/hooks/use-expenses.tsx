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
import type { Expense } from '@/lib/types';

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const expensesData: Expense[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert Firebase Timestamps to Date objects
        const processedData = {
          ...data,
          date: data.date?.toDate?.() || new Date(data.date),
          approvedAt: data.approvedAt?.toDate?.() || data.approvedAt,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          modifiedAt: data.modifiedAt?.toDate?.() || data.modifiedAt,
        };
        expensesData.push({ id: doc.id, ...processedData } as Expense);
      });
      setExpenses(expensesData);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addExpense = async (expenseData: Omit<Expense, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'expenses'), expenseData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add expense');
      throw err;
    }
  };

  const updateExpense = async (id: string, expenseData: Partial<Expense>) => {
    try {
      setError(null);
      const expenseRef = doc(db, 'expenses', id);
      await updateDoc(expenseRef, expenseData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update expense');
      throw err;
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'expenses', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete expense');
      throw err;
    }
  };

  return {
    expenses,
    loading,
    error,
    addExpense,
    updateExpense,
    deleteExpense
  };
}
