import type { Card } from '@lightning-poker/game-engine';
import { isRedSuit, rankLabel, suitSymbol } from '../lib/cards';

type PlayingCardSize = 'xs' | 'sm' | 'lg';

interface PlayingCardProps {
  /** `null` renders a face-down back — an unrevealed hole card. */
  readonly card: Card | null;
  readonly size?: PlayingCardSize;
}

const SIZE_CLASSES: Record<PlayingCardSize, { box: string; corner: string; center: string }> = {
  xs: { box: 'h-12 w-8', corner: 'text-[8px]', center: 'text-base' },
  sm: { box: 'h-16 w-11', corner: 'text-[10px]', center: 'text-xl' },
  lg: { box: 'h-24 w-16', corner: 'text-sm', center: 'text-3xl' },
};

export function PlayingCard({ card, size = 'lg' }: PlayingCardProps) {
  const { box, corner, center } = SIZE_CLASSES[size];

  if (!card) {
    return (
      <div
        data-testid="playing-card-back"
        className={`${box} rounded-md border border-neutral-500 bg-gradient-to-br from-blue-800 to-blue-950`}
      />
    );
  }

  const colorClass = isRedSuit(card.suit) ? 'text-red-600' : 'text-neutral-900';
  const rank = rankLabel(card.rank);
  const suit = suitSymbol(card.suit);

  return (
    <div
      data-testid="playing-card"
      className={`relative ${box} rounded-md border border-neutral-400 bg-white shadow-sm ${colorClass}`}
    >
      <div
        className={`absolute top-0.5 left-1 flex flex-col items-center leading-none font-bold ${corner}`}
      >
        <span>{rank}</span>
        <span>{suit}</span>
      </div>
      <div className={`flex h-full items-center justify-center font-bold ${center}`}>{suit}</div>
      <div
        className={`absolute right-1 bottom-0.5 flex rotate-180 flex-col items-center leading-none font-bold ${corner}`}
      >
        <span>{rank}</span>
        <span>{suit}</span>
      </div>
    </div>
  );
}
