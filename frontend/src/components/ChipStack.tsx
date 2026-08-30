interface ChipStackProps {
  readonly pot: number;
  readonly bigBlind: number;
}

const CHIP_COLORS = [
  'bg-neutral-300',
  'bg-red-500',
  'bg-blue-500',
  'bg-green-600',
  'bg-neutral-900',
  'bg-amber-500',
];

/** Purely illustrative — not a literal chip-denomination simulation. */
function chipCount(pot: number, bigBlind: number): number {
  if (pot <= 0) {
    return 0;
  }
  const bbUnits = pot / Math.max(1, bigBlind);
  return Math.min(6, 1 + Math.floor(Math.log2(bbUnits + 1)));
}

export function ChipStack({ pot, bigBlind }: ChipStackProps) {
  const count = chipCount(pot, bigBlind);
  if (count === 0) {
    return null;
  }

  return (
    <div className="relative h-6 w-6" data-testid="chip-stack" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={`absolute inset-x-0 h-2 rounded-full border border-black/30 ${CHIP_COLORS[index % CHIP_COLORS.length]}`}
          style={{ bottom: index * 3 }}
        />
      ))}
    </div>
  );
}
