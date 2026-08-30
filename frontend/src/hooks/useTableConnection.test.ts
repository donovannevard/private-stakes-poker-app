import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTableConnection } from './useTableConnection';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  private listeners: Record<string, Array<() => void>> = {};

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: () => void): void {
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
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useTableConnection reconnect behavior', () => {
  it('reconnects after an unexpected close', () => {
    renderHook(() => useTableConnection('table-1'));
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]!.dispatch('close'); // nobody called .close() — unexpected
    vi.advanceTimersByTime(1500);

    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('does not reconnect once the table id is cleared (an intentional close)', () => {
    const { rerender } = renderHook(({ tableId }) => useTableConnection(tableId), {
      initialProps: { tableId: 'table-1' as string | null },
    });
    expect(FakeWebSocket.instances).toHaveLength(1);

    rerender({ tableId: null }); // cleanup closes the connection intentionally

    vi.advanceTimersByTime(5000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
