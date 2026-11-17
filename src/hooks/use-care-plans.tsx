"use client";

import { createCollectionHook } from './use-collection';
import { mapCarePlan, toCarePlanRow } from '@/lib/supabase/mappers';
import type { CarePlan } from '@/lib/types';

const useCarePlansCollection = createCollectionHook<CarePlan, Partial<CarePlan>>({
  table: 'care_plans',
  map: mapCarePlan,
  toRow: toCarePlanRow,
  orderBy: { column: 'created_at', ascending: false },
});

export function useCarePlans() {
  const { items, loading, error, add, update, remove } = useCarePlansCollection();

  return {
    carePlans: items,
    loading,
    error,
    addCarePlan: add,
    updateCarePlan: update,
    deleteCarePlan: remove,
  };
}
