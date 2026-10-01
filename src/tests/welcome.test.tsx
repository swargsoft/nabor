import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock identity so the page renders its unauthenticated state ──────────────

vi.mock('@/hooks/useIdentity', () => ({
  useIdentity: () => ({
    status: 'unauthenticated',
    identity: null,
    createIdentity: vi.fn(),
    deleteIdentity: vi.fn(),
  }),
}));

import WelcomePage from '@/pages/Welcome/WelcomePage';

describe('WelcomePage', () => {
  it('renders the brand logo from /public (public/nabor-logo.png)', () => {
    render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>,
    );

    expect(screen.getByAltText('Nabor')).toHaveAttribute('src', '/nabor-logo.png');
  });

  it('renders the hero copy and both calls to action', () => {
    render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Meet people nearby.');
    expect(screen.getByRole('button', { name: /create your profile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /i already have an account/i })).toBeInTheDocument();
  });
});
