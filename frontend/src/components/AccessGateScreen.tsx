import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { submitAccessCode } from '../lib/api';

const CODE_LENGTH = 6;

interface AccessGateScreenProps {
  readonly onGranted: () => void;
}

export function AccessGateScreen({ onGranted }: AccessGateScreenProps) {
  const [code, setCode] = useState('');

  const mutation = useMutation({
    mutationFn: (submitted: string) => submitAccessCode(submitted),
    onSuccess: onGranted,
  });

  const trimmedCode = code.trim();
  const canSubmit = !mutation.isPending && trimmedCode.length === CODE_LENGTH;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-neutral-50">
      <h1 className="text-2xl font-semibold">Lightning Self-Hosted Poker</h1>
      <p className="text-sm text-neutral-400">Enter the access code your host gave you.</p>
      <form
        className="flex flex-col items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            mutation.mutate(trimmedCode);
          }
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder="000000"
          maxLength={CODE_LENGTH}
          className="w-40 rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-center text-lg tracking-widest text-neutral-50"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-amber-600 px-6 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-500 disabled:opacity-50"
        >
          {mutation.isPending ? 'Checking…' : 'Enter'}
        </button>
        {mutation.isError && <p className="text-sm text-red-400">Incorrect code. Try again.</p>}
      </form>
    </div>
  );
}
