import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import ExploreIcon from '@mui/icons-material/Explore';
import FavoriteIcon from '@mui/icons-material/Favorite';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { label: 'Discover', icon: <ExploreIcon />, path: '/discover' },
  { label: 'Matches',  icon: <FavoriteIcon />, path: '/matches' },
  { label: 'Profile',  icon: <PersonIcon />,   path: '/profile' },
  { label: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

export function AppBottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const value = NAV_ITEMS.findIndex((item) => pathname.startsWith(item.path));

  return (
    <Paper
      sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1200 }}
      elevation={3}
    >
      <BottomNavigation
        value={value === -1 ? false : value}
        onChange={(_, idx) => navigate(NAV_ITEMS[idx].path)}
        showLabels
      >
        {NAV_ITEMS.map((item) => (
          <BottomNavigationAction
            key={item.path}
            label={item.label}
            icon={item.icon}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
