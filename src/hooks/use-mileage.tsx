"use client";

import { createCollectionHook } from './use-collection';
import { mapMileage, toMileageRow } from '@/lib/supabase/mappers';
import type { Mileage } from '@/lib/types';

const useMileageCollection = createCollectionHook<Mileage, Partial<Mileage>>({
  table: 'mileage',
  map: mapMileage,
  toRow: toMileageRow,
  orderBy: { column: 'created_at', ascending: false },
});

export function useMileage() {
  const { items, loading, error, add, update, remove } = useMileageCollection();

  return {
    mileage: items,
    loading,
    error,
    addMileage: add,
    updateMileage: update,
    deleteMileage: remove,
  };
}
