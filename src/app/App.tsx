import { RouterProvider } from 'react-router-dom';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { UpdatePrompt } from '@/components/common/UpdatePrompt';
import { router } from './router';

export default function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
        <UpdatePrompt />
      </Providers>
    </ErrorBoundary>
  );
}
