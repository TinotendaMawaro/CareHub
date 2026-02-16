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
import type { Form } from '@/lib/types';

export function useForms() {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'forms'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const formsData: Form[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert Firebase Timestamps to Date objects
        const processedData = {
          ...data,
          submittedAt: data.submittedAt?.toDate?.() || data.submittedAt,
          reviewedAt: data.reviewedAt?.toDate?.() || data.reviewedAt,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          modifiedAt: data.modifiedAt?.toDate?.() || data.modifiedAt,
        };
        formsData.push({ id: doc.id, ...processedData } as Form);
      });
      setForms(formsData);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addForm = async (formData: Omit<Form, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'forms'), formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add form');
      throw err;
    }
  };

  const updateForm = async (id: string, formData: Partial<Form>) => {
    try {
      setError(null);
      const formRef = doc(db, 'forms', id);
      await updateDoc(formRef, formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update form');
      throw err;
    }
  };

  const deleteForm = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'forms', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete form');
      throw err;
    }
  };

  return {
    forms,
    loading,
    error,
    addForm,
    updateForm,
    deleteForm
  };
}
