"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './use-auth';
import { refreshOnChange } from '@/lib/supabase/realtime';
import { mapLocation } from '@/lib/supabase/mappers';
import type { Location } from '@/lib/types';

export function useLocations() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const load = async () => {
      const { data, error: err } = await supabase
        .from('locations')
        .select('*')
        .order('timestamp', { ascending: false });
      if (err) throw err;
      setLocations((data ?? []).map(mapLocation));
    };

    void load()
      .then(() => setError(null))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load locations'))
      .finally(() => setLoading(false));

    return refreshOnChange('locations', load);
  }, [user]);

  const addLocation = useCallback(
    async (locationData: Omit<Location, 'id'>) => {
      setError(null);
      const { error: err } = await supabase.from('locations').insert({
        caregiver_id: locationData.caregiverId,
        lat: locationData.latitude,
        lng: locationData.longitude,
        accuracy: locationData.accuracy ?? null,
      });
      if (err) {
        setError(err.message);
        throw err;
      }
    },
    []
  );

  const updateLocation = useCallback(async (id: string, locationData: Partial<Location>) => {
    setError(null);
    const patch: Record<string, unknown> = {};
    if (locationData.accuracy !== undefined) patch.accuracy = locationData.accuracy;
    if (locationData.latitude !== undefined && locationData.longitude !== undefined) {
      patch.lat = locationData.latitude;
      patch.lng = locationData.longitude;
    }
    const { error: err } = await supabase
      .from('locations')
      .update(patch)
      .eq('id', id);
    if (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return { locations, loading, error, addLocation, updateLocation };
}
