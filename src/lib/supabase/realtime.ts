import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';

let counter = 0;

/**
 * Subscribes to postgres_changes on a table and returns an unsubscribe fn.
 *
 * The topic name must be unique per subscription. supabase.channel(name)
 * returns the existing channel when the name is already in use, and
 * removeChannel() completes asynchronously, so a fixed name collides with
 * itself on React 18 StrictMode's double-mount and .on() throws
 * "cannot add postgres_changes callbacks after subscribe()".
 */
export function subscribeToTable(
  table: string,
  handler: (payload: any) => void,
  options?: { event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE'; filter?: string }
): () => void {
  const topic = `${table}:${Date.now()}:${counter++}`;
  const channel: RealtimeChannel = supabase.channel(topic);

  channel.on(
    'postgres_changes',
    {
      event: options?.event ?? '*',
      schema: 'public',
      table,
      ...(options?.filter ? { filter: options.filter } : {}),
    },
    handler
  );
  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Fire-and-forget variant for components that only refresh on change. */
export function refreshOnChange(table: string, reload: () => void, filter?: string): () => void {
  return subscribeToTable(
    table,
    () => {
      void reload();
    },
    { filter }
  );
}
