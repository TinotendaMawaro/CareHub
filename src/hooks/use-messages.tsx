"use client";

import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
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

    // Query for messages where user is sender or recipient
    const q = query(
      collection(db, 'messages'),
      where('senderId', '==', userId),
      orderBy('timestamp', 'desc')
    );

    const q2 = query(
      collection(db, 'messages'),
      where('recipientId', '==', userId),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe1 = onSnapshot(q, (querySnapshot) => {
      const messagesData: Message[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        messagesData.push({
          id: doc.id,
          senderId: data.senderId,
          recipientId: data.recipientId,
          content: data.content,
          timestamp: data.timestamp.toDate(),
          read: data.read,
          type: data.type,
          groupId: data.groupId,
        } as Message);
      });
      setMessages(prev => [...prev, ...messagesData]);
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    const unsubscribe2 = onSnapshot(q2, (querySnapshot) => {
      const messagesData: Message[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        messagesData.push({
          id: doc.id,
          senderId: data.senderId,
          recipientId: data.recipientId,
          content: data.content,
          timestamp: data.timestamp.toDate(),
          read: data.read,
          type: data.type,
          groupId: data.groupId,
        } as Message);
      });
      setMessages(prev => [...prev, ...messagesData]);
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [userId]);

  const sendMessage = async (messageData: Omit<Message, 'id' | 'timestamp'>) => {
    try {
      setError(null);
      await addDoc(collection(db, 'messages'), {
        ...messageData,
        timestamp: new Date(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      throw err;
    }
  };

  const markAsRead = async (id: string) => {
    try {
      setError(null);
      const messageRef = doc(db, 'messages', id);
      await updateDoc(messageRef, { read: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark message as read');
      throw err;
    }
  };

  return {
    messages,
    loading,
    error,
    sendMessage,
    markAsRead,
  };
}
