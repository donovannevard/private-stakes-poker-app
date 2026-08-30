import type { LobbyPlayer } from '@lightning-poker/shared';
import { useState } from 'react';
import { buildInviteLink } from '../lib/url';
import { EmptySeat } from './EmptySeat';
import { Header } from './Header';

interface LobbyViewProps {
  readonly tableId: string;
  readonly myPlayerId: string;
  readonly hostPlayerId: string;
  readonly players: readonly LobbyPlayer[];
  readonly maxSeats: number;
  readonly practiceMode: boolean;
  readonly onLeave: () => void;
  readonly onKick: (playerId: string) => void;
  readonly onAddBot: () => void;
  readonly onOpenSettlement: () => void;
}

export function LobbyView({
  tableId,
  myPlayerId,
  hostPlayerId,
  players,
  maxSeats,
  practiceMode,
  onLeave,
  onKick,
  onAddBot,
  onOpenSettlement,
}: LobbyViewProps) {
  const [copied, setCopied] = useState(false);
  const inviteLink = buildInviteLink(tableId);
  const isHost = myPlayerId === hostPlayerId;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-50">
      <Header practiceMode={practiceMode} />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-neutral-400">
          Waiting for players ({players.length}/{maxSeats})…
        </p>

        <ul className="flex flex-col gap-1 text-sm" data-testid="lobby-roster">
          {players.map((player) => (
            <li key={player.playerId} className="flex items-center gap-2">
              <span className={player.connected ? undefined : 'text-neutral-600'}>
                {player.nickname}
                {player.playerId === myPlayerId ? ' (you)' : ''}
                {player.isBot ? ' 🤖' : ''}
                {!player.connected && ' (disconnected)'}
              </span>
              {isHost && player.playerId !== myPlayerId && (
                <button
                  type="button"
                  onClick={() => onKick(player.playerId)}
                  className="text-xs text-red-400 underline"
                >
                  Kick
                </button>
              )}
            </li>
          ))}
          {Array.from({ length: Math.max(0, maxSeats - players.length) }, (_, index) => (
            <li key={`empty-${index}`}>
              <EmptySeat canAddBot={isHost} onAddBot={onAddBot} />
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <input
            readOnly
            value={inviteLink}
            aria-label="Invite link"
            className="w-72 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-xs text-neutral-300"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(inviteLink).catch(() => {});
              setCopied(true);
            }}
            className="rounded bg-neutral-700 px-3 py-1 text-sm hover:bg-neutral-600"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        <div className="flex items-center gap-4">
          {!practiceMode && (
            <button
              type="button"
              onClick={onOpenSettlement}
              className="text-sm text-amber-300 underline"
            >
              Settle up
            </button>
          )}
          <button type="button" onClick={onLeave} className="text-sm text-neutral-400 underline">
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
