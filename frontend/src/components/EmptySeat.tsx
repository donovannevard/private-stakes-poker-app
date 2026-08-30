interface EmptySeatProps {
  readonly canAddBot: boolean;
  readonly onAddBot: () => void;
}

export function EmptySeat({ canAddBot, onAddBot }: EmptySeatProps) {
  return (
    <div
      data-testid="empty-seat"
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-700 p-3 text-neutral-500"
    >
      <span className="text-sm">Empty seat</span>
      {canAddBot && (
        <button
          type="button"
          onClick={onAddBot}
          className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-50 hover:bg-neutral-600"
        >
          Add Bot
        </button>
      )}
    </div>
  );
}
