"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './use-auth';
import {
  requestNotificationPermission,
  listenForNotifications,
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  clearNotifications,
} from '@/lib/notifications';
import type { Notification } from '@/lib/types';

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if ('Notification' in window) {
      setPermissionGranted(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void fetchNotifications(user.id)
      .then((rows) => {
        if (cancelled) return;
        setNotifications(rows);
        setUnreadCount(rows.filter((n) => !n.read).length);
      })
      .catch((err) => console.error('Failed to load notifications:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const unsubscribe = listenForNotifications(user.id, (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);

      if (typeof window !== 'undefined' && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.png',
        });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

  const requestPermission = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setPermissionGranted(granted);
    return granted;
  }, []);

  const markNotificationAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await markAsRead(id);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, []);

  const markAllNotificationsAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    if (!user) return;
    try {
      await markAllAsRead(user.id);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  }, [user]);

  const clearAllNotifications = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);
    if (!user) return;
    try {
      await clearNotifications(user.id);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  }, [user]);

  return {
    notifications,
    unreadCount,
    permissionGranted,
    loading,
    requestPermission,
    markAsRead: markNotificationAsRead,
    markAllAsRead: markAllNotificationsAsRead,
    clearAll: clearAllNotifications,
  };
};
