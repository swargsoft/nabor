type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const configuredLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) ?? 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[configuredLevel];
}

function format(level: LogLevel, context: string, message: string): string {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] [${context}] ${message}`;
}

export function createLogger(context: string) {
  return {
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog('debug')) console.debug(format('debug', context, message), ...args);
    },
    info: (message: string, ...args: unknown[]) => {
      if (shouldLog('info')) console.info(format('info', context, message), ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(format('warn', context, message), ...args);
    },
    error: (message: string, ...args: unknown[]) => {
      if (shouldLog('error')) console.error(format('error', context, message), ...args);
    },
  };
}
