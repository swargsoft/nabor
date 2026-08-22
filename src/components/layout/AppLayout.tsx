import { Outlet } from 'react-router-dom';
import { AppBottomNav } from './AppBottomNav';

export function AppLayout() {
  return (
    <>
      <Outlet />
      <AppBottomNav />
    </>
  );
}
