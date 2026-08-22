import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger } from '@/utils/logger';

describe('createLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('creates a logger with the given context', () => {
    const logger = createLogger('TestContext');
    expect(logger).toHaveProperty('debug');
    expect(logger).toHaveProperty('info');
    expect(logger).toHaveProperty('warn');
    expect(logger).toHaveProperty('error');
  });

  it('calls console.error on error()', () => {
    const logger = createLogger('TestContext');
    logger.error('test error');
    expect(console.error).toHaveBeenCalled();
  });

  it('calls console.warn on warn()', () => {
    const logger = createLogger('TestContext');
    logger.warn('test warn');
    expect(console.warn).toHaveBeenCalled();
  });
});
