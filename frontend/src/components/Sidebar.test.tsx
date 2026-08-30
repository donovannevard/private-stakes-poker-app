import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('shows "Leave table" for a non-host and calls onLeave when clicked', () => {
    const onLeave = vi.fn();
    render(
      <Sidebar
        chatLog={[]}
        onSendChat={vi.fn()}
        isHost={false}
        canLeave={true}
        practiceMode={false}
        onLeave={onLeave}
        onCancelTable={vi.fn()}
        onOpenSettlement={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Leave table' }));

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Cancel table' })).not.toBeInTheDocument();
  });

  it('shows "Cancel table" for the host instead, and calls onCancelTable when clicked', () => {
    const onCancelTable = vi.fn();
    render(
      <Sidebar
        chatLog={[]}
        onSendChat={vi.fn()}
        isHost={true}
        canLeave={true}
        practiceMode={false}
        onLeave={vi.fn()}
        onCancelTable={onCancelTable}
        onOpenSettlement={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel table' }));

    expect(onCancelTable).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Leave table' })).not.toBeInTheDocument();
  });

  it('disables "Leave table" for a non-host when canLeave is false', () => {
    render(
      <Sidebar
        chatLog={[]}
        onSendChat={vi.fn()}
        isHost={false}
        canLeave={false}
        practiceMode={false}
        onLeave={vi.fn()}
        onCancelTable={vi.fn()}
        onOpenSettlement={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Leave table' })).toBeDisabled();
  });

  it('hides "Settle up" in practice mode', () => {
    render(
      <Sidebar
        chatLog={[]}
        onSendChat={vi.fn()}
        isHost={false}
        canLeave={true}
        practiceMode={true}
        onLeave={vi.fn()}
        onCancelTable={vi.fn()}
        onOpenSettlement={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Settle up' })).not.toBeInTheDocument();
  });
});
