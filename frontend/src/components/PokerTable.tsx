import type { TexasHoldemSnapshot } from '@lightning-poker/game-engine';
import { AnimatePresence, motion, type MotionStyle } from 'framer-motion';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { playFoldSound } from '../lib/sound';
import type { PlayerDirectoryEntry } from '../store/tableStore';
import { ChipStack } from './ChipStack';
import { DealerDeck } from './DealerDeck';
import { DealtCardsGroup } from './DealtCardsGroup';
import { EmptySeat } from './EmptySeat';
import { PlayerSeat } from './PlayerSeat';
import { PlayingCard } from './PlayingCard';

interface PokerTableProps {
  readonly snapshot: TexasHoldemSnapshot;
  readonly myPlayerId: string;
  readonly displayName: (playerId: string) => string;
  readonly playerDirectory: Readonly<Record<string, PlayerDirectoryEntry>>;
  readonly isHost: boolean;
  readonly maxSeats: number;
  readonly onKick: (playerId: string) => void;
  readonly onAddBot: () => void;
  readonly unitLabel: string;
}

const COMMUNITY_SLOT_COUNT = 5;
/** Percent-of-container position of the fixed muck-pile slot within the felt — used both to
 * render it and as the fold animation's target. */
const MUCK_POSITION = { left: 50, top: 68 };

const SEAT_RADIUS = { x: 40, y: 34 };
const CARD_RADIUS = { x: 28, y: 22 };
const DEAL_STAGGER_SECONDS = 0.1;

interface RingPosition {
  readonly left: number;
  readonly top: number;
}

/**
 * Raw percent position for a ring element at `visualIndex` of `total`, at
 * `radiusX`/`radiusY` percent from center. Visual index 0 is always the
 * bottom of the oval (standard poker-client convention — "my" seat is
 * remapped to visual index 0 by the caller).
 */
function ringPosition(
  visualIndex: number,
  total: number,
  radiusX: number,
  radiusY: number,
): RingPosition {
  const angle = (visualIndex / Math.max(1, total)) * 2 * Math.PI + Math.PI / 2;
  return { left: 50 + radiusX * Math.cos(angle), top: 50 + radiusY * Math.sin(angle) };
}

/**
 * Where seat `seatIndex` sits in the ring once one extra slot is reserved
 * for the dealer's deck, immediately before the button — every seat at or
 * after the button shifts by one slot to make room. The deck itself always
 * occupies slot `buttonIndex`.
 */
function ringSlotFor(seatIndex: number, buttonIndex: number): number {
  return seatIndex < buttonIndex ? seatIndex : seatIndex + 1;
}

/** For plain (non-animated) absolutely-positioned elements. */
function ringStyle(pos: RingPosition): CSSProperties {
  return { left: `${pos.left}%`, top: `${pos.top}%`, transform: 'translate(-50%, -50%)' };
}

/**
 * For `motion.div` elements: framer-motion manages `transform` itself once a
 * component has animated values (like the fold-exit/deal-in `x`/`y`/`rotate`
 * below), so centering can't go through a raw `transform` string —
 * `translateX`/`translateY` are framer-motion-aware style properties it
 * composes alongside whatever it's animating, instead of conflicting with it.
 */
function motionRingStyle(pos: RingPosition): MotionStyle {
  return { left: `${pos.left}%`, top: `${pos.top}%`, translateX: '-50%', translateY: '-50%' };
}

/** Tracks an element's rendered pixel size, to convert the percent-based ring
 * positions above into pixel offsets for the fold/deal animations. */
function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

/**
 * Bumps once per genuine new-hand transition observed *while mounted* (never
 * on the first render, so joining/reconnecting mid-hand never counts) — used
 * to key the deal-in animation so it only plays for hands you actually watch
 * start, not ones you load straight into.
 */
function useHandDealKey(street: TexasHoldemSnapshot['street']): number {
  const [dealKey, setDealKey] = useState(0);
  const previousStreetRef = useRef(street);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      previousStreetRef.current = street;
      return;
    }
    if (previousStreetRef.current !== 'preflop' && street === 'preflop') {
      setDealKey((key) => key + 1);
    }
    previousStreetRef.current = street;
  }, [street]);

  return dealKey;
}

