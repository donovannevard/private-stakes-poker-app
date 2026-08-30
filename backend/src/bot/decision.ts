import {
  applyBettingAction,
  type PlayerHandState,
  type PlayerId,
  type TexasHoldemAction,
  type TexasHoldemState,
} from '@lightning-poker/game-engine';
import { chenScore } from './chen-score.js';
import { estimateEquity, type OpponentRange } from './equity.js';
import { positionLooseness } from './position.js';

export interface BotActionLogEntry {
  readonly playerId: PlayerId;
  readonly action: TexasHoldemAction;
}

export interface BotDecisionInput {
  readonly state: TexasHoldemState;
  readonly actingIndex: number;
  /** This hand's action log so far, used to infer opponents' ranges from their aggression. */
  readonly actionLog: readonly BotActionLogEntry[];
  /** 0-100: how closely the bot follows the equity-optimal line vs. playing looser/noisier. */
  readonly skill?: number;
  /** Injectable for deterministic tests; defaults to Math.random. */
  readonly rng?: () => number;
}

export const DEFAULT_BOT_SKILL = 70;

const MAX_DEVIATION_RATE = 0.3;
const BASE_BLUFF_RATE = 0.06;
const RAISE_POT_FRACTION = 2 / 3;
const CALL_MARGIN = 0.05;
const VALUE_RAISE_MARGIN = 0.18;
const BET_FOR_VALUE_THRESHOLD = 0.62;

export function chooseBotAction(input: BotDecisionInput): TexasHoldemAction {
  const { state, actingIndex, actionLog } = input;
  const skill = clamp(input.skill ?? DEFAULT_BOT_SKILL, 0, 100);
  const rng = input.rng ?? Math.random;

  const player = state.players[actingIndex]!;
  const facingBet = player.committedThisStreet < state.currentBet;
  const potSize = state.players.reduce((sum, p) => sum + p.committed, 0);

  const strength = estimateStrength(state, actingIndex, actionLog, rng);
  const idealAction = decideIdeal(state, actingIndex, player, facingBet, potSize, strength);

  const bluffRate = BASE_BLUFF_RATE * (0.5 + skill / 200);
  const deviationRate = MAX_DEVIATION_RATE * (1 - skill / 100);
  const roll = rng();

  if (roll < bluffRate && (idealAction.type === 'fold' || idealAction.type === 'check')) {
    const bluff = tryRaise(state, actingIndex, player, potSize);
    if (bluff) {
      return bluff;
    }
  } else if (roll < bluffRate + deviationRate) {
    return randomLegalAction(state, actingIndex, player, facingBet, potSize, rng);
  }

  return idealAction;
}

function estimateStrength(
  state: TexasHoldemState,
  actingIndex: number,
  actionLog: readonly BotActionLogEntry[],
  rng: () => number,
): number {
  const player = state.players[actingIndex]!;

  if (state.communityCards.length === 0) {
    const chen = chenScore(player.holeCards);
    const looseness = positionLooseness(actingIndex, state.buttonIndex, state.players.length);
    const base = clamp((chen + 2) / 22, 0, 1);
    return clamp(base * (0.7 + 0.3 * looseness), 0, 1);
  }

  const opponents = inferOpponentRanges(state, actingIndex, actionLog);
  return estimateEquity(player.holeCards, state.communityCards, opponents, chenScore, rng);
}

function inferOpponentRanges(
  state: TexasHoldemState,
  actingIndex: number,
  actionLog: readonly BotActionLogEntry[],
): OpponentRange[] {
  return state.players
    .filter((p, index) => index !== actingIndex && p.status !== 'folded')
    .map((p) => {
      const raiseCount = actionLog.filter(
        (entry) => entry.playerId === p.playerId && entry.action.type === 'raise',
      ).length;
      const minChenScore = raiseCount === 0 ? 4 : raiseCount === 1 ? 9 : 14;
      return { playerId: p.playerId, minChenScore };
    });
}

/**
 * The equity-optimal line for a given hand-strength signal, with no
 * randomization — exported separately from `chooseBotAction` so it can be
 * tested directly against synthetic strength values, independent of both the
 * Monte-Carlo equity estimate and the bluff/deviation randomization.
 */
export function decideIdeal(
  state: TexasHoldemState,
  actingIndex: number,
  player: PlayerHandState,
  facingBet: boolean,
  potSize: number,
  strength: number,
): TexasHoldemAction {
  if (!facingBet) {
    if (strength >= BET_FOR_VALUE_THRESHOLD) {
      const raise = tryRaise(state, actingIndex, player, potSize);
      if (raise) {
        return raise;
      }
    }
    return { type: 'check' };
  }

  const callAmount = Math.min(state.currentBet - player.committedThisStreet, player.stack);
  const potOdds = callAmount / (potSize + callAmount);

  if (strength >= potOdds + CALL_MARGIN + VALUE_RAISE_MARGIN) {
    const raise = tryRaise(state, actingIndex, player, potSize);
    if (raise) {
      return raise;
    }
    return { type: 'call' };
  }
  if (strength >= potOdds + CALL_MARGIN) {
    return { type: 'call' };
  }
  return { type: 'fold' };
}

function tryRaise(
  state: TexasHoldemState,
  actingIndex: number,
  player: PlayerHandState,
  potSize: number,
): TexasHoldemAction | null {
  const desiredIncrement = Math.max(state.minRaise, Math.round(potSize * RAISE_POT_FRACTION));
  const toAmount = Math.min(
    state.currentBet + desiredIncrement,
    player.committedThisStreet + player.stack,
  );
  const action: TexasHoldemAction = { type: 'raise', toAmount };
  const result = applyBettingAction(
    state.players,
    actingIndex,
    state.currentBet,
    state.minRaise,
    action,
  );
  return result.ok ? action : null;
}

function randomLegalAction(
  state: TexasHoldemState,
  actingIndex: number,
  player: PlayerHandState,
  facingBet: boolean,
  potSize: number,
  rng: () => number,
): TexasHoldemAction {
  const options: TexasHoldemAction[] = [
    { type: 'fold' },
    facingBet ? { type: 'call' } : { type: 'check' },
  ];
  const raise = tryRaise(state, actingIndex, player, potSize);
  if (raise) {
    options.push(raise);
  }
  return options[Math.floor(rng() * options.length)]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
