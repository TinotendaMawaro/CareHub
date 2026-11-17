"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { refreshOnChange } from '@/lib/supabase/realtime';
import { mapClient, toClientRow } from '@/lib/supabase/mappers';
import { useAuth } from './use-auth';
import type { Client } from '@/lib/types';

export function useClients() {
  const { user, role } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Default to 'admin' so the subscription always establishes
  const effectiveRole = role || 'admin';

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        let builder = supabase.from('clients').select('*');

        // RLS already filters caregivers to their assigned clients; this keeps
        // the intent explicit and lets Postgres use the GIN index.
        if (effectiveRole === 'caregiver') {
          builder = builder.contains('assigned_caregivers', [user!.id]);
        }

        const { data, error: err } = await builder.order('first_name');
        if (err) throw err;

        setClients((data ?? []).map(mapClient));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load clients');
      } finally {
        setLoading(false);
      }
    }

    void load();

    return refreshOnChange('clients', load);
  }, [user, effectiveRole]);

  const addClient = async (clientData: Omit<Client, 'id' | 'fullName' | 'createdAt' | 'updatedAt'>) => {
    try {
      setError(null);
      setSuccess(null);
      const { error: err } = await supabase
        .from('clients')
        .insert(toClientRow(clientData));
      if (err) throw err;
      setSuccess('Client added successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add client';
      setError(message);
      throw err;
    }
  };

  const updateClient = async (id: string, clientData: Partial<Client>) => {
    try {
      setError(null);
      setSuccess(null);
      const { error: err } = await supabase
        .from('clients')
        .update(toClientRow(clientData))
        .eq('id', id);
      if (err) throw err;
      setSuccess('Client updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update client';
      setError(message);
      throw err;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      setError(null);
      setSuccess(null);
      const { error: err } = await supabase.from('clients').delete().eq('id', id);
      if (err) throw err;
      setSuccess('Client deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete client';
      setError(message);
      throw err;
    }
  };

  const getClientByEmail = async (email: string): Promise<Client | null> => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('clients')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      if (err) throw err;
      return data ? mapClient(data) : null;
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
