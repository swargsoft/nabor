export const env = {
  appName: import.meta.env.VITE_APP_NAME as string,
  appVersion: import.meta.env.VITE_APP_VERSION as string,
  logLevel: import.meta.env.VITE_LOG_LEVEL as string,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;
