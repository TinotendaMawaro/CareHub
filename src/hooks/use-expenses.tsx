"use client";

import { createCollectionHook } from './use-collection';
import { mapExpense, toExpenseRow } from '@/lib/supabase/mappers';
import type { Expense } from '@/lib/types';

const useExpensesCollection = createCollectionHook<Expense, Partial<Expense>>({
  table: 'expenses',
  map: mapExpense,
  toRow: toExpenseRow,
  orderBy: { column: 'created_at', ascending: false },
});

export function useExpenses() {
  const { items, loading, error, add, update, remove } = useExpensesCollection();

  return {
    expenses: items,
    loading,
    error,
    addExpense: add,
    updateExpense: update,
    deleteExpense: remove,
  };
}
