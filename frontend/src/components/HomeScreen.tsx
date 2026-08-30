import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { createTable } from '../lib/api';
import { setTableIdInUrl } from '../lib/url';
import { useTableStore } from '../store/tableStore';

const MAX_NICKNAME_LENGTH = 24;
const SEAT_OPTIONS = [2, 3, 4, 5, 6, 7, 8];
const TURN_TIMEOUT_OPTIONS = [
  { label: 'No limit', value: '' },
  { label: '15 seconds', value: '15' },
  { label: '30 seconds', value: '30' },
  { label: '60 seconds', value: '60' },
  { label: '90 seconds', value: '90' },
];

export function HomeScreen() {
  const [nickname, setNickname] = useState('');
  const [singlePlayer, setSinglePlayer] = useState(true);
  const [maxSeats, setMaxSeats] = useState(6);
  const [smallBlind, setSmallBlind] = useState(1);
  const [bigBlind, setBigBlind] = useState(2);
  const [startingStack, setStartingStack] = useState(200);
  const [turnTimeoutSeconds, setTurnTimeoutSeconds] = useState('');
  const [lightningAddress, setLightningAddress] = useState('');
  const [fundsConfirmed, setFundsConfirmed] = useState(false);
  const join = useTableStore((state) => state.join);

  const onCreated = (data: { tableId: string; playerId: string }, name: string) => {
    setTableIdInUrl(data.tableId);
    join(data.tableId, data.playerId, name);
  };

  const createTableMutation = useMutation({
    mutationFn: (name: string) =>
      createTable({
        nickname: name,
        maxSeats,
        botCount: singlePlayer ? maxSeats - 1 : 0,
        smallBlind,
        bigBlind,
        startingStack,
        turnTimeoutSeconds: turnTimeoutSeconds ? Number(turnTimeoutSeconds) : null,
        lightningAddress: singlePlayer ? undefined : lightningAddress.trim() || undefined,
      }),
    onSuccess: onCreated,
  });

  const trimmedNickname = nickname.trim();
  const canCreate =
    !createTableMutation.isPending &&
    trimmedNickname.length > 0 &&
    (singlePlayer || fundsConfirmed);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-950 p-6 text-neutral-50">
      <h1 className="text-2xl font-semibold">Lightning Self-Hosted Poker</h1>

      <input
        type="text"
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        placeholder="Your nickname"
        maxLength={MAX_NICKNAME_LENGTH}
        className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-50"
      />

      <div className="flex flex-col items-center gap-3">
        <div className="flex w-72 flex-col gap-2 rounded border border-neutral-700 p-3 text-sm text-neutral-300">
          <span className="text-neutral-400">Table settings</span>

          <label className="flex items-center justify-between gap-2">
            Mode
            <select
              value={singlePlayer ? 'single' : 'multi'}
              onChange={(event) => setSinglePlayer(event.target.value === 'single')}
              className="rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
            >
              <option value="single">Single player (vs bots)</option>
              <option value="multi">Multiplayer (invite friends)</option>
            </select>
          </label>

          <label className="flex items-center justify-between gap-2">
            Seats
            <select
              value={maxSeats}
              onChange={(event) => setMaxSeats(Number(event.target.value))}
              className="rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
            >
              {SEAT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count} players
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-neutral-500">
            {singlePlayer
              ? `You + ${maxSeats - 1} bot${maxSeats - 1 === 1 ? '' : 's'}. Kick any bot and add a new one any time.`
              : `Seats open for friends to join — add bots to fill empty seats any time.`}
          </p>

          <label className="flex items-center justify-between gap-2">
            Small blind
            <input
              type="number"
              min={1}
              value={smallBlind}
              onChange={(event) => setSmallBlind(Number(event.target.value))}
              className="w-20 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
            />
          </label>

          <label className="flex items-center justify-between gap-2">
            Big blind
            <input
              type="number"
              min={1}
              value={bigBlind}
              onChange={(event) => setBigBlind(Number(event.target.value))}
              className="w-20 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
            />
          </label>

          <label className="flex items-center justify-between gap-2">
            Starting stack
            <input
              type="number"
              min={1}
              value={startingStack}
              onChange={(event) => setStartingStack(Number(event.target.value))}
              className="w-20 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
            />
          </label>

          <label className="flex items-center justify-between gap-2">
            Turn timer
            <select
              value={turnTimeoutSeconds}
              onChange={(event) => setTurnTimeoutSeconds(event.target.value)}
              className="rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
            >
              {TURN_TIMEOUT_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!singlePlayer && (
          <>
            <label className="flex w-72 flex-col gap-1 text-left text-sm text-neutral-300">
              Lightning address (optional)
              <input
                type="text"
                value={lightningAddress}
                onChange={(event) => setLightningAddress(event.target.value)}
                placeholder="you@walletprovider.com"
                className="rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
              />
            </label>

            <label className="flex w-72 items-start gap-2 text-left text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={fundsConfirmed}
                onChange={(event) => setFundsConfirmed(event.target.checked)}
                className="mt-0.5"
              />
              I confirm I have at least {startingStack} sats available in my Lightning wallet to
              cover this game's stakes.
            </label>
          </>
        )}

        <button
          type="button"
          disabled={!canCreate}
          onClick={() => createTableMutation.mutate(trimmedNickname)}
          className="rounded bg-amber-600 px-6 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-500 disabled:opacity-50"
        >
          {createTableMutation.isPending ? 'Creating…' : 'Create Table'}
        </button>
      </div>

      {createTableMutation.isError && (
        <p className="text-sm text-red-400">Could not create a table. Please try again.</p>
      )}
    </div>
  );
}
