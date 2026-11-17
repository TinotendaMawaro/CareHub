"use client";
import { useCallback } from 'react';

import { createCollectionHook } from './use-collection';
import { mapCostCode, toCostCodeRow } from '@/lib/supabase/mappers';
import type { CostCode } from '@/lib/types';

const useCostCodesCollection = createCollectionHook<CostCode, Partial<CostCode>>({
  table: 'cost_codes',
  map: (row) => mapCostCode(row),
  toRow: toCostCodeRow,
  orderBy: { column: 'code', ascending: true },
});

export function useCostCodes() {
  const { items, loading, error, success, add, update, remove, reload } = useCostCodesCollection();

  const activeCodes = items.filter((code) => code.active);

  return {
    costCodes: items,
    activeCodes,
    loading,
    error,
    success,
    addCostCode: add,
    updateCostCode: update,
    deleteCostCode: remove,
    reload,
  };
}
