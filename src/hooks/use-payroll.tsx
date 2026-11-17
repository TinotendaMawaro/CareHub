"use client";

import { createCollectionHook } from './use-collection';
import { mapPayroll, toPayrollRow } from '@/lib/supabase/mappers';
import type { Payroll } from '@/lib/types';

const usePayrollCollection = createCollectionHook<Payroll, Partial<Payroll>>({
  table: 'payrolls',
  map: mapPayroll,
  toRow: toPayrollRow,
  orderBy: { column: 'created_at', ascending: false },
});

export function usePayroll() {
  const { items, loading, error, add, update, remove } = usePayrollCollection();

  return {
    payrolls: items,
    loading,
    error,
    addPayroll: add,
    updatePayroll: update,
    deletePayroll: remove,
  };
}
