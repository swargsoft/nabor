import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function useServiceWorker() {
  const [updateReady, setUpdateReady] = useState(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateSWRef.current = registerSW({
      onNeedRefresh() {
        setUpdateReady(true);
      },
      onOfflineReady() {
        // app is ready to work offline — no UI needed
      },
    });
  }, []);

  function applyUpdate() {
    updateSWRef.current?.(true);
  }

  return { updateReady, applyUpdate };
}
