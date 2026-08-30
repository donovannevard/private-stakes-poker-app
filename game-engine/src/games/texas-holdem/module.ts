import type { ActionResult, GameModule, PlayerId, SeatedPlayer } from '../../core/types.js';
import { createDeterministicRng } from '../../core/random.js';
import { applyBettingAction, getNextActiveIndex, isStreetComplete } from './betting.js';
import { dealCards, shuffleDeck } from './deck.js';
import { evaluateHand, type HandRank } from './hand-evaluation.js';
import { computeSidePots, distributePots } from './side-pots.js';
import type {
  Card,
  PlayerHandState,
  PublicPlayerView,
  Street,
  TexasHoldemAction,
  TexasHoldemSnapshot,
  TexasHoldemState,
} from './types.js';

export interface TexasHoldemConfig {
  readonly smallBlind: number;
  readonly bigBlind: number;
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

export function createTexasHoldemModule(
  config: TexasHoldemConfig,
): GameModule<TexasHoldemState, TexasHoldemAction> {
  return {
    gameType: 'texas-holdem',

    createInitialState(players, seed, previousState) {
      return createInitialState(players, seed, config, previousState);
    },

    applyAction(state, playerId, action) {
      return applyPlayerAction(state, playerId, action);
    },

    isRoundOver(state) {
      return state.street === 'complete';
    },

    getSettlementDeltas(state) {
      return getSettlementDeltas(state);
    },

    getSnapshot(state, viewerId) {
      return getSnapshot(state, viewerId);
    },
  };
}

function createInitialState(
  seatedPlayers: SeatedPlayer[],
  seed: string,
  config: TexasHoldemConfig,
  previousState?: TexasHoldemState,
): TexasHoldemState {
  if (seatedPlayers.length < MIN_PLAYERS || seatedPlayers.length > MAX_PLAYERS) {
    throw new Error(`Texas Hold'em requires between ${MIN_PLAYERS} and ${MAX_PLAYERS} players`);
  }

  const buttonIndex = previousState ? (previousState.buttonIndex + 1) % seatedPlayers.length : 0;
  const rng = createDeterministicRng(seed);
  const deck = shuffleDeck(rng);

  const { holeCardsByIndex, rest: deckAfterDeal } = dealHoleCards(deck, seatedPlayers.length);

  const blindAssignments = assignBlinds(seatedPlayers.length, buttonIndex, config);

  const players: PlayerHandState[] = seatedPlayers.map((seated, index) => {
    const blind = blindAssignments.blindByIndex.get(index) ?? 0;
    const committed = Math.min(blind, seated.stack);
    const stackAfterBlind = seated.stack - committed;

    return {
      playerId: seated.playerId,
      startingStack: seated.stack,
      stack: stackAfterBlind,
      holeCards: holeCardsByIndex[index]!,
      committed,
      committedThisStreet: committed,
      status: stackAfterBlind === 0 ? 'all-in' : 'active',
      hasActedThisStreet: false,
    };
  });

  return {
    seed,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    buttonIndex,
    players,
    deck: deckAfterDeal,
    communityCards: [],
    street: 'preflop',
    currentBet: config.bigBlind,
    minRaise: config.bigBlind,
    actingIndex: blindAssignments.firstToActIndex,
    winners: null,
    potPayouts: null,
  };
}

function dealHoleCards(
  deck: readonly Card[],
  playerCount: number,
): { holeCardsByIndex: Array<readonly [Card, Card]>; rest: Card[] } {
  let remaining = [...deck];
  const holeCardsByIndex: Array<readonly [Card, Card]> = [];

  for (let i = 0; i < playerCount; i++) {
    const { dealt, rest } = dealCards(remaining, 2);
    holeCardsByIndex.push([dealt[0]!, dealt[1]!]);
    remaining = rest;
  }

  return { holeCardsByIndex, rest: remaining };
}

function assignBlinds(
  playerCount: number,
  buttonIndex: number,
  config: TexasHoldemConfig,
): { blindByIndex: Map<number, number>; firstToActIndex: number } {
  const blindByIndex = new Map<number, number>();

  if (playerCount === 2) {
    // Heads-up: the button posts the small blind and acts first preflop.
    const bigBlindIndex = (buttonIndex + 1) % playerCount;
    blindByIndex.set(buttonIndex, config.smallBlind);
    blindByIndex.set(bigBlindIndex, config.bigBlind);
    return { blindByIndex, firstToActIndex: buttonIndex };
  }

  const smallBlindIndex = (buttonIndex + 1) % playerCount;
  const bigBlindIndex = (buttonIndex + 2) % playerCount;
  blindByIndex.set(smallBlindIndex, config.smallBlind);
  blindByIndex.set(bigBlindIndex, config.bigBlind);

  return { blindByIndex, firstToActIndex: (buttonIndex + 3) % playerCount };
}

function applyPlayerAction(
  state: TexasHoldemState,
  playerId: PlayerId,
  action: TexasHoldemAction,
): ActionResult<TexasHoldemState> {
  if (state.street === 'showdown' || state.street === 'complete') {
    return { ok: false, error: 'hand is already over' };
  }

  if (state.actingIndex === null || state.players[state.actingIndex]!.playerId !== playerId) {
    return { ok: false, error: 'not this player’s turn' };
  }

  const result = applyBettingAction(
    state.players,
    state.actingIndex,
    state.currentBet,
    state.minRaise,
    action,
  );

  if (!result.ok) {
    return result;
  }

  const { players, currentBet, minRaise } = result.update;

  const stillIn = players.filter((player) => player.status !== 'folded');
  if (stillIn.length === 1) {
    return { ok: true, state: finishHandByFold(state, players, stillIn[0]!.playerId) };
  }

  if (!isStreetComplete(players, currentBet)) {
    const nextActingIndex = getNextActiveIndex(players, state.actingIndex);
    return {
      ok: true,
      state: { ...state, players, currentBet, minRaise, actingIndex: nextActingIndex },
    };
  }

  return { ok: true, state: advanceStreet({ ...state, players, currentBet, minRaise }) };
}

function finishHandByFold(
  state: TexasHoldemState,
  players: readonly PlayerHandState[],
  winnerId: PlayerId,
): TexasHoldemState {
  const totalPot = players.reduce((sum, player) => sum + player.committed, 0);
  const potPayouts: Record<PlayerId, number> = {};
  for (const player of players) {
    potPayouts[player.playerId] = player.playerId === winnerId ? totalPot : 0;
  }

  return {
    ...state,
    players,
    street: 'complete',
    actingIndex: null,
    winners: [winnerId],
    potPayouts,
  };
}

const STREET_ORDER: readonly Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];

