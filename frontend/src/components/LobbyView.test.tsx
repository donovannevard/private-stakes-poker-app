import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LobbyView } from './LobbyView';

describe('LobbyView', () => {
  it('renders the roster, marking the current player, bots, and disconnected players', () => {
    render(
      <LobbyView
        tableId="table-1"
        myPlayerId="me"
        hostPlayerId="me"
        players={[
          { playerId: 'me', nickname: 'Alice', isBot: false, connected: true },
          { playerId: 'bot', nickname: 'Bot', isBot: true, connected: true },
          { playerId: 'bob', nickname: 'Bob', isBot: false, connected: false },
        ]}
        maxSeats={6}
        practiceMode={false}
        onLeave={vi.fn()}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        onOpenSettlement={vi.fn()}
      />,
    );

    const roster = screen.getByTestId('lobby-roster');
    expect(roster).toHaveTextContent('Alice (you)');
    expect(roster).toHaveTextContent('Bot');
    expect(roster).toHaveTextContent('Bob (disconnected)');
    expect(screen.getByText('Waiting for players (3/6)…')).toBeInTheDocument();
  });

  it('shows the invite link containing the table id', () => {
    render(
      <LobbyView
        tableId="table-42"
        myPlayerId="me"
        hostPlayerId="me"
        players={[{ playerId: 'me', nickname: 'Alice', isBot: false, connected: true }]}
        maxSeats={6}
        practiceMode={false}
        onLeave={vi.fn()}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        onOpenSettlement={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Invite link') as HTMLInputElement;
    expect(input.value).toContain('table=table-42');
  });

  it('calls onLeave when the leave link is clicked', () => {
    const onLeave = vi.fn();
    render(
      <LobbyView
        tableId="table-1"
        myPlayerId="me"
        hostPlayerId="me"
        players={[{ playerId: 'me', nickname: 'Alice', isBot: false, connected: true }]}
        maxSeats={6}
        practiceMode={false}
        onLeave={onLeave}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        onOpenSettlement={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(onLeave).toHaveBeenCalled();
  });

  it('shows a Kick button for every other seated player (human or bot) only when the viewer is the host', () => {
    const onKick = vi.fn();
    render(
      <LobbyView
        tableId="table-1"
        myPlayerId="me"
        hostPlayerId="me"
        players={[
          { playerId: 'me', nickname: 'Alice', isBot: false, connected: true },
          { playerId: 'bob', nickname: 'Bob', isBot: false, connected: true },
          { playerId: 'bot', nickname: 'Bot', isBot: true, connected: true },
        ]}
        maxSeats={6}
        practiceMode={false}
        onLeave={vi.fn()}
        onKick={onKick}
        onAddBot={vi.fn()}
        onOpenSettlement={vi.fn()}
      />,
    );

    const kickButtons = screen.getAllByRole('button', { name: 'Kick' });
    expect(kickButtons).toHaveLength(2); // Bob and the bot — not myself

    fireEvent.click(kickButtons[0]!);
    expect(onKick).toHaveBeenCalledWith('bob');
  });

  it('hides the Kick button entirely for a non-host viewer', () => {
    render(
      <LobbyView
        tableId="table-1"
        myPlayerId="bob"
        hostPlayerId="me"
        players={[
          { playerId: 'me', nickname: 'Alice', isBot: false, connected: true },
          { playerId: 'bob', nickname: 'Bob', isBot: false, connected: true },
        ]}
        maxSeats={6}
        practiceMode={false}
        onLeave={vi.fn()}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        onOpenSettlement={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Kick' })).not.toBeInTheDocument();
  });

  it('renders an empty seat with Add Bot for unfilled capacity, host only', () => {
    const onAddBot = vi.fn();
    const { rerender } = render(
      <LobbyView
        tableId="table-1"
        myPlayerId="me"
        hostPlayerId="me"
        players={[{ playerId: 'me', nickname: 'Alice', isBot: false, connected: true }]}
        maxSeats={3}
        practiceMode={false}
        onLeave={vi.fn()}
        onKick={vi.fn()}
        onAddBot={onAddBot}
        onOpenSettlement={vi.fn()}
      />,
    );

    const addBotButtons = screen.getAllByRole('button', { name: 'Add Bot' });
    expect(addBotButtons).toHaveLength(2);
    fireEvent.click(addBotButtons[0]!);
    expect(onAddBot).toHaveBeenCalledTimes(1);

    rerender(
      <LobbyView
        tableId="table-1"
        myPlayerId="bob"
        hostPlayerId="me"
        players={[
          { playerId: 'me', nickname: 'Alice', isBot: false, connected: true },
          { playerId: 'bob', nickname: 'Bob', isBot: false, connected: true },
        ]}
        maxSeats={3}
        practiceMode={false}
        onLeave={vi.fn()}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        onOpenSettlement={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Add Bot' })).not.toBeInTheDocument();
  });
});
