import { PlayingCard } from './PlayingCard';

const STACK_OFFSETS = [0, 1, 2];

/** A neatly squared stack of face-down cards — the undealt deck, sitting at the button's
 * position. Deliberately not fanned/rotated (unlike the muck pile) — a deck reads as tidy. */
export function DealerDeck() {
  return (
    <div className="relative h-16 w-11" data-testid="dealer-deck">
      {STACK_OFFSETS.map((offset) => (
        <div key={offset} className="absolute" style={{ top: -offset * 1.5, left: -offset * 1 }}>
          <PlayingCard card={null} size="sm" />
        </div>
      ))}
    </div>
  );
}
