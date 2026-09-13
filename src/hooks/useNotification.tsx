import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { SessionService } from '@/services/SessionService';
import { Alert, Snackbar } from '@mui/material';

type Severity = 'success' | 'info' | 'warning' | 'error';

interface Notification {
  message: string;
  severity: Severity;
}

interface NotificationContextValue {
  notify: (message: string, severity?: Severity) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<Notification | null>(null);

  const notify = useCallback((message: string, severity: Severity = 'info') => {
    setNotification({ message, severity });
  }, []);

  const handleClose = () => setNotification(null);

  // Global P2P notifications: these work regardless of which page is open.
  useEffect(() => {
    return SessionService.onEvent((event) => {
      if (event.type === 'like_received') {
        notify(event.displayName ? `${event.displayName} liked you ❤️` : 'Someone nearby liked you ❤️', 'success');
      } else if (event.type === 'match') {
        notify(event.displayName ? `It’s a match with ${event.displayName}! 🎉` : 'It’s a match! 🎉', 'success');
      } else if (event.type === 'message_received') {
        notify('New message received 💬', 'info');
      }
    });
  }, [notify]);

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <Snackbar
        open={!!notification}
        autoHideDuration={4000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {notification ? (
          <Alert onClose={handleClose} severity={notification.severity} variant="filled">
            {notification.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}
