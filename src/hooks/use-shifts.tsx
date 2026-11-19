"use client";
import { useCallback } from 'react';

import { supabase } from '@/lib/supabase/client';

import { createCollectionHook } from './use-collection';
import { mapShift, toShiftRow } from '@/lib/supabase/mappers';
import { useClients } from './use-clients';
import { useCaregivers } from './use-caregivers';
import type { Shift, Client, Caregiver } from '@/lib/types';
const useShiftsCollection = createCollectionHook<Shift, Partial<Shift>>({
  table: 'shifts',
  map: (row) => mapShift(row),
  toRow: toShiftRow,
  orderBy: { column: 'start_time', ascending: false },
  // Names come with each row, so labels never depend on the client/staff lists having loaded.
  select: '*, shift_workers(caregiver_id,confirmation), shift_clients(client_id), clients!shifts_client_id_fkey(first_name,last_name), caregivers!shifts_caregiver_id_fkey(name)',
  // Recent past onward: the dashboard never needs years of history in memory.
  scope: (q: any) => q.eq('deleted', false).gte('start_time', new Date(Date.now() - 60 * 86_400_000).toISOString()),
  softDeleteRow: { deleted: true },
});

export function useShifts(clients?: Client[], caregivers?: Caregiver[]) {
  const { clients: internalClients } = useClients();
  const { caregivers: internalCaregivers } = useCaregivers();
  const { items, loading, add, update, remove } = useShiftsCollection();

  const effectiveClients = clients ?? internalClients;
  const effectiveCaregivers = caregivers ?? internalCaregivers;

  const shifts = items.map((s) => ({
    ...s,
    clientName: effectiveClients.find((c) => c.id === s.clientId)?.fullName || s.clientName || 'Unknown client',
    caregiverName:
      effectiveCaregivers.find((c) => c.id === s.caregiverId)?.name ||
      (s.caregiverId ? s.caregiverName || 'Unknown staff' : 'Unassigned'),
  }));

  const createShift = useCallback(
    async (shiftData: Omit<Shift, 'shiftId' | 'clientName' | 'caregiverName'>) => {
      // status/hours_worked are derived by the trg_shift_status trigger
      return add({ ...shiftData, status: 'Scheduled' } as Partial<Shift>);
    },
    [add]
  );

  const clockIn = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from('shifts')
        .update({ clock_in_time: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    []
  );

  const clockOut = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from('shifts')
        .update({ clock_out_time: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    []
  );

  return {
    shifts,
    loading,
    createShift,
    updateShift: update,
    deleteShift: remove,
    clockIn,
    clockOut,
    clients: effectiveClients,
    caregivers: effectiveCaregivers,
  };
}
