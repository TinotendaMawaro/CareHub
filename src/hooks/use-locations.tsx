"use client";

import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from './use-auth';
import type { Location } from '@/lib/types';

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'locations'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const locationData: Location[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert Firebase Timestamp to Date
        const processedData = {
          ...data,
          timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
        };
        locationData.push({ id: doc.id, ...processedData } as Location);
      });
      setLocations(locationData);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addLocation = async (locationData: Omit<Location, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'locations'), locationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add location');
      throw err;
    }
  };

  const updateLocation = async (id: string, locationData: Partial<Location>) => {
    try {
      setError(null);
      const locationRef = doc(db, 'locations', id);
      await updateDoc(locationRef, locationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update location');
      throw err;
    }
  };

  return {
    locations,
    loading,
    error,
    addLocation,
    updateLocation
  };
}
