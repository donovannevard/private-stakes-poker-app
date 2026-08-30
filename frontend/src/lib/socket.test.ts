import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectToTable, type TableConnectionHandlers } from './socket';

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

  close(): void {
    this.dispatch('close');
  }

  dispatch(type: string): void {
    for (const handler of this.listeners[type] ?? []) {
      handler();
    }
  }

  dispatchMessage(payload: unknown): void {
    for (const handler of this.listeners.message ?? []) {
      handler({ data: JSON.stringify(payload) });
    }
  }
}

function handlers(overrides: Partial<TableConnectionHandlers> = {}): TableConnectionHandlers {
  return {
    onSnapshot: vi.fn(),
    onLobby: vi.fn(),
    onChat: vi.fn(),
    onError: vi.fn(),
    onSettlement: vi.fn(),
    onSettlementError: vi.fn(),
    onOpen: vi.fn(),
    onDisconnect: vi.fn(),
    onKicked: vi.fn(),
    onTableEnded: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connectToTable', () => {
  it('calls onDisconnect when the socket closes without close() being called', () => {
    const onDisconnect = vi.fn();
    connectToTable('table-1', handlers({ onDisconnect }));

    FakeWebSocket.instances[0]!.dispatch('close');

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does not call onDisconnect when close() was called intentionally', () => {
    const onDisconnect = vi.fn();
    const connection = connectToTable('table-1', handlers({ onDisconnect }));

    connection.close();

    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('calls onOpen when the socket opens', () => {
    const onOpen = vi.fn();
    connectToTable('table-1', handlers({ onOpen }));

    FakeWebSocket.instances[0]!.dispatch('open');

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onKicked when a kicked message arrives', () => {
    const onKicked = vi.fn();
    connectToTable('table-1', handlers({ onKicked }));

    FakeWebSocket.instances[0]!.dispatchMessage({ type: 'kicked' });

    expect(onKicked).toHaveBeenCalledTimes(1);
  });

  it('sends a kick message with the target player id', () => {
    const connection = connectToTable('table-1', handlers());
    const sendSpy = vi.spyOn(FakeWebSocket.instances[0]!, 'send' as never);

    connection.sendKick('player-2');

    expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ type: 'kick', playerId: 'player-2' }));
  });

  it('calls onTableEnded when a tableEnded message arrives', () => {
    const onTableEnded = vi.fn();
    connectToTable('table-1', handlers({ onTableEnded }));

    FakeWebSocket.instances[0]!.dispatchMessage({ type: 'tableEnded' });

    expect(onTableEnded).toHaveBeenCalledTimes(1);
  });

  it('sends a cancelTable message', () => {
    const connection = connectToTable('table-1', handlers());
    const sendSpy = vi.spyOn(FakeWebSocket.instances[0]!, 'send' as never);

    connection.cancelTable();

    expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ type: 'cancelTable' }));
  });
});
