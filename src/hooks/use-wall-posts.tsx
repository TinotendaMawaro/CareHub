"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { refreshOnChange } from '@/lib/supabase/realtime';
import { mapWallPost, toWallPostRow } from '@/lib/supabase/mappers';
import type { WallPost } from '@/lib/types';

export function useWallPosts() {
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('wall_posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) throw err;
    setPosts((data ?? []).map(mapWallPost));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .then(() => setError(null))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load wall posts'))
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsub = refreshOnChange('wall_posts', load);
    return () => {
      active = false;
      unsub();
    };
  }, [load]);

  const addPost = useCallback(async (post: Omit<WallPost, 'id' | 'createdAt' | 'updatedAt'>) => {
    setError(null);
    const { data, error: err } = await supabase
      .from('wall_posts')
      .insert(toWallPostRow(post))
      .select()
      .single();
    if (err) {
      setError(err.message);
      throw err;
    }
    if (data) setPosts((prev) => [mapWallPost(data), ...prev]);
    return data;
  }, []);

  const updatePost = useCallback(async (id: string, changes: Partial<WallPost>) => {
    setError(null);
    const { data, error: err } = await supabase
      .from('wall_posts')
      .update(toWallPostRow(changes))
      .eq('id', id)
      .select()
      .single();
    if (err) {
      setError(err.message);
      throw err;
    }
    if (data) setPosts((prev) => prev.map((p) => (p.id === id ? mapWallPost(data) : p)));
    return data;
  }, []);

  const deletePost = useCallback(async (id: string) => {
    setError(null);
    const { error: err } = await supabase.from('wall_posts').delete().eq('id', id);
    if (err) {
      setError(err.message);
      throw err;
    }
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { posts, loading, error, addPost, updatePost, deletePost };
}
