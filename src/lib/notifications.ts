import { supabase } from './supabase/client';
import { subscribeToTable } from './supabase/realtime';
import { mapNotification } from './supabase/mappers';
import type { Notification } from './types';

/** VAPID public key, for Web Push when configured in Supabase. */
const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

/**
 * FCM push is replaced by Supabase Realtime: notifications are rows in
 * public.notifications, and this subscribes to inserts for the current user.
 *
 * The filter keeps each admin's channel to their own rows. The topic name is
 * unique per subscription, see subscribeToTable for why.
 */
export const listenForNotifications = (
  userId: string,
  callback: (notification: Notification) => void
): (() => void) =>
  subscribeToTable(
    'notifications',
    (payload) => {
      if (payload?.new?.user_id && payload.new.user_id !== userId) return;
      callback(mapNotification(payload.new));
    },
    { event: 'INSERT', filter: `user_id=eq.${userId}` }
  );

export const fetchNotifications = async (userId: string): Promise<Notification[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []).map(mapNotification);
};

export const markAsRead = async (id: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id);
  if (error) throw error;
};

export const markAllAsRead = async (userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
};

export const clearNotifications = async (userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
};

export { VAPID_KEY };
