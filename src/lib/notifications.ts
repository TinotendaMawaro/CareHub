import { getMessaging, getToken } from 'firebase/messaging';
import { messaging } from './firebase/client';
import { getFirestore, collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { app } from './firebase/client';
import type { Notification, Shift, IncidentReport } from './types';

const db = getFirestore(app);

// VAPID key from Firebase console
const VAPID_KEY = 'BF2Bw1LNL00JeWuJw1PgWP2B0TgPbdeCAOb0TevwfJStWLxYNAPLMpbA2heDS3vvY7hBewCaoPh6H_VT0Meb2F4';

// Request notification permission and get token
export const requestNotificationPermission = async (): Promise<string | null> => {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      return token;
    }
    return null;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return null;
  }
};

// Send notification to admin (server-side function would handle this)
export const sendNotification = async (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
  // This would typically be called from a server-side function
  // For now, we'll store it locally and show it in the UI
  const newNotification: Notification = {
    ...notification,
    id: Date.now().toString(),
    timestamp: new Date(),
    read: false,
  };

  // Store in localStorage for demo purposes
  const existing = JSON.parse(localStorage.getItem('notifications') || '[]');
  existing.unshift(newNotification);
  localStorage.setItem('notifications', JSON.stringify(existing));

  // Trigger notification if permission granted
  if (Notification.permission === 'granted') {
    new Notification(notification.title, {
      body: notification.message,
      icon: '/favicon.ico',
    });
  }

  return newNotification;
};

// Listen for shift status changes
export const listenForShiftChanges = (callback: (notification: Notification) => void) => {
  const shiftsRef = collection(db, 'shifts');
  const q = query(shiftsRef, orderBy('date', 'desc'));

  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'modified') {
        const shift = { id: change.doc.id, ...change.doc.data() } as Shift;
        const oldShift = change.oldIndex !== -1 ? snapshot.docs[change.oldIndex]?.data() as Shift : null;

        if (oldShift && oldShift.status !== shift.status) {
          let title = '';
          let message = '';

          switch (shift.status) {
            case 'In Progress':
              title = 'Shift Started';
              message = `Caregiver has started their shift with ${shift.clientId}`;
              break;
            case 'Completed':
              title = 'Shift Completed';
              message = `Caregiver has completed their shift with ${shift.clientId}`;
              break;
            case 'Cancelled':
              title = 'Shift Cancelled';
              message = `Shift with ${shift.clientId} has been cancelled`;
              break;
          }

          if (title && message) {
            sendNotification({
              title,
              message,
              type: 'shift',
              data: shift,
            }).then(callback);
          }
        }
      }
    });
  });
};

// Listen for new incident reports
export const listenForIncidents = (callback: (notification: Notification) => void) => {
  const incidentsRef = collection(db, 'incidents');
  const q = query(incidentsRef, orderBy('date', 'desc'));

  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const incident = { id: change.doc.id, ...change.doc.data() } as IncidentReport;

        sendNotification({
          title: 'New Incident Report',
          message: `A ${incident.severity} severity incident has been reported`,
          type: 'incident',
          data: incident,
        }).then(callback);
      }
    });
  });
};

// Listen for shift notes updates
export const listenForShiftNotes = (callback: (notification: Notification) => void) => {
  const notesRef = collection(db, 'shiftNotes');
  const q = query(notesRef, orderBy('timestamp', 'desc'));

  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const note = { id: change.doc.id, ...change.doc.data() };

        sendNotification({
          title: 'New Shift Note',
          message: `A new shift note has been added`,
          type: 'note',
          data: note,
        }).then(callback);
      }
    });
  });
};

// Listen for reports updates
export const listenForReports = (callback: (notification: Notification) => void) => {
  const reportsRef = collection(db, 'reports');
  const q = query(reportsRef, orderBy('generatedAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const report = { id: change.doc.id, ...change.doc.data() };

        sendNotification({
          title: 'New Report Generated',
          message: `A new report is available`,
          type: 'report',
          data: report,
        }).then(callback);
      }
    });
  });
};

// Get stored notifications
export const getStoredNotifications = (): Notification[] => {
  const stored = localStorage.getItem('notifications');
  if (stored) {
    return JSON.parse(stored).map((n: any) => ({
      ...n,
      timestamp: new Date(n.timestamp),
    }));
  }
  return [];
};

// Mark notification as read
export const markAsRead = (notificationId: string) => {
  const notifications = getStoredNotifications();
  const updated = notifications.map(n =>
    n.id === notificationId ? { ...n, read: true } : n
  );
  localStorage.setItem('notifications', JSON.stringify(updated));
};

// Clear all notifications
export const clearNotifications = () => {
  localStorage.removeItem('notifications');
};
