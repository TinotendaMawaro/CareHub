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
  where,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from './use-auth';
import type { Client } from '@/lib/types';

export function useClients() {
  const { user, role } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Determine effective role - default to 'admin' if role is null/undefined
  // This ensures the onSnapshot listener always sets up
  const effectiveRole = role || 'admin';

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Build query based on role - use effectiveRole to ensure listener always sets up
    let q;
    if (effectiveRole === 'admin') {
      q = query(collection(db, 'clients'), orderBy('firstName'));
    } else if (effectiveRole === 'caregiver') {
      // For caregivers, filter by assignedCaregivers array containing user's UID
      q = query(
        collection(db, 'clients'), 
        where('assignedCaregivers', 'array-contains', user.uid),
        orderBy('firstName')
      );
    } else {
      // Fallback for unknown roles - still show clients but without filtering
      console.warn('Unknown role:', effectiveRole, '- defaulting to admin view');
      q = query(collection(db, 'clients'), orderBy('firstName'));
    }

    console.log('Setting up clients onSnapshot with role:', effectiveRole);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const clientsData: Client[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert any Firebase Timestamps to strings and GeoPoints to location objects
        const processedData = Object.keys(data).reduce((acc, key) => {
          const value = data[key];
          if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
            acc[key] = value.toDate().toISOString();
          } else if (value && typeof value === 'object' && '_lat' in value && '_long' in value) {
            acc[key] = { latitude: value._lat, longitude: value._long };
          } else {
            acc[key] = value;
          }
          return acc;
        }, {} as any);
        // Ensure specific fields are properly typed
        processedData.dateOfBirth = processedData.dateOfBirth?.split('T')[0] || processedData.dateOfBirth;
        processedData.firstName = processedData.firstName || '';
        processedData.lastName = processedData.lastName || '';
        processedData.fullName = `${processedData.firstName} ${processedData.lastName}`.trim();

        processedData.profilePictureUrl = typeof processedData.profilePictureUrl === 'string' ? processedData.profilePictureUrl : '';

        processedData.assignedCaregivers = Array.isArray(processedData.assignedCaregivers) ? processedData.assignedCaregivers : [];
        processedData.preferredCaregivers = Array.isArray(processedData.preferredCaregivers) ? processedData.preferredCaregivers : [];
        processedData.allergies = Array.isArray(processedData.allergies) ? processedData.allergies : [];

        processedData.status = processedData.status || 'active';
        clientsData.push({ id: doc.id, ...processedData } as Client);
      });
      setClients(clientsData);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Error in clients onSnapshot:', err);
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, effectiveRole]);

  const addClient = async (clientData: Omit<Client, 'id'>) => {
    try {
      setError(null);
      setSuccess(null);
      console.log('Adding client:', clientData);
      await addDoc(collection(db, 'clients'), clientData);
      setSuccess('Client added successfully');
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error adding client:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to add client';
      setError(errorMessage);
      throw err;
    }
  };

  const updateClient = async (id: string, clientData: Partial<Client>) => {
    try {
      setError(null);
      setSuccess(null);
      console.log('Updating client:', id, clientData);
      const clientRef = doc(db, 'clients', id);
      await updateDoc(clientRef, clientData);
      setSuccess('Client updated successfully');
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating client:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to update client';
      setError(errorMessage);
      throw err;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      setError(null);
      setSuccess(null);
      console.log('Deleting client:', id);
      await deleteDoc(doc(db, 'clients', id));
      setSuccess('Client deleted successfully');
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting client:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete client';
      setError(errorMessage);
      throw err;
    }
  };

  const getClientByEmail = async (email: string): Promise<Client | null> => {
    try {
      setError(null);
      const q = query(collection(db, 'clients'), where('email', '==', email));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        const data = doc.data();
        // Process data similar to the onSnapshot
        const processedData = Object.keys(data).reduce((acc, key) => {
          const value = data[key];
          if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
            acc[key] = value.toDate().toISOString();
          } else if (value && typeof value === 'object' && '_lat' in value && '_long' in value) {
            acc[key] = { latitude: value._lat, longitude: value._long };
          } else {
            acc[key] = value;
          }
          return acc;
        }, {} as any);
        processedData.dateOfBirth = processedData.dateOfBirth?.split('T')[0] || processedData.dateOfBirth;
        processedData.firstName = processedData.firstName || '';
        processedData.lastName = processedData.lastName || '';
        processedData.fullName = `${processedData.firstName} ${processedData.lastName}`.trim();
        processedData.profilePictureUrl = typeof processedData.profilePictureUrl === 'string' ? processedData.profilePictureUrl : '';
        processedData.assignedCaregivers = Array.isArray(processedData.assignedCaregivers) ? processedData.assignedCaregivers : [];
        processedData.preferredCaregivers = Array.isArray(processedData.preferredCaregivers) ? processedData.preferredCaregivers : [];
        processedData.allergies = Array.isArray(processedData.allergies) ? processedData.allergies : [];
        processedData.status = processedData.status || 'active';
        return { id: doc.id, ...processedData } as Client;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get client');
      throw err;
    }
  };

  return {
    clients,
    loading,
    error,
    success,
    addClient,
    updateClient,
    deleteClient,
    getClientByEmail
  };
}
