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
import type { Client } from '@/lib/types';

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('fullName'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const clientsData: Client[] = [];
      querySnapshot.forEach((doc) => {
        clientsData.push({ id: doc.id, ...doc.data() } as Client);
      });
      setClients(clientsData);
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addClient = async (clientData: Omit<Client, 'id'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'clients'), clientData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add client');
      throw err;
    }
  };

  const updateClient = async (id: string, clientData: Partial<Client>) => {
    try {
      setError(null);
      const clientRef = doc(db, 'clients', id);
      await updateDoc(clientRef, clientData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update client');
      throw err;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      setError(null);
      await deleteDoc(doc(db, 'clients', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete client');
      throw err;
    }
  };

  return {
    clients,
    loading,
    error,
    addClient,
    updateClient,
    deleteClient
  };
}
