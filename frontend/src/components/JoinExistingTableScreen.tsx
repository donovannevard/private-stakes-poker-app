import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { joinTable } from '../lib/api';
import { useTableStore } from '../store/tableStore';

const MAX_NICKNAME_LENGTH = 24;

interface JoinExistingTableScreenProps {
  readonly tableId: string;
}

export function JoinExistingTableScreen({ tableId }: JoinExistingTableScreenProps) {
  const [nickname, setNickname] = useState('');
  const [lightningAddress, setLightningAddress] = useState('');
  const join = useTableStore((state) => state.join);

  const mutation = useMutation({
    mutationFn: (name: string) => joinTable(tableId, name, lightningAddress.trim() || undefined),
    onSuccess: (data, name) => {
      join(data.tableId, data.playerId, name);
    },
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-neutral-50">
      <h1 className="text-2xl font-semibold">Join Table</h1>
      <form
        className="flex flex-col items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = nickname.trim();
          if (trimmed.length > 0) {
            mutation.mutate(trimmed);
          }
        }}
      >
        <input
          type="text"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="Your nickname"
          maxLength={MAX_NICKNAME_LENGTH}
          className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-50"
        />
        <input
          type="text"
          value={lightningAddress}
          onChange={(event) => setLightningAddress(event.target.value)}
          placeholder="Lightning address (optional)"
          className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-50"
        />
        <button
          type="submit"
          disabled={mutation.isPending || nickname.trim().length === 0}
          className="rounded bg-amber-600 px-6 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-500 disabled:opacity-50"
        >
          {mutation.isPending ? 'Joining…' : 'Join Table'}
        </button>
        {mutation.isError && (
          <p className="text-sm text-red-400">
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'Could not join this table.'}
          </p>
        )}
      </form>
    </div>
  );
}
