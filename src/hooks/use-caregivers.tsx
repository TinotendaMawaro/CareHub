"use client";

import { createCollectionHook } from './use-collection';
import { mapCaregiver, toCaregiverRow } from '@/lib/supabase/mappers';
import type { Caregiver } from '@/lib/types';

const useCaregiversCollection = createCollectionHook<Caregiver, Partial<Caregiver>>({
  table: 'caregivers',
  map: mapCaregiver,
  toRow: toCaregiverRow,
  orderBy: { column: 'name', ascending: true },
});

export function useCaregivers() {
  const { items, loading, error, add, update, remove } = useCaregiversCollection();

  return {
    caregivers: items,
    loading,
    error,
    addCaregiver: add,
    updateCaregiver: update,
    deleteCaregiver: remove,
  };
}
