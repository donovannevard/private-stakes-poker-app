import type { TexasHoldemSnapshot } from '@lightning-poker/game-engine';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playFoldSound } from '../lib/sound';
import { PokerTable } from './PokerTable';

vi.mock('../lib/sound', () => ({
  playFoldSound: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeSnapshot(overrides: Partial<TexasHoldemSnapshot> = {}): TexasHoldemSnapshot {
  return {
    street: 'flop',
    buttonIndex: 1,
    communityCards: [
      { rank: 14, suit: 'spades' },
      { rank: 2, suit: 'hearts' },
      { rank: 9, suit: 'clubs' },
    ],
    currentBet: 0,
    minRaise: 2,
    bigBlind: 2,
    actingPlayerId: 'me',
    players: [
      {
        playerId: 'me',
        stack: 198,
        committed: 2,
        committedThisStreet: 0,
        status: 'active',
        holeCards: null,
      },
      {
        playerId: 'bot',
        stack: 197,
        committed: 3,
        committedThisStreet: 0,
        status: 'active',
        holeCards: null,
      },
    ],
    winners: null,
    potPayouts: null,
    ...overrides,
  };
}

describe('PokerTable', () => {
  it('renders the pot, community cards, and one seat per player', () => {
    render(
      <PokerTable
        snapshot={makeSnapshot()}
        myPlayerId="me"
        displayName={(id) => id}
        playerDirectory={{}}
        isHost={false}
        maxSeats={2}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        unitLabel="chips"
      />,
    );

    expect(screen.getByText('Pot: 5 chips')).toBeInTheDocument();
    expect(screen.getByTestId('chip-stack')).toBeInTheDocument();
    // Always 5 slots — 3 real cards (flop) + 2 empty placeholders — so the
    // row's size never changes across streets.
    expect(screen.getByTestId('community-cards').children).toHaveLength(5);
    expect(screen.getAllByTestId('community-card-slot-empty')).toHaveLength(2);
    expect(screen.getAllByTestId('player-seat')).toHaveLength(2);
    expect(screen.queryByTestId('empty-seat')).not.toBeInTheDocument();
  });

  it('always reserves the muck-pile slot, even with no cards in it', () => {
    render(
      <PokerTable
        snapshot={makeSnapshot()}
        myPlayerId="me"
        displayName={(id) => id}
        playerDirectory={{}}
        isHost={false}
        maxSeats={2}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        unitLabel="chips"
      />,
    );

    expect(screen.getByTestId('muck-pile-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('muck-pile')).not.toBeInTheDocument();
  });

  it('shows no chip stack when the pot is empty', () => {
    render(
      <PokerTable
        snapshot={makeSnapshot({
          players: [
            {
              playerId: 'me',
              stack: 200,
              committed: 0,
              committedThisStreet: 0,
              status: 'active',
              holeCards: null,
            },
            {
              playerId: 'bot',
              stack: 200,
              committed: 0,
              committedThisStreet: 0,
              status: 'active',
              holeCards: null,
            },
          ],
        })}
        myPlayerId="me"
        displayName={(id) => id}
        playerDirectory={{}}
        isHost={false}
        maxSeats={2}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        unitLabel="chips"
      />,
    );

    expect(screen.queryByTestId('chip-stack')).not.toBeInTheDocument();
  });

  it('places the dealer chip on the seat at buttonIndex', () => {
    render(
      <PokerTable
        snapshot={makeSnapshot({ buttonIndex: 1 })}
        myPlayerId="me"
        displayName={(id) => id}
        playerDirectory={{}}
        isHost={false}
        maxSeats={2}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        unitLabel="chips"
      />,
    );

    const seats = screen.getAllByTestId('poker-table-seat');
    expect(within(seats[0]!).queryByTestId('dealer-chip')).not.toBeInTheDocument();
    expect(within(seats[1]!).getByTestId('dealer-chip')).toBeInTheDocument();
  });

  it('shows a winners overlay without removing the pot/community cards', () => {
    render(
      <PokerTable
        snapshot={makeSnapshot({ street: 'complete', winners: ['bot'] })}
        myPlayerId="me"
        displayName={(id) => (id === 'bot' ? 'Bob' : id)}
        playerDirectory={{}}
        isHost={false}
        maxSeats={2}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        unitLabel="chips"
      />,
    );

    expect(screen.getByText('Winner: Bob')).toBeInTheDocument();
    expect(screen.getByText(/Pot:/)).toBeInTheDocument();
  });

  it('renders empty seats for unfilled capacity, with Add Bot for the host only', () => {
    const { rerender } = render(
      <PokerTable
        snapshot={makeSnapshot()}
        myPlayerId="me"
        displayName={(id) => id}
        playerDirectory={{}}
        isHost={false}
        maxSeats={4}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        unitLabel="chips"
      />,
    );

    expect(screen.getAllByTestId('empty-seat')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add Bot' })).not.toBeInTheDocument();

    const onAddBot = vi.fn();
    rerender(
      <PokerTable
        snapshot={makeSnapshot()}
        myPlayerId="me"
        displayName={(id) => id}
        playerDirectory={{}}
        isHost={true}
        maxSeats={4}
        onKick={vi.fn()}
        onAddBot={onAddBot}
        unitLabel="chips"
      />,
    );

    const addBotButtons = screen.getAllByRole('button', { name: 'Add Bot' });
    expect(addBotButtons).toHaveLength(2);
    fireEvent.click(addBotButtons[0]!);
    expect(onAddBot).toHaveBeenCalledTimes(1);
  });

  it('hides a folded player’s dealt cards and shows a muck pile', () => {
    const snapshot = makeSnapshot({
      players: [
        {
          playerId: 'me',
          stack: 198,
          committed: 2,
          committedThisStreet: 0,
          status: 'active',
          holeCards: null,
        },
        {
          playerId: 'bot',
          stack: 197,
          committed: 3,
          committedThisStreet: 0,
          status: 'folded',
          holeCards: null,
        },
      ],
    });

    render(
      <PokerTable
        snapshot={snapshot}
        myPlayerId="me"
        displayName={(id) => id}
        playerDirectory={{}}
        isHost={false}
        maxSeats={2}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        unitLabel="chips"
      />,
    );

    expect(screen.getAllByTestId('dealt-cards')).toHaveLength(1); // only "me", not the folded bot
    expect(screen.getByTestId('muck-pile')).toBeInTheDocument();
  });

  it('shows no muck pile when nobody has folded', () => {
    render(
      <PokerTable
        snapshot={makeSnapshot()}
        myPlayerId="me"
        displayName={(id) => id}
        playerDirectory={{}}
        isHost={false}
        maxSeats={2}
        onKick={vi.fn()}
        onAddBot={vi.fn()}
        unitLabel="chips"
      />,
    );

    expect(screen.queryByTestId('muck-pile')).not.toBeInTheDocument();
  });

  describe('fold sound', () => {
    it('does not play on initial mount even if someone is already folded', () => {
      render(
        <PokerTable
          snapshot={makeSnapshot({
            players: [
              {
                playerId: 'me',
                stack: 198,
                committed: 2,
                committedThisStreet: 0,
                status: 'active',
                holeCards: null,
              },
              {
                playerId: 'bot',
                stack: 197,
                committed: 3,
                committedThisStreet: 0,
                status: 'folded',
                holeCards: null,
              },
            ],
          })}
          myPlayerId="me"
          displayName={(id) => id}
          playerDirectory={{}}
          isHost={false}
          maxSeats={2}
          onKick={vi.fn()}
          onAddBot={vi.fn()}
          unitLabel="chips"
        />,
      );

      expect(playFoldSound).not.toHaveBeenCalled();
    });

    it('plays once a player newly folds', () => {
      const activeSnapshot = makeSnapshot();
      const { rerender } = render(
        <PokerTable
          snapshot={activeSnapshot}
          myPlayerId="me"
          displayName={(id) => id}
          playerDirectory={{}}
          isHost={false}
          maxSeats={2}
          onKick={vi.fn()}
          onAddBot={vi.fn()}
          unitLabel="chips"
        />,
      );
      expect(playFoldSound).not.toHaveBeenCalled();

      const foldedSnapshot = makeSnapshot({
        players: activeSnapshot.players.map((player) =>
          player.playerId === 'bot' ? { ...player, status: 'folded' as const } : player,
        ),
      });
      rerender(
        <PokerTable
          snapshot={foldedSnapshot}
          myPlayerId="me"
          displayName={(id) => id}
          playerDirectory={{}}
          isHost={false}
          maxSeats={2}
          onKick={vi.fn()}
          onAddBot={vi.fn()}
          unitLabel="chips"
        />,
      );

      expect(playFoldSound).toHaveBeenCalledTimes(1);
    });
  });

  describe('dealer deck', () => {
    it('renders at its own ring position, distinct from any seat', () => {
      render(
        <PokerTable
          snapshot={makeSnapshot({ buttonIndex: 1 })}
          myPlayerId="me"
          displayName={(id) => id}
          playerDirectory={{}}
          isHost={false}
          maxSeats={2}
          onKick={vi.fn()}
          onAddBot={vi.fn()}
          unitLabel="chips"
        />,
      );

      expect(screen.getByTestId('dealer-deck-slot')).toBeInTheDocument();
      expect(screen.getByTestId('dealer-deck')).toBeInTheDocument();
    });

    it('keeps rendering every seat and dealt-cards group across a new-hand transition', () => {
      const { rerender } = render(
        <PokerTable
          snapshot={makeSnapshot({ street: 'complete', winners: ['bot'] })}
          myPlayerId="me"
          displayName={(id) => id}
          playerDirectory={{}}
          isHost={false}
          maxSeats={2}
          onKick={vi.fn()}
          onAddBot={vi.fn()}
          unitLabel="chips"
        />,
      );

      rerender(
        <PokerTable
          snapshot={makeSnapshot({ street: 'preflop', communityCards: [], winners: null })}
          myPlayerId="me"
          displayName={(id) => id}
          playerDirectory={{}}
          isHost={false}
          maxSeats={2}
          onKick={vi.fn()}
          onAddBot={vi.fn()}
          unitLabel="chips"
        />,
      );

      expect(screen.getAllByTestId('poker-table-seat')).toHaveLength(2);
      expect(screen.getAllByTestId('dealt-cards')).toHaveLength(2);
    });
  });
});
