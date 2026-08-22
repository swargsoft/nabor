import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import WelcomePage from '@/pages/Welcome/WelcomePage';
import CreateAccountPage from '@/pages/CreateAccount/CreateAccountPage';
import RecoveryPage from '@/pages/Recovery/RecoveryPage';
import ProfilePage from '@/pages/Profile/ProfilePage';
import DiscoverPage from '@/pages/Discover/DiscoverPage';
import MatchesPage from '@/pages/Matches/MatchesPage';
import ChatPage from '@/pages/Chat/ChatPage';
import SettingsPage from '@/pages/Settings/SettingsPage';
import DevicesPage from '@/pages/Devices/DevicesPage';

export const router = createBrowserRouter([
  { path: '/', element: <WelcomePage /> },
  { path: '/create-account', element: <CreateAccountPage /> },
  { path: '/recovery', element: <RecoveryPage /> },
  { path: '/chat/:id', element: <ChatPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/profile',  element: <ProfilePage /> },
      { path: '/discover', element: <DiscoverPage /> },
      { path: '/matches',  element: <MatchesPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/devices',  element: <DevicesPage /> },
    ],
  },
]);
