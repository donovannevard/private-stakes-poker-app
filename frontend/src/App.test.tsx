import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { checkAccess, getSession } from './lib/api';
import { useTableStore } from './store/tableStore';

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/api')>()),
  getSession: vi.fn(),
  checkAccess: vi.fn(),
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  private listeners: Record<string, Array<(event?: { data: string }) => void>> = {};

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event?: { data: string }) => void): void {
    (this.listeners[type] ??= []).push(handler);
  }

  send(): void {}
  close(): void {}

  dispatchMessage(payload: unknown): void {
    for (const handler of this.listeners.message ?? []) {
      handler({ data: JSON.stringify(payload) });
    }
  }
}

beforeEach(() => {
  vi.mocked(checkAccess).mockResolvedValue(true);
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  useTableStore.getState().reset();
  window.history.pushState({}, '', '/');
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the home screen by default when there is no resumable session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Create Table' })).toBeInTheDocument();
  });

  it('renders the join-existing-table prompt when the URL has a table id and no session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    window.history.pushState({}, '', '/?table=abc123');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Join Table' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Table' })).not.toBeInTheDocument();
  });

  it('resumes an existing session on load, skipping the home screen entirely', async () => {
    vi.mocked(getSession).mockResolvedValue({
      tableId: 'table-1',
      playerId: 'player-1',
      nickname: 'Alice',
    });

    render(<App />);

    await waitFor(() => {
      expect(useTableStore.getState().tableId).toBe('table-1');
    });
    expect(screen.queryByRole('button', { name: 'Create Table' })).not.toBeInTheDocument();
  });

  it('shows the access gate instead of the home screen when the gate has not been passed', async () => {
    vi.mocked(checkAccess).mockResolvedValue(false);
    vi.mocked(getSession).mockResolvedValue(null);

    render(<App />);

    expect(
      await screen.findByText('Enter the access code your host gave you.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Table' })).not.toBeInTheDocument();
    // getSession must never be reached before the gate is passed.
    expect(getSession).not.toHaveBeenCalled();
  });

  it('shows final balances then goes home when the table ends on a real-money table', async () => {
    vi.mocked(getSession).mockResolvedValue({
      tableId: 'table-1',
      playerId: 'player-1',
      nickname: 'Alice',
    });

    render(<App />);
    await waitFor(() => {
      expect(useTableStore.getState().tableId).toBe('table-1');
    });
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.dispatchMessage({
      type: 'lobby',
      players: [{ playerId: 'player-1', nickname: 'Alice', isBot: false, connected: true }],
      maxSeats: 2,
      hostPlayerId: 'player-1',
      practiceMode: false,
    });
    await screen.findByText(/Waiting for players/);

    socket.dispatchMessage({
      type: 'settlement',
      netPositions: { 'player-1': 50 },
      transfers: [],
      unit: 'sats',
    });
    socket.dispatchMessage({ type: 'tableEnded' });

    expect(
      await screen.findByText('This table has ended — here are the final balances.'),
    ).toBeInTheDocument();

    screen.getByText('✕').click();

    await waitFor(() => {
      expect(useTableStore.getState().tableId).toBeNull();
    });
  });

  it('goes straight home when the table ends on a practice table with nothing to settle', async () => {
    vi.mocked(getSession).mockResolvedValue({
      tableId: 'table-1',
      playerId: 'player-1',
      nickname: 'Alice',
    });

    render(<App />);
    await waitFor(() => {
      expect(useTableStore.getState().tableId).toBe('table-1');
    });
    const socket = FakeWebSocket.instances.at(-1)!;

    socket.dispatchMessage({ type: 'tableEnded' });

    await waitFor(() => {
      expect(useTableStore.getState().tableId).toBeNull();
    });
    expect(screen.queryByText(/final balances/)).not.toBeInTheDocument();
  });

  it('shows a connection error instead of loading forever when checkAccess rejects', async () => {
    vi.mocked(checkAccess).mockRejectedValue(new Error('Failed to fetch'));

    render(<App />);

    expect(
      await screen.findByText('Could not reach the server. Is it running?'),
    ).toBeInTheDocument();
  });

  it('shows a connection error instead of loading forever when getSession rejects', async () => {
    vi.mocked(getSession).mockRejectedValue(new Error('Failed to fetch'));

    render(<App />);

    expect(
      await screen.findByText('Could not reach the server. Is it running?'),
    ).toBeInTheDocument();
  });
});
