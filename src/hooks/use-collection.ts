"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { refreshOnChange } from '@/lib/supabase/realtime';
import { useAuth } from './use-auth';

type CollectionOptions<T, TWrite> = {
  table: string;
  /** Realtime/select row -> app type */
  map: (row: any) => T;
  /** App payload -> database row */
  toRow: (data: TWrite) => Record<string, unknown>;
  orderBy?: { column: string; ascending?: boolean };
  /** PostgREST select list, e.g. "*, shift_workers(caregiver_id)". Defaults to "*". */
  select?: string;
  /** Extra filters applied to the select */
  scope?: (query: any) => any;
  /** Create payload may differ from the update payload */
  toCreateRow?: (data: TWrite) => Record<string, unknown>;
  /** Called with the inserted row so callers can capture the new id */
  onCreated?: (row: any) => void;
  successMessages?: { add?: string; update?: string; delete?: string };
  /** Soft delete instead of a hard DELETE */
  softDeleteRow?: Record<string, unknown>;
};

const pendingRequests = new Map<string, Promise<any[]>>();

const CACHE_TTL_MS = 30_000;
const readCache = <T>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
};

const writeCache = <T>(key: string, data: T) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // ignore quota errors
  }
};

/**
 * Builds a Supabase-backed CRUD hook with a realtime subscription, replacing the
 * per-collection onSnapshot/addDoc/updateDoc/deleteDoc boilerplate.
 */
export function createCollectionHook<T, TWrite = Partial<T>>(
  options: CollectionOptions<T, TWrite>
) {
  const {
    table,
    map,
    toRow,
    toCreateRow,
    orderBy,
    select,
    scope,
    onCreated,
    successMessages = {},
    softDeleteRow,
  } = options;

  return function useCollection(enabled = true) {
    const { user } = useAuth();
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const flash = useCallback((message?: string) => {
      if (!message) return;
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    }, []);

    const load = useCallback(async () => {
      if (pendingRequests.has(table)) {
        const data = await pendingRequests.get(table)!;
        setItems(data.map(map));
        return;
      }

      const cacheKey = `carehub:cache:${user?.id ?? 'anon'}:${table}`;
      const cached = readCache<any[]>(cacheKey);
      if (cached) {
        setItems(cached.map(map));
        setLoading(false);
      }

      const request = (async () => {
        let builder = supabase.from(table).select(select ?? '*');
        if (scope) builder = scope(builder);
        if (orderBy) {
          builder = builder.order(orderBy.column, {
            ascending: orderBy.ascending ?? false,
          });
        }

        const { data, error: err } = await builder;
        if (err) throw err;
        const rows = (data ?? []) as any[];
        writeCache(cacheKey, rows); // raw rows: mapped objects hold Dates that JSON would turn into strings
        return rows;
      })();

      pendingRequests.set(table, request);
      try {
        const result = await request;
        setItems(result.map(map));
      } finally {
        pendingRequests.delete(table);
      }
    }, [table, map, orderBy, scope, user?.id]);

    useEffect(() => {
      if (!user || !enabled) {
        setLoading(false);
        return;
      }

      void (async () => {
        try {
          await load();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : `Failed to load ${table}`);
        } finally {
          setLoading(false);
        }
      })();

      return refreshOnChange(table, load);
    }, [user, enabled, table, load]);

    const add = useCallback(
      async (data: TWrite): Promise<string | null> => {
        setError(null);
        const { data: row, error: err } = await supabase
          .from(table)
          .insert((toCreateRow ?? toRow)(data))
          .select()
          .single();
        if (err) {
          setError(err.message);
          throw err;
        }
        onCreated?.(row);
        flash(successMessages.add);
        return row?.id ?? null;
      },
      [table, toRow, toCreateRow, flash, onCreated, successMessages.add]
    );

    const update = useCallback(
      async (id: string, data: TWrite) => {
        setError(null);
        const { error: err } = await supabase
          .from(table)
          .update(toRow(data))
          .eq('id', id);
        if (err) {
          setError(err.message);
          throw err;
        }
        flash(successMessages.update);
      },
      [table, toRow, flash, successMessages.update]
    );

    const remove = useCallback(
      async (id: string) => {
        setError(null);
        const { error: err } = softDeleteRow
          ? await supabase.from(table).update(softDeleteRow).eq('id', id)
          : await supabase.from(table).delete().eq('id', id);
        if (err) {
          setError(err.message);
          throw err;
        }
        flash(successMessages.delete);
      },
      [table, softDeleteRow, flash, successMessages.delete]
    );

    return {
      items,
      loading,
      error,
      success,
      add,
      update,
      remove,
      setItems,
      reload: load,
    };
  };
}