function advanceStreet(state: TexasHoldemState): TexasHoldemState {
  const currentIndex = STREET_ORDER.indexOf(state.street);
  const nextStreet = STREET_ORDER[currentIndex + 1]!;

  if (nextStreet === 'showdown') {
    return runShowdown(state);
  }

  const cardsToDeal = state.street === 'preflop' ? 3 : 1;
  const { dealt, rest } = dealCards(state.deck, cardsToDeal);

  const resetPlayers = state.players.map((player) =>
    player.status === 'active'
      ? { ...player, committedThisStreet: 0, hasActedThisStreet: false }
      : player,
  );

  const nextState: TexasHoldemState = {
    ...state,
    players: resetPlayers,
    deck: rest,
    communityCards: [...state.communityCards, ...dealt],
    street: nextStreet,
    currentBet: 0,
    minRaise: state.bigBlind,
    actingIndex: null,
  };

  const firstToAct = getNextActiveIndex(resetPlayers, state.buttonIndex);
  if (firstToAct === null) {
    // Nobody left who can still act (everyone remaining is all-in) — run the
    // board out automatically instead of waiting for actions that can't happen.
    return advanceStreet(nextState);
  }

  return { ...nextState, actingIndex: firstToAct };
}

function runShowdown(state: TexasHoldemState): TexasHoldemState {
  const contenders = state.players.filter((player) => player.status !== 'folded');
  const handRanks = new Map<PlayerId, HandRank>(
    contenders.map((player) => [
      player.playerId,
      evaluateHand([...player.holeCards, ...state.communityCards]),
    ]),
  );

  const pots = computeSidePots(state.players);
  const potPayouts = distributePots(pots, handRanks, state.buttonIndex, state.players);
  const winners = Object.entries(potPayouts)
    .filter(([, amount]) => amount > 0)
    .map(([playerId]) => playerId);

  return {
    ...state,
    street: 'complete',
    actingIndex: null,
    winners,
    potPayouts,
  };
}

function getSettlementDeltas(state: TexasHoldemState): Record<PlayerId, number> {
  const deltas: Record<PlayerId, number> = {};

  for (const player of state.players) {
    const payout = state.potPayouts?.[player.playerId] ?? 0;
    deltas[player.playerId] = player.stack + payout - player.startingStack;
  }

  return deltas;
}

function getSnapshot(state: TexasHoldemState, viewerId: PlayerId | null): TexasHoldemSnapshot {
  const revealAll = state.street === 'complete';

  const players: PublicPlayerView[] = state.players.map((player) => {
    const showHoleCards = player.playerId === viewerId || (revealAll && player.status !== 'folded');

    return {
      playerId: player.playerId,
      stack: player.stack,
      committed: player.committed,
      committedThisStreet: player.committedThisStreet,
      status: player.status,
      holeCards: showHoleCards ? player.holeCards : null,
    };
  });

  return {
    street: state.street,
    buttonIndex: state.buttonIndex,
    communityCards: state.communityCards,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    bigBlind: state.bigBlind,
    actingPlayerId: state.actingIndex !== null ? state.players[state.actingIndex]!.playerId : null,
    players,
    winners: state.winners,
    potPayouts: state.potPayouts,
  };
}
