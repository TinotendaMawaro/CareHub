"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { refreshOnChange } from '@/lib/supabase/realtime';
import { mapMessage } from '@/lib/supabase/mappers';
import type { Message } from '@/lib/types';

export function useMessages(userId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      // PostgREST needs a single .or() to match sender OR recipient; RLS also
      // scopes rows to the current user.
      const { data, error: err } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order('timestamp', { ascending: false });
      if (err) throw err;
      setMessages((data ?? []).map(mapMessage));
    };

    void load()
      .then(() => setError(null))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load messages'))
      .finally(() => setLoading(false));

    return refreshOnChange('messages', load);
  }, [userId]);

  const sendMessage = useCallback(
    async (messageData: Omit<Message, 'id' | 'timestamp'>) => {
      setError(null);
      const { error: err } = await supabase.from('messages').insert({
        sender_id: messageData.senderId,
        recipient_id: messageData.recipientId || null,
        content: messageData.content,
        type: messageData.type ?? 'text',
        group_id: messageData.groupId ?? null,
        timestamp: new Date().toISOString(),
      });
      if (err) {
        setError(err.message);
        throw err;
      }
    },
    []
  );

  const markAsRead = useCallback(async (id: string) => {
    setError(null);
    const { error: err } = await supabase
      .from('messages')
      .update({ read: true })
      .eq('id', id);
    if (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return { messages, loading, error, sendMessage, markAsRead };
}
