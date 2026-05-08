import React, { createContext, useState, useEffect, ReactNode, useContext, useCallback } from 'react';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'critical';
  read: boolean;
  safeId: string;
  createdAt: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAllAsRead: () => void;
  markAsRead: (id: string) => void;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Mock initial data
const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    title: 'Signature Required',
    message: 'A new transaction proposal requires your signature.',
    type: 'warning',
    read: false,
    safeId: 'safe-1',
    createdAt: new Date().toISOString(),
  }
];

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(MOCK_NOTIFICATIONS);

  // Request browser notification permissions
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Simulated polling for new notifications via backend
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate receiving a critical recovery alert occasionally
      if (Math.random() > 0.8) {
        const newNotif: AppNotification = {
          id: `notif-${Date.now()}`,
          title: 'Recovery Triggered!',
          message: 'A recovery process has been initiated on Safe 2.',
          type: 'critical',
          read: false,
          safeId: 'safe-2',
          createdAt: new Date().toISOString(),
        };

        setNotifications(prev => [newNotif, ...prev]);

        // Browser Push Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(newNotif.title, { body: newNotif.message });
        }

        // Sound Alert for critical events
        try {
          const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
          audio.play().catch(() => {}); // Catch error if browser blocks autoplay
        } catch (e) {}
      }
    }, 20000);

    return () => clearInterval(interval);
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllAsRead, markAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
};