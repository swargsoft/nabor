import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';

// ─── Mock virtual:pwa-register ────────────────────────────────────────────────

type SWCallbacks = {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
};

let capturedCallbacks: SWCallbacks = {};
const mockUpdateSW = vi.fn();

vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn((callbacks: SWCallbacks) => {
    capturedCallbacks = callbacks;
    return mockUpdateSW;
  }),
}));

import { useServiceWorker } from '@/hooks/useServiceWorker';
import { UpdatePrompt } from '@/components/common/UpdatePrompt';

beforeEach(() => {
  vi.clearAllMocks();
  capturedCallbacks = {};
});

// ─── useServiceWorker ─────────────────────────────────────────────────────────

describe('useServiceWorker', () => {
  it('starts with updateReady false', () => {
    const { result } = renderHook(() => useServiceWorker());
    expect(result.current.updateReady).toBe(false);
  });

  it('sets updateReady true when onNeedRefresh fires', () => {
    const { result } = renderHook(() => useServiceWorker());
    act(() => capturedCallbacks.onNeedRefresh?.());
    expect(result.current.updateReady).toBe(true);
  });

  it('does not set updateReady on onOfflineReady', () => {
    const { result } = renderHook(() => useServiceWorker());
    act(() => capturedCallbacks.onOfflineReady?.());
    expect(result.current.updateReady).toBe(false);
  });

  it('applyUpdate calls updateSW with true', () => {
    const { result } = renderHook(() => useServiceWorker());
    act(() => result.current.applyUpdate());
    expect(mockUpdateSW).toHaveBeenCalledWith(true);
  });
});

// ─── UpdatePrompt ─────────────────────────────────────────────────────────────

describe('UpdatePrompt', () => {
  it('renders nothing when no update is ready', () => {
    render(<UpdatePrompt />);
    expect(screen.queryByText('New version available')).not.toBeInTheDocument();
  });

  it('shows snackbar when update is ready', () => {
    render(<UpdatePrompt />);
    act(() => capturedCallbacks.onNeedRefresh?.());
    expect(screen.getByText('New version available')).toBeInTheDocument();
  });

  it('calls updateSW when Update button is clicked', () => {
    render(<UpdatePrompt />);
    act(() => capturedCallbacks.onNeedRefresh?.());
    fireEvent.click(screen.getByRole('button', { name: /update/i }));
    expect(mockUpdateSW).toHaveBeenCalledWith(true);
  });
});
