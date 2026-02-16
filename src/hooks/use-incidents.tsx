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
import type { IncidentReport } from '@/lib/types';

export function useIncidents() {
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'incidents'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const incidentsData: IncidentReport[] = [];
      querySnapshot.forEach((doc) => {
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
        incidentsData.push({
          id: doc.id,
          clientId: processedData.clientId,
          caregiverId: processedData.caregiverId,
          date: processedData.date,
          time: processedData.time?.split('T')[1]?.substring(0, 5) || processedData.time,
          description: processedData.description,
          incidentType: processedData.incidentType,
          status: processedData.status,
          actionsTaken: processedData.actionsTaken,
          involvedParties: processedData.involvedParties,
          photoUrls: processedData.photoUrls,
          name: processedData.name,
        } as IncidentReport);
      });
      setIncidents(incidentsData);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addIncident = async (incidentData: Omit<IncidentReport, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'incidents'), incidentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add incident');
      throw err;
    }
  };

  const updateIncident = async (id: string, incidentData: Partial<IncidentReport>) => {
    try {
      setError(null);
      const incidentRef = doc(db, 'incidents', id);
      await updateDoc(incidentRef, incidentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update incident');
      throw err;
    }
  };

  const deleteIncident = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'incidents', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete incident');
      throw err;
    }
  };

  return {
    incidents,
    loading,
    error,
    addIncident,
    updateIncident,
    deleteIncident
  };
}