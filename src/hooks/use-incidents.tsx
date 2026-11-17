"use client";
import { useCallback } from 'react';

import { supabase } from '@/lib/supabase/client';

import { createCollectionHook } from './use-collection';
import { mapIncident, toIncidentRow } from '@/lib/supabase/mappers';
import { useClients } from './use-clients';
import type { IncidentReport, Client } from '@/lib/types';
const useIncidentsCollection = createCollectionHook<
  IncidentReport,
  Partial<IncidentReport>
>({
  table: 'incidents',
  map: mapIncident,
  toRow: toIncidentRow,
  orderBy: { column: 'date', ascending: false },
});

export function useIncidents(clients?: Client[]) {
  const { clients: internalClients } = useClients();
  const { items, loading, error, add, update, remove } = useIncidentsCollection();

  const effectiveClients = clients ?? internalClients;

  const incidents = items.map((i) => ({
    ...i,
    name: i.clientId
      ? effectiveClients.find((c) => c.id === i.clientId)?.fullName
      : undefined,
  }));

  return {
    incidents,
    loading,
    error,
    addIncident: add,
    updateIncident: update,
    deleteIncident: remove,
    clients: effectiveClients,
  };
}
