import { ReactNode } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme';
import { NotificationProvider } from '@/hooks/useNotification';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotificationProvider>{children}</NotificationProvider>
    </ThemeProvider>
  );
}
