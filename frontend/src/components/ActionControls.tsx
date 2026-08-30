import type { TexasHoldemAction, TexasHoldemSnapshot } from '@lightning-poker/game-engine';
import { useEffect, useRef, useState } from 'react';
import { playTurnSound } from '../lib/sound';

interface ActionControlsProps {
  readonly snapshot: TexasHoldemSnapshot;
  readonly myPlayerId: string;
  readonly onAction: (action: TexasHoldemAction) => void;
  readonly turnExpiresAt: number | null;
}

const BUTTON_CLASS =
  'rounded bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-50 hover:bg-neutral-600';

const QUICK_BET_MULTIPLIERS = [5, 10, 25, 50] as const;

/** Ticks once a second while `expiresAt` is set, for a live countdown display. */
function useSecondsRemaining(expiresAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null) {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (expiresAt === null) {
    return null;
  }
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

export function ActionControls({
  snapshot,
  myPlayerId,
  onAction,
  turnExpiresAt,
}: ActionControlsProps) {
  const me = snapshot.players.find((player) => player.playerId === myPlayerId);
  const isMyTurn = snapshot.actingPlayerId === myPlayerId;
  const secondsRemaining = useSecondsRemaining(isMyTurn ? turnExpiresAt : null);

  const minRaiseTo = snapshot.currentBet + snapshot.minRaise;
  const maxRaiseTo = me ? me.committedThisStreet + me.stack : 0;
  const [raiseTo, setRaiseTo] = useState(minRaiseTo);

  // Resyncs the default whenever the actual minimum changes (a new street,
  // or someone else re-raising) — without this, the input keeps whatever
  // value it had on the previous street/bet.
  useEffect(() => {
    setRaiseTo(minRaiseTo);
  }, [minRaiseTo]);

  // Notifies only on the false->true transition, never on initial mount
  // (e.g. loading straight into an already-my-turn hand shouldn't ding).
  const wasMyTurnRef = useRef(isMyTurn);
  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      playTurnSound();
    }
    wasMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  if (!me) {
    return null;
  }

  const canCheck = me.committedThisStreet === snapshot.currentBet;
  const callAmount = Math.min(snapshot.currentBet - me.committedThisStreet, me.stack);
  const canRaise = maxRaiseTo > snapshot.currentBet;
  const clampedRaiseTo = Math.min(Math.max(raiseTo, minRaiseTo), maxRaiseTo);
  const isOpeningBet = snapshot.currentBet === 0;
  const clampToLegalRaise = (amount: number) => Math.min(Math.max(amount, minRaiseTo), maxRaiseTo);

  return (
    <div className="relative flex flex-col items-center gap-2">
      {secondsRemaining !== null && (
        <div className="text-xs text-amber-300" data-testid="turn-countdown">
          Auto-fold in {secondsRemaining}s
        </div>
      )}
      <div
        className={`flex flex-wrap items-center justify-center gap-2 ${isMyTurn ? '' : 'invisible'}`}
        data-testid="action-controls"
      >
        <button
          type="button"
          disabled={!isMyTurn}
          className={BUTTON_CLASS}
          onClick={() => onAction({ type: 'fold' })}
        >
          Fold
        </button>
        {canCheck ? (
          <button
            type="button"
            disabled={!isMyTurn}
            className={BUTTON_CLASS}
            onClick={() => onAction({ type: 'check' })}
          >
            Check
          </button>
        ) : (
          <button
            type="button"
            disabled={!isMyTurn}
            className={BUTTON_CLASS}
            onClick={() => onAction({ type: 'call' })}
          >
            Call {callAmount}
          </button>
        )}
        {canRaise && (
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_BET_MULTIPLIERS.map((multiplier) => {
              const amount = clampToLegalRaise(multiplier * snapshot.bigBlind);
              return (
                <button
                  key={multiplier}
                  type="button"
                  disabled={!isMyTurn}
                  title={`${multiplier}× big blind`}
                  className="rounded bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
                  onClick={() => setRaiseTo(amount)}
                >
                  {amount}
                </button>
              );
            })}
            <button
              type="button"
              disabled={!isMyTurn}
              title="Max — all in"
              className="rounded bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
              onClick={() => setRaiseTo(maxRaiseTo)}
            >
              Max
            </button>
            <input
              type="number"
              aria-label="Raise amount"
              disabled={!isMyTurn}
              className="w-24 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
              min={minRaiseTo}
              max={maxRaiseTo}
              value={clampedRaiseTo}
              onChange={(event) => setRaiseTo(Number(event.target.value))}
            />
            <button
              type="button"
              disabled={!isMyTurn}
              className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-500"
              onClick={() => onAction({ type: 'raise', toAmount: clampedRaiseTo })}
            >
              {isOpeningBet ? `Bet ${clampedRaiseTo}` : `Raise to ${clampedRaiseTo}`}
            </button>
          </div>
        )}
      </div>
      {!isMyTurn && (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400"
          data-testid="action-controls-waiting"
        >
          {snapshot.street === 'complete' ? 'Hand complete' : 'Waiting for your turn…'}
        </div>
      )}
    </div>
  );
}
