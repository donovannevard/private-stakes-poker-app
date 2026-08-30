import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { joinTable } from '../lib/api';
import { useTableStore } from '../store/tableStore';
import { JoinExistingTableScreen } from './JoinExistingTableScreen';

vi.mock('../lib/api', () => ({
  joinTable: vi.fn(),
}));

afterEach(() => {
  useTableStore.getState().reset();
});

describe('JoinExistingTableScreen', () => {
  it('joins the given table with the entered nickname', async () => {
    vi.mocked(joinTable).mockResolvedValue({ tableId: 'table-1', playerId: 'player-1' });
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <JoinExistingTableScreen tableId="table-1" />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText('Your nickname'), {
      target: { value: 'Carol' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join Table' }));

    await waitFor(() => {
      expect(useTableStore.getState().tableId).toBe('table-1');
    });
    expect(joinTable).toHaveBeenCalledWith('table-1', 'Carol', undefined);
    expect(useTableStore.getState().nickname).toBe('Carol');
  });
});
