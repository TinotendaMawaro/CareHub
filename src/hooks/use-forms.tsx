"use client";

import { createCollectionHook } from './use-collection';
import { mapForm, toFormRow } from '@/lib/supabase/mappers';
import type { Form } from '@/lib/types';

const useFormsCollection = createCollectionHook<Form, Partial<Form>>({
  table: 'forms',
  map: mapForm,
  toRow: toFormRow,
  orderBy: { column: 'created_at', ascending: false },
});

export function useForms() {
  const { items, loading, error, add, update, remove } = useFormsCollection();

  return {
    forms: items,
    loading,
    error,
    addForm: add,
    updateForm: update,
    deleteForm: remove,
  };
}
