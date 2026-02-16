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
import type { Assessment } from '@/lib/types';

export function useAssessments() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'assessments'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const assessmentsData: Assessment[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert Firebase Timestamps to Date objects
        const processedData = {
          ...data,
          date: data.date?.toDate?.() || new Date(data.date),
          nextAssessmentDate: data.nextAssessmentDate?.toDate?.() || data.nextAssessmentDate,
          reviewedAt: data.reviewedAt?.toDate?.() || data.reviewedAt,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          modifiedAt: data.modifiedAt?.toDate?.() || data.modifiedAt,
        };
        assessmentsData.push({ id: doc.id, ...processedData } as Assessment);
      });
      setAssessments(assessmentsData);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addAssessment = async (assessmentData: Omit<Assessment, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'assessments'), assessmentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add assessment');
      throw err;
    }
  };

  const updateAssessment = async (id: string, assessmentData: Partial<Assessment>) => {
    try {
      setError(null);
      const assessmentRef = doc(db, 'assessments', id);
      await updateDoc(assessmentRef, assessmentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assessment');
      throw err;
    }
  };

  const deleteAssessment = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'assessments', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assessment');
      throw err;
    }
  };

  return {
    assessments,
    loading,
    error,
    addAssessment,
    updateAssessment,
    deleteAssessment
  };
}