export function PokerTable({
  snapshot,
  myPlayerId,
  displayName,
  playerDirectory,
  isHost,
  maxSeats,
  onKick,
  onAddBot,
  unitLabel,
}: PokerTableProps) {
  const { ref: tableRef, size: tableSize } = useElementSize();
  const pot = snapshot.players.reduce((sum, player) => sum + player.committed, 0);
  const total = Math.max(maxSeats, snapshot.players.length);
  const ringTotal = total + 1;
  const myIndex = Math.max(
    0,
    snapshot.players.findIndex((player) => player.playerId === myPlayerId),
  );
  const myRingSlot = ringSlotFor(myIndex, snapshot.buttonIndex);
  const anyFolded = snapshot.players.some((player) => player.status === 'folded');
  const handDealKey = useHandDealKey(snapshot.street);

  // Plays the fold sound once per newly-folded player, but never on initial
  // mount (e.g. reconnecting mid-hand where someone's already folded).
  const previouslyFoldedRef = useRef<Set<string>>(
    new Set(snapshot.players.filter((player) => player.status === 'folded').map((p) => p.playerId)),
  );
  const isFirstFoldRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstFoldRenderRef.current) {
      isFirstFoldRenderRef.current = false;
      return;
    }
    const currentlyFolded = new Set(
      snapshot.players
        .filter((player) => player.status === 'folded')
        .map((player) => player.playerId),
    );
    const hasNewFold = [...currentlyFolded].some((id) => !previouslyFoldedRef.current.has(id));
    previouslyFoldedRef.current = currentlyFolded;
    if (hasNewFold) {
      playFoldSound();
    }
  }, [snapshot.players]);

  const toPx = (pos: RingPosition) => ({
    x: (pos.left / 100) * tableSize.width,
    y: (pos.top / 100) * tableSize.height,
  });
  const muckPx = toPx(MUCK_POSITION);
  const deckPos = ringPosition(
    (snapshot.buttonIndex - myRingSlot + ringTotal) % ringTotal,
    ringTotal,
    SEAT_RADIUS.x,
    SEAT_RADIUS.y,
  );
  const deckPx = toPx(deckPos);

  return (
    <div
      ref={tableRef}
      className="relative aspect-[3/2] w-full max-w-4xl"
      data-testid="poker-table"
    >
      <div className="absolute inset-[13%] rounded-[50%] border-4 border-emerald-950 bg-emerald-900" />

      <div className="absolute top-[56%] left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
        <div className="flex items-center gap-2" data-testid="community-cards">
          {Array.from({ length: COMMUNITY_SLOT_COUNT }, (_, index) => {
            const card = snapshot.communityCards[index];
            return (
              <div key={index} className={index === 3 ? 'ml-2' : undefined}>
                {card ? (
                  <PlayingCard card={card} size="lg" />
                ) : (
                  <div
                    data-testid="community-card-slot-empty"
                    className="h-24 w-16 rounded-md border-2 border-dashed border-emerald-700/50"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <motion.div
            key={pot}
            initial={{ scale: 1.3, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            <ChipStack pot={pot} bigBlind={snapshot.bigBlind} />
          </motion.div>
          <span className="text-sm text-neutral-100">
            Pot: {pot} {unitLabel}
          </span>
        </div>

        <div
          data-testid="muck-pile-slot"
          className="flex h-14 w-16 items-center justify-center rounded-md border-2 border-dashed border-emerald-700/40"
        >
          {anyFolded && (
            <div className="flex" data-testid="muck-pile" title="Folded hands">
              <div className="rotate-[-6deg]">
                <PlayingCard card={null} size="xs" />
              </div>
              <div className="-ml-5 rotate-[6deg]">
                <PlayingCard card={null} size="xs" />
              </div>
            </div>
          )}
        </div>

        {snapshot.winners && snapshot.winners.length > 0 && (
          <div className="rounded bg-neutral-950/80 px-2 py-1 text-sm text-amber-300">
            {snapshot.winners.length === 1 ? 'Winner' : 'Winners'}:{' '}
            {snapshot.winners.map(displayName).join(', ')}
          </div>
        )}
      </div>

      <div className="absolute" style={ringStyle(deckPos)} data-testid="dealer-deck-slot">
        <DealerDeck />
      </div>

      {Array.from({ length: total }, (_, seatIndex) => {
        const ringSlot = ringSlotFor(seatIndex, snapshot.buttonIndex);
        const visualIndex = (ringSlot - myRingSlot + ringTotal) % ringTotal;
        const seatPos = ringPosition(visualIndex, ringTotal, SEAT_RADIUS.x, SEAT_RADIUS.y);
        const player = snapshot.players[seatIndex];

        if (!player) {
          return (
            <div key={seatIndex} className="absolute" style={ringStyle(seatPos)}>
              <EmptySeat canAddBot={isHost} onAddBot={onAddBot} />
            </div>
          );
        }

        const directoryEntry = playerDirectory[player.playerId];
        const isMe = player.playerId === myPlayerId;

        return (
          <div
            key={player.playerId}
            className="absolute"
            style={ringStyle(seatPos)}
            data-testid="poker-table-seat"
          >
            <PlayerSeat
              player={player}
              displayName={displayName(player.playerId)}
              isActing={snapshot.actingPlayerId === player.playerId}
              isDealer={seatIndex === snapshot.buttonIndex}
              connected={isMe || (directoryEntry?.connected ?? true)}
              canKick={isHost && !isMe}
              onKick={() => onKick(player.playerId)}
              unitLabel={unitLabel}
            />
          </div>
        );
      })}

      <AnimatePresence>
        {snapshot.players.map((player, seatIndex) => {
          if (player.status === 'folded') {
            return null;
          }
          const ringSlot = ringSlotFor(seatIndex, snapshot.buttonIndex);
          const visualIndex = (ringSlot - myRingSlot + ringTotal) % ringTotal;
          const cardPos = ringPosition(visualIndex, ringTotal, CARD_RADIUS.x, CARD_RADIUS.y);
          const cardPx = toPx(cardPos);
          const dealDistance = (ringSlot - snapshot.buttonIndex + ringTotal) % ringTotal;

          return (
            <DealtCardsGroup
              key={player.playerId}
              holeCards={player.holeCards}
              style={motionRingStyle(cardPos)}
              handDealKey={handDealKey}
              dealFrom={{ x: deckPx.x - cardPx.x, y: deckPx.y - cardPx.y }}
              dealDelay={dealDistance * DEAL_STAGGER_SECONDS}
              exitTo={{ x: muckPx.x - cardPx.x, y: muckPx.y - cardPx.y }}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
