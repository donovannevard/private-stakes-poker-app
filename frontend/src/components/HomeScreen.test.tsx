import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTable } from '../lib/api';
import { useTableStore } from '../store/tableStore';
import { HomeScreen } from './HomeScreen';

vi.mock('../lib/api', () => ({
  createTable: vi.fn(),
}));

afterEach(() => {
  useTableStore.getState().reset();
  window.history.pushState({}, '', '/');
  vi.clearAllMocks();
});

function renderHomeScreen() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

describe('HomeScreen', () => {
  it('creates a single-player table (bots filling every other seat) by default', async () => {
    vi.mocked(createTable).mockResolvedValue({ tableId: 'table-1', playerId: 'player-1' });

    renderHomeScreen();
    fireEvent.change(screen.getByPlaceholderText('Your nickname'), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Table' }));

    await waitFor(() => {
      expect(useTableStore.getState().tableId).toBe('table-1');
    });
    expect(vi.mocked(createTable).mock.calls[0]?.[0]).toEqual({
      nickname: 'Alice',
      maxSeats: 6,
      botCount: 5,
      smallBlind: 1,
      bigBlind: 2,
      startingStack: 200,
      turnTimeoutSeconds: null,
      lightningAddress: undefined,
    });
  });

  it('does not show lightning address or funds confirmation in single-player mode', () => {
    renderHomeScreen();

    expect(screen.queryByText('Lightning address (optional)')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('creates a multiplayer table with empty seats and the chosen settings', async () => {
    vi.mocked(createTable).mockResolvedValue({ tableId: 'table-2', playerId: 'player-2' });

    renderHomeScreen();
    fireEvent.change(screen.getByPlaceholderText('Your nickname'), {
      target: { value: 'Bob' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), {
      target: { value: 'multi' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Seats' }), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Small blind'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Big blind'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Starting stack'), { target: { value: '500' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Turn timer' }), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@walletprovider.com'), {
      target: { value: 'bob@wallet.com' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Table' }));

    await waitFor(() => {
      expect(useTableStore.getState().tableId).toBe('table-2');
    });
    expect(vi.mocked(createTable).mock.calls[0]?.[0]).toEqual({
      nickname: 'Bob',
      maxSeats: 4,
      botCount: 0,
      smallBlind: 5,
      bigBlind: 10,
      startingStack: 500,
      turnTimeoutSeconds: 30,
      lightningAddress: 'bob@wallet.com',
    });
  });

  it('disables Create Table until a nickname is entered', () => {
    renderHomeScreen();
    expect(screen.getByRole('button', { name: 'Create Table' })).toBeDisabled();
  });

  it('keeps Create Table disabled until funds are confirmed, in multiplayer mode only', () => {
    renderHomeScreen();
    fireEvent.change(screen.getByPlaceholderText('Your nickname'), {
      target: { value: 'Bob' },
    });
    expect(screen.getByRole('button', { name: 'Create Table' })).toBeEnabled(); // single-player: no funds gate

    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), {
      target: { value: 'multi' },
    });
    expect(screen.getByRole('button', { name: 'Create Table' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Create Table' })).toBeEnabled();
  });
});
