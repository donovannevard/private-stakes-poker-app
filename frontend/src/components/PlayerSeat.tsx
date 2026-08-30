import type { PublicPlayerView } from '@lightning-poker/game-engine';

interface PlayerSeatProps {
  readonly player: PublicPlayerView;
  readonly displayName: string;
  readonly isActing: boolean;
  readonly isDealer?: boolean;
  readonly connected: boolean;
  readonly canKick: boolean;
  readonly onKick?: () => void;
  /** "sats" for real-stakes tables, "chips" once any bot is seated. */
  readonly unitLabel?: string;
}

export function PlayerSeat({
  player,
  displayName,
  isActing,
  isDealer = false,
  connected,
  canKick,
  onKick,
  unitLabel = 'sats',
}: PlayerSeatProps) {
  const folded = player.status === 'folded';
  const dulled = !connected || folded;

  return (
    <div
      data-testid="player-seat"
      className={`relative flex flex-col items-center gap-2 rounded-lg border p-3 ${
        isActing ? 'border-amber-400 bg-neutral-800' : 'border-neutral-700 bg-neutral-900'
      } ${dulled ? 'opacity-50' : ''}`}
    >
      {isDealer && (
        <span
          data-testid="dealer-chip"
          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-neutral-900 bg-neutral-50 text-[10px] font-bold text-neutral-900"
        >
          D
        </span>
      )}
      <span className="text-sm font-medium text-neutral-100">{displayName}</span>
      {!connected && <span className="text-xs text-red-400">disconnected…</span>}
      <span className="text-xs text-neutral-400">
        {player.stack} {unitLabel}
      </span>
      {player.committedThisStreet > 0 && (
        <span className="text-xs text-amber-300">bet {player.committedThisStreet}</span>
      )}
      {folded && <span className="text-xs text-neutral-500">folded</span>}
      {player.status === 'all-in' && <span className="text-xs text-red-400">all-in</span>}
      {canKick && (
        <button type="button" onClick={onKick} className="text-xs text-red-400 underline">
          Kick
        </button>
      )}
    </div>
  );
}
