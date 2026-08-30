import type { TexasHoldemSnapshot } from '@lightning-poker/game-engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionControls } from './ActionControls';
import { playTurnSound } from '../lib/sound';

vi.mock('../lib/sound', () => ({
  playTurnSound: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeSnapshot(overrides: Partial<TexasHoldemSnapshot> = {}): TexasHoldemSnapshot {
  return {
    street: 'preflop',
    buttonIndex: 0,
    communityCards: [],
    currentBet: 2,
    minRaise: 2,
    bigBlind: 2,
    actingPlayerId: 'me',
    players: [
      {
        playerId: 'me',
        stack: 198,
        committed: 2,
        committedThisStreet: 2,
        status: 'active',
        holeCards: null,
      },
      {
        playerId: 'bot',
        stack: 197,
        committed: 3,
        committedThisStreet: 3,
        status: 'active',
        holeCards: null,
      },
    ],
    winners: null,
    potPayouts: null,
    ...overrides,
  };
}

describe('ActionControls', () => {
  it('shows a waiting message when it is not my turn, without removing the button row', () => {
    render(
      <ActionControls
        snapshot={makeSnapshot({ actingPlayerId: 'bot' })}
        myPlayerId="me"
        onAction={vi.fn()}
        turnExpiresAt={null}
      />,
    );

    expect(screen.getByTestId('action-controls-waiting')).toHaveTextContent(
      'Waiting for your turn',
    );
    // The row stays mounted (reserving its layout space, so the table doesn't
    // jump when it becomes/stops being my turn) — just hidden and inert.
    const row = screen.getByTestId('action-controls');
    expect(row.className).toMatch(/invisible/);
    expect(screen.getByRole('button', { name: 'Fold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('does not hide the button row (and shows no waiting overlay) when it is my turn', () => {
    render(
      <ActionControls
        snapshot={makeSnapshot()}
        myPlayerId="me"
        onAction={vi.fn()}
        turnExpiresAt={null}
      />,
    );

    expect(screen.getByTestId('action-controls').className).not.toMatch(/invisible/);
    expect(screen.getByRole('button', { name: 'Fold' })).toBeEnabled();
    expect(screen.queryByTestId('action-controls-waiting')).not.toBeInTheDocument();
  });

  it('offers Check (not Call) when already matched the current bet', () => {
    render(
      <ActionControls
        snapshot={makeSnapshot()}
        myPlayerId="me"
        onAction={vi.fn()}
        turnExpiresAt={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Call/ })).not.toBeInTheDocument();
  });

  it('offers Call with the correct amount when facing a bet', () => {
    const snapshot = makeSnapshot({
      currentBet: 10,
      players: [
        {
          playerId: 'me',
          stack: 190,
          committed: 2,
          committedThisStreet: 2,
          status: 'active',
          holeCards: null,
        },
        {
          playerId: 'bot',
          stack: 190,
          committed: 10,
          committedThisStreet: 10,
          status: 'active',
          holeCards: null,
        },
      ],
    });

    render(
      <ActionControls
        snapshot={snapshot}
        myPlayerId="me"
        onAction={vi.fn()}
        turnExpiresAt={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'Call 8' })).toBeInTheDocument();
  });

  it('calls onAction with fold when Fold is clicked', () => {
    const onAction = vi.fn();
    render(
      <ActionControls
        snapshot={makeSnapshot()}
        myPlayerId="me"
        onAction={onAction}
        turnExpiresAt={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fold' }));

    expect(onAction).toHaveBeenCalledWith({ type: 'fold' });
  });

  it('hides the raise control when the player cannot cover a legal raise', () => {
    const snapshot = makeSnapshot({
      currentBet: 100,
      minRaise: 50,
      players: [
        {
          playerId: 'me',
          stack: 10,
          committed: 90,
          committedThisStreet: 90,
          status: 'active',
          holeCards: null,
        },
        {
          playerId: 'bot',
          stack: 0,
          committed: 100,
          committedThisStreet: 100,
          status: 'all-in',
          holeCards: null,
        },
      ],
    });

    render(
      <ActionControls
        snapshot={snapshot}
        myPlayerId="me"
        onAction={vi.fn()}
        turnExpiresAt={null}
      />,
    );

    expect(screen.queryByLabelText('Raise amount')).not.toBeInTheDocument();
  });

  it('shows a live countdown when a turn timer is running', () => {
    render(
      <ActionControls
        snapshot={makeSnapshot()}
        myPlayerId="me"
        onAction={vi.fn()}
        turnExpiresAt={Date.now() + 15_000}
      />,
    );

    expect(screen.getByTestId('turn-countdown')).toHaveTextContent('Auto-fold in 15s');
  });

  it('does not show a countdown when no turn timer is running', () => {
    render(
      <ActionControls
        snapshot={makeSnapshot()}
        myPlayerId="me"
        onAction={vi.fn()}
        turnExpiresAt={null}
      />,
    );

    expect(screen.queryByTestId('turn-countdown')).not.toBeInTheDocument();
  });

  it('labels the raise control "Bet" when no one has wagered yet this street', () => {
    const snapshot = makeSnapshot({
      street: 'flop',
      currentBet: 0,
      minRaise: 2,
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
    });

    render(
      <ActionControls
        snapshot={snapshot}
        myPlayerId="me"
        onAction={vi.fn()}
        turnExpiresAt={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'Bet 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Raise to/ })).not.toBeInTheDocument();
  });

  it('resyncs the raise default to the new minimum on a street transition, instead of keeping the stale amount', () => {
    const preflop = makeSnapshot(); // currentBet: 2, minRaise: 2 -> default 4
    const { rerender } = render(
      <ActionControls snapshot={preflop} myPlayerId="me" onAction={vi.fn()} turnExpiresAt={null} />,
    );
    expect(screen.getByLabelText('Raise amount')).toHaveValue(4);

    const flop = makeSnapshot({
      street: 'flop',
      currentBet: 0,
      minRaise: 2,
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
    });
    rerender(
      <ActionControls snapshot={flop} myPlayerId="me" onAction={vi.fn()} turnExpiresAt={null} />,
    );

    expect(screen.getByLabelText('Raise amount')).toHaveValue(2);
  });

  describe('quick-bet buttons', () => {
    it('set the raise input to the clamped multiple of the big blind, without acting', () => {
      const onAction = vi.fn();
      render(
        <ActionControls
          snapshot={makeSnapshot()} // bigBlind: 2, maxRaiseTo: 200
          myPlayerId="me"
          onAction={onAction}
          turnExpiresAt={null}
        />,
      );

      fireEvent.click(screen.getByTitle('10× big blind')); // 10 x 2 = 20

      expect(screen.getByLabelText('Raise amount')).toHaveValue(20);
      expect(onAction).not.toHaveBeenCalled();
    });

    it('clamps a multiplier that would exceed the stack down to the legal max', () => {
      const snapshot = makeSnapshot({
        currentBet: 10,
        minRaise: 2,
        players: [
          {
            playerId: 'me',
            stack: 15,
            committed: 10,
            committedThisStreet: 10,
            status: 'active',
            holeCards: null,
          },
          {
            playerId: 'bot',
            stack: 190,
            committed: 10,
            committedThisStreet: 10,
            status: 'active',
            holeCards: null,
          },
        ],
      });
      render(
        <ActionControls
          snapshot={snapshot}
          myPlayerId="me"
          onAction={vi.fn()}
          turnExpiresAt={null}
        />,
      );
      // maxRaiseTo = 10 (committedThisStreet) + 15 (stack) = 25.

      fireEvent.click(screen.getByTitle('50× big blind')); // 50 x 2 = 100, clamps to 25

      expect(screen.getByLabelText('Raise amount')).toHaveValue(25);
    });

    it('Max sets the raise input to the legal maximum (all-in)', () => {
      render(
        <ActionControls
          snapshot={makeSnapshot()} // maxRaiseTo: 200
          myPlayerId="me"
          onAction={vi.fn()}
          turnExpiresAt={null}
        />,
      );

      fireEvent.click(screen.getByTitle('Max — all in'));

      expect(screen.getByLabelText('Raise amount')).toHaveValue(200);
    });
  });

  describe('turn notification sound', () => {
    it('does not play on initial mount even if it is already my turn', () => {
      render(
        <ActionControls
          snapshot={makeSnapshot()}
          myPlayerId="me"
          onAction={vi.fn()}
          turnExpiresAt={null}
        />,
      );

      expect(playTurnSound).not.toHaveBeenCalled();
    });

    it('plays once the turn transitions to me', () => {
      const { rerender } = render(
        <ActionControls
          snapshot={makeSnapshot({ actingPlayerId: 'bot' })}
          myPlayerId="me"
          onAction={vi.fn()}
          turnExpiresAt={null}
        />,
      );
      expect(playTurnSound).not.toHaveBeenCalled();

      rerender(
        <ActionControls
          snapshot={makeSnapshot({ actingPlayerId: 'me' })}
          myPlayerId="me"
          onAction={vi.fn()}
          turnExpiresAt={null}
        />,
      );

      expect(playTurnSound).toHaveBeenCalledTimes(1);
    });
  });
});
