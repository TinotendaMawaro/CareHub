"use client";

import { createCollectionHook } from './use-collection';
import { mapAssessment, toAssessmentRow } from '@/lib/supabase/mappers';
import type { Assessment } from '@/lib/types';

const useAssessmentsCollection = createCollectionHook<Assessment, Partial<Assessment>>({
  table: 'assessments',
  map: mapAssessment,
  toRow: toAssessmentRow,
  orderBy: { column: 'created_at', ascending: false },
});

export function useAssessment() {
  const { items, loading, error, add, update, remove } = useAssessmentsCollection();

  return {
    assessments: items,
    loading,
    error,
    addAssessment: add,
    updateAssessment: update,
    deleteAssessment: remove,
  };
}
