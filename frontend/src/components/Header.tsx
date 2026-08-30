interface HeaderProps {
  readonly practiceMode?: boolean;
}

export function Header({ practiceMode = false }: HeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Lightning Self-Hosted Poker</h1>
        {practiceMode && (
          <span className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-400">
            Practice table — chips have no monetary value
          </span>
        )}
      </div>
    </div>
  );
}
