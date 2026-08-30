import type { Card } from '@lightning-poker/game-engine';
import { motion, useAnimationControls, type MotionStyle } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { PlayingCard } from './PlayingCard';

interface Offset {
  readonly x: number;
  readonly y: number;
}

interface DealtCardsGroupProps {
  readonly holeCards: readonly [Card, Card] | null;
  readonly style: MotionStyle;
  /** Bumps once per genuine new-hand transition — see `useHandDealKey` in `PokerTable.tsx`. */
  readonly handDealKey: number;
  readonly dealFrom: Offset;
  readonly dealDelay: number;
  readonly exitTo: Offset;
}

/**
 * A stable, never-remounted element (kept alive across hands via a stable
 * `key={playerId}` in the parent) so that a new deal never trips the same
 * `exit` animation used for folding — instead, an imperative
 * `AnimationControls` snaps it to the deck's position and animates it back
 * to rest whenever `handDealKey` changes, entirely independent of mounting.
 */
export function DealtCardsGroup({
  holeCards,
  style,
  handDealKey,
  dealFrom,
  dealDelay,
  exitTo,
}: DealtCardsGroupProps) {
  const controls = useAnimationControls();
  const previousDealKeyRef = useRef(handDealKey);

  useEffect(() => {
    if (handDealKey === previousDealKeyRef.current) {
      return; // mount, or a re-render that isn't a new deal
    }
    previousDealKeyRef.current = handDealKey;
    controls.set({ x: dealFrom.x, y: dealFrom.y, opacity: 0, rotate: -20 });
    void controls.start({
      x: 0,
      y: 0,
      opacity: 1,
      rotate: 0,
      transition: { duration: 0.4, delay: dealDelay, ease: 'easeOut' },
    });
    // dealFrom/dealDelay are recomputed every render from stable ring math;
    // only a genuine handDealKey change should ever trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handDealKey]);

  return (
    <motion.div
      className="absolute flex"
      style={style}
      data-testid="dealt-cards"
      initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
      animate={controls}
      exit={{
        x: exitTo.x,
        y: exitTo.y,
        opacity: 0,
        rotate: 30,
        transition: { duration: 0.4, ease: 'easeIn' },
      }}
    >
      <div className="rotate-[-10deg]">
        <PlayingCard card={holeCards?.[0] ?? null} size="xs" />
      </div>
      <div className="-ml-5 rotate-[6deg]">
        <PlayingCard card={holeCards?.[1] ?? null} size="xs" />
      </div>
    </motion.div>
  );
}
