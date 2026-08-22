import { Snackbar, Button } from '@mui/material';
import { useServiceWorker } from '@/hooks/useServiceWorker';

export function UpdatePrompt() {
  const { updateReady, applyUpdate } = useServiceWorker();

  return (
    <Snackbar
      open={updateReady}
      message="New version available"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      action={
        <Button color="primary" size="small" onClick={applyUpdate}>
          Update
        </Button>
      }
    />
  );
}
