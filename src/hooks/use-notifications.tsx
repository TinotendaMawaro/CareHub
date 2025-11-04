"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Notification } from '@/lib/types';
import {
  requestNotificationPermission,
  listenForShiftChanges,
  listenForIncidents,
  listenForShiftNotes,
  listenForReports,
  getStoredNotifications,
  markAsRead,
  clearNotifications,
} from '@/lib/notifications';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // Load stored notifications on mount
  useEffect(() => {
    const stored = getStoredNotifications();
    setNotifications(stored);
    setUnreadCount(stored.filter(n => !n.read).length);
  }, []);

  // Check notification permission
  useEffect(() => {
    if ('Notification' in window) {
      setPermissionGranted(Notification.permission === 'granted');
    }
  }, []);

  // Set up listeners for real-time notifications
  useEffect(() => {
    const handleNewNotification = (notification: Notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    // Set up listeners (these would be active when Firestore is connected)
    const unsubscribers: (() => void)[] = [
      listenForShiftChanges(handleNewNotification),
      listenForIncidents(handleNewNotification),
      listenForShiftNotes(handleNewNotification),
      listenForReports(handleNewNotification),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub?.());
    };
  }, []);

  const requestPermission = useCallback(async () => {
    const token = await requestNotificationPermission();
    if (token) {
      setPermissionGranted(true);
      return true;
    }
    return false;
  }, []);

  const markNotificationAsRead = useCallback((id: string) => {
    markAsRead(id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
    setUnreadCount(0);

    // Update localStorage
    const existing = JSON.parse(localStorage.getItem('notifications') || '[]');
    const updated = existing.map((n: Notification) => ({ ...n, read: true }));
    localStorage.setItem('notifications', JSON.stringify(updated));
  }, []);

  const clearAllNotifications = useCallback(() => {
    clearNotifications();
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Demo function to add test notifications
  const addTestNotification = useCallback((type: Notification['type']) => {
    const testNotifications = {
      shift: {
        title: 'Shift Started',
        message: 'Caregiver Alice Johnson has started their shift',
        type: 'shift' as const,
      },
      incident: {
        title: 'New Incident Report',
        message: 'A Medium severity incident has been reported',
        type: 'incident' as const,
      },
      note: {
        title: 'New Shift Note',
        message: 'A new shift note has been added',
        type: 'note' as const,
      },
      report: {
        title: 'New Report Generated',
        message: 'A new caregiver hours report is available',
        type: 'report' as const,
      },
    };

    const notification = testNotifications[type];
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false,
    };

    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);

    // Store in localStorage
    const existing = JSON.parse(localStorage.getItem('notifications') || '[]');
    existing.unshift(newNotification);
    localStorage.setItem('notifications', JSON.stringify(existing));

    // Show browser notification if permission granted
    if (permissionGranted) {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
      });
    }
  }, [permissionGranted]);

  return {
    notifications,
    unreadCount,
    permissionGranted,
    requestPermission,
    markAsRead: markNotificationAsRead,
    markAllAsRead,
    clearAll: clearAllNotifications,
    addTestNotification,
  };
};
