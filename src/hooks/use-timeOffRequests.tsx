"use client";

import { createCollectionHook } from './use-collection';
import { mapTimeOffRequest, toTimeOffRequestRow } from '@/lib/supabase/mappers';
import type { TimeOffRequest } from '@/lib/types';

const useTimeOffRequestsCollection = createCollectionHook<TimeOffRequest, Partial<TimeOffRequest>>({
  table: 'time_off_requests',
  map: mapTimeOffRequest,
  toRow: toTimeOffRequestRow,
  orderBy: { column: 'requested_at', ascending: false },
});

export function useTimeOffRequests() {
  const { items, loading, error, add, update, remove } = useTimeOffRequestsCollection();

  return {
    timeOffRequests: items,
    loading,
    error,
    addTimeOffRequest: add,
    updateTimeOffRequest: update,
    deleteTimeOffRequest: remove,
  };
}
