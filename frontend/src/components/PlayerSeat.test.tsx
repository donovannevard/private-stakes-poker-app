import type { PublicPlayerView } from '@lightning-poker/game-engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlayerSeat } from './PlayerSeat';

const PLAYER: PublicPlayerView = {
  playerId: 'p1',
  stack: 198,
  committed: 2,
  committedThisStreet: 2,
  status: 'active',
  holeCards: null,
};

describe('PlayerSeat', () => {
  it('renders normally, without a disconnected label, when connected', () => {
    render(
      <PlayerSeat
        player={PLAYER}
        displayName="Alice"
        isActing={false}
        connected={true}
        canKick={false}
      />,
    );

    expect(screen.queryByText('disconnected…')).not.toBeInTheDocument();
  });

  it('dulls the seat and shows a disconnected label when not connected', () => {
    render(
      <PlayerSeat
        player={PLAYER}
        displayName="Alice"
        isActing={false}
        connected={false}
        canKick={false}
      />,
    );

    expect(screen.getByText('disconnected…')).toBeInTheDocument();
    expect(screen.getByTestId('player-seat').className).toMatch(/opacity-50/);
  });

  it('shows a Kick button only when canKick is true, and calls onKick when clicked', () => {
    const onKick = vi.fn();
    render(
      <PlayerSeat
        player={PLAYER}
        displayName="Bob"
        isActing={false}
        connected={true}
        canKick={true}
        onKick={onKick}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kick' }));
    expect(onKick).toHaveBeenCalledTimes(1);
  });

  it('hides the Kick button when canKick is false', () => {
    render(
      <PlayerSeat
        player={PLAYER}
        displayName="Bob"
        isActing={false}
        connected={true}
        canKick={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Kick' })).not.toBeInTheDocument();
  });

  it('shows a dealer chip only when isDealer is true', () => {
    const { rerender } = render(
      <PlayerSeat
        player={PLAYER}
        displayName="Alice"
        isActing={false}
        connected={true}
        canKick={false}
      />,
    );
    expect(screen.queryByTestId('dealer-chip')).not.toBeInTheDocument();

    rerender(
      <PlayerSeat
        player={PLAYER}
        displayName="Alice"
        isActing={false}
        isDealer={true}
        connected={true}
        canKick={false}
      />,
    );
    expect(screen.getByTestId('dealer-chip')).toBeInTheDocument();
  });

  it('dulls the seat and shows a folded label once folded', () => {
    const folded = { ...PLAYER, status: 'folded' as const };
    render(
      <PlayerSeat
        player={folded}
        displayName="Alice"
        isActing={false}
        connected={true}
        canKick={false}
      />,
    );

    expect(screen.getByTestId('player-seat').className).toMatch(/opacity-50/);
    expect(screen.getByText('folded')).toBeInTheDocument();
  });
});
