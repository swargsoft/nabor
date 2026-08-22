export interface RawPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface GeolocationOptions {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}

const DEFAULTS: GeolocationOptions = {
  enableHighAccuracy: false,
  timeoutMs: 10_000,
  maximumAgeMs: 60_000,
};

/**
 * Requests the current position once. Rejects if permission denied or timeout.
 */
export function getCurrentPosition(opts: GeolocationOptions = {}): Promise<RawPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }
    const merged = { ...DEFAULTS, ...opts };
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) => reject(new Error(err.message)),
      {
        enableHighAccuracy: merged.enableHighAccuracy,
        timeout: merged.timeoutMs,
        maximumAge: merged.maximumAgeMs,
      },
    );
  });
}

/**
 * Watches position changes. Returns an unsubscribe function.
 */
export function watchPosition(
  onPosition: (pos: RawPosition) => void,
  onError: (err: Error) => void,
  opts: GeolocationOptions = {},
): () => void {
  if (!navigator.geolocation) {
    onError(new Error('Geolocation is not supported by this browser'));
    return () => {};
  }
  const merged = { ...DEFAULTS, ...opts };
  const watchId = navigator.geolocation.watchPosition(
    (pos) =>
      onPosition({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      }),
    (err) => onError(new Error(err.message)),
    {
      enableHighAccuracy: merged.enableHighAccuracy,
      timeout: merged.timeoutMs,
      maximumAge: merged.maximumAgeMs,
    },
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
