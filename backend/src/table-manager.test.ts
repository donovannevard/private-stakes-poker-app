import { saveHandHistory } from '@lightning-poker/database';
import { StubInvoiceProvider } from '@lightning-poker/settlement';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addBot,
  attachSocket,
  BOT_ACTION_DELAY_MS,
  cancelTable,
  computeSettlement,
  createTable,
  detachSocket,
  DISCONNECT_TIMEOUT_MS,
  generateSettlementInvoice,
  getTable,
  handleClientAction,
  joinTable,
  kickPlayer,
  markSettlementPaid,
  NEXT_HAND_DELAY_MS,
  requestLeave,
  sendChatMessage,
  updateLightningSettings,
  type Socket,
} from './table-manager.js';

vi.mock('@lightning-poker/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lightning-poker/database')>()),
  saveHandHistory: vi.fn(),
}));

function fakeSocket() {
  const messages: unknown[] = [];
  const socket: Socket = {
    send: (data: string) => {
      messages.push(JSON.parse(data));
    },
  };
  return { socket, messages };
}

/** Drives the current hand to completion using check/call for humans and fake-timer bot turns. */
function driveHandToCompletion(tableId: string) {
  let guard = 0;
  for (;;) {
    const table = getTable(tableId)!;
    if (!table.state || table.module.isRoundOver(table.state)) {
      return;
    }
    if (guard++ > 200) {
      throw new Error('hand did not terminate');
    }

    const actingIndex = table.state.actingIndex!;
    const actor = table.state.players[actingIndex]!;
    const rosterEntry = table.roster.find((r) => r.playerId === actor.playerId)!;

    if (rosterEntry.isBot) {
      vi.advanceTimersByTime(BOT_ACTION_DELAY_MS);
    } else {
      const action =
        actor.committedThisStreet === table.state.currentBet
          ? ({ type: 'check' } as const)
          : ({ type: 'call' } as const);
      handleClientAction(tableId, actor.playerId, action);
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(saveHandHistory).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createTable', () => {
  it('starts in a lobby (no hand) when created solo', () => {
    const { tableId } = createTable({ nickname: 'Alice' });
    const table = getTable(tableId)!;

    expect(table.roster).toHaveLength(1);
    expect(table.state).toBeNull();
  });

  it('deals immediately when created with botCount', () => {
    const { tableId } = createTable({ nickname: 'Alice', botCount: 1, maxSeats: 2 });
    const table = getTable(tableId)!;

    expect(table.roster).toHaveLength(2);
    expect(table.roster[1]).toMatchObject({ nickname: 'Bot', isBot: true });
    expect(table.state?.street).toBe('preflop');
  });

  it('fills multiple bot seats with distinctly numbered nicknames', () => {
    const { tableId } = createTable({ nickname: 'Alice', botCount: 3, maxSeats: 4 });
    const table = getTable(tableId)!;

    expect(table.roster).toHaveLength(4);
    expect(table.roster.slice(1).map((r) => r.nickname)).toEqual(['Bot 1', 'Bot 2', 'Bot 3']);
    expect(table.roster.slice(1).every((r) => r.isBot)).toBe(true);
  });

  it('clamps botCount so at least one seat stays open for the host', () => {
    const { tableId } = createTable({ nickname: 'Alice', botCount: 99, maxSeats: 3 });

    expect(getTable(tableId)!.roster).toHaveLength(3);
  });

  it('applies host-configured blinds, starting stack, and turn timeout', () => {
    const { tableId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
      smallBlind: 5,
      bigBlind: 10,
      startingStack: 500,
      turnTimeoutSeconds: 30,
    });
    const table = getTable(tableId)!;

    expect(table.smallBlind).toBe(5);
    expect(table.bigBlind).toBe(10);
    expect(table.startingStack).toBe(500);
    expect(table.turnTimeoutSeconds).toBe(30);
    expect(table.roster.every((r) => r.stack === 500)).toBe(true);
    expect(table.state?.bigBlind).toBe(10);
  });

  it('has no turn timer by default', () => {
    const { tableId } = createTable({ nickname: 'Alice', botCount: 1, maxSeats: 2 });
    expect(getTable(tableId)!.turnTimeoutSeconds).toBeNull();
  });
});

describe('joinTable', () => {
  it('starts the hand once a second player joins a solo lobby', () => {
    const { tableId } = createTable({ nickname: 'Alice' });
    const result = joinTable(tableId, 'Bob');

    expect(result).not.toHaveProperty('error');
    expect(getTable(tableId)!.state?.street).toBe('preflop');
  });

  it('rejects joining a table that does not exist', () => {
    expect(joinTable('nope', 'Bob')).toEqual({ error: 'table not found' });
  });

  it('rejects joining a full table', () => {
    const { tableId } = createTable({ nickname: 'Alice', maxSeats: 2 });
    joinTable(tableId, 'Bob');

    expect(joinTable(tableId, 'Carol')).toEqual({ error: 'table is full' });
  });

  it('adds a mid-hand joiner to the roster without affecting the current hand', () => {
    const { tableId } = createTable({ nickname: 'Alice', maxSeats: 3 });
    joinTable(tableId, 'Bob');
    const handPlayerCount = getTable(tableId)!.state!.players.length;

    joinTable(tableId, 'Carol');

    expect(getTable(tableId)!.state!.players).toHaveLength(handPlayerCount);
    expect(getTable(tableId)!.roster).toHaveLength(3);

    driveHandToCompletion(tableId);
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS);

    expect(getTable(tableId)!.state!.players).toHaveLength(3);
  });
});

describe('addBot', () => {
  it('does nothing when a non-host tries to add a bot', () => {
    const { tableId } = createTable({ nickname: 'Host', maxSeats: 3 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };

    addBot(tableId, bob.playerId);

    expect(getTable(tableId)!.roster).toHaveLength(2);
  });

  it('seats a bot in an open seat and starts a hand if the table was waiting', () => {
    const { tableId, playerId: hostId } = createTable({ nickname: 'Host', maxSeats: 3 });
    expect(getTable(tableId)!.state).toBeNull(); // lobby, waiting for a 2nd player

    addBot(tableId, hostId);

    const table = getTable(tableId)!;
    expect(table.roster).toHaveLength(2);
    expect(table.roster[1]!.isBot).toBe(true);
    expect(table.state?.street).toBe('preflop');
  });

  it('does nothing once the table is full', () => {
    const { tableId, playerId: hostId } = createTable({
      nickname: 'Host',
      maxSeats: 2,
      botCount: 1,
    });
    expect(getTable(tableId)!.roster).toHaveLength(2);

    addBot(tableId, hostId);

    expect(getTable(tableId)!.roster).toHaveLength(2);
  });

  it('never reuses a bot name, even after kick/re-add churn', () => {
    const { tableId, playerId: hostId } = createTable({
      nickname: 'Host',
      maxSeats: 3,
      botCount: 2,
    });
    const firstBotId = getTable(tableId)!.roster[1]!.playerId;
    kickPlayer(tableId, hostId, firstBotId);

    addBot(tableId, hostId);

    const names = getTable(tableId)!.roster.map((r) => r.nickname);
    expect(new Set(names).size).toBe(names.length); // no duplicate names
  });
});

describe('attachSocket', () => {
  it('sends a lobby message while waiting for players', () => {
    const { tableId, playerId } = createTable({ nickname: 'Alice' });
    const { socket, messages } = fakeSocket();

    attachSocket(tableId, playerId, socket);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: 'lobby',
      maxSeats: 6,
      hostPlayerId: playerId,
      practiceMode: false,
    });
  });

  it('sends the roster followed by a snapshot once a hand is underway', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
    });
    const { socket, messages } = fakeSocket();

    attachSocket(tableId, playerId, socket);

    expect(messages[0]).toMatchObject({ type: 'lobby', practiceMode: true });
    expect(messages[1]).toMatchObject({ type: 'snapshot' });
  });
});

describe('handleClientAction', () => {
  it('applies a legal action and broadcasts to every connected socket', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
    });
    const botId = getTable(tableId)!.roster[1]!.playerId;
    const human = fakeSocket();
    const bot = fakeSocket();
    attachSocket(tableId, playerId, human.socket);
    attachSocket(tableId, botId, bot.socket);
    human.messages.length = 0;
    bot.messages.length = 0;

    handleClientAction(tableId, playerId, { type: 'call' });

    expect(human.messages).toHaveLength(1);
    expect(bot.messages).toHaveLength(1);
  });

  it('sends an error to the offending socket only, without mutating state, on an illegal action', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
    });
    const { socket, messages } = fakeSocket();
    attachSocket(tableId, playerId, socket);
    messages.length = 0;

    const stateBefore = getTable(tableId)!.state;
    handleClientAction(tableId, playerId, { type: 'check' }); // facing the big blind

    expect(messages).toEqual([{ type: 'error', message: 'cannot check facing a bet' }]);
    expect(getTable(tableId)!.state).toBe(stateBefore);
  });

  it('ignores actions while the table is in a lobby with no active hand', () => {
    const { tableId, playerId } = createTable({ nickname: 'Alice' });
    expect(() => handleClientAction(tableId, playerId, { type: 'check' })).not.toThrow();
    expect(getTable(tableId)!.state).toBeNull();
  });
});

describe('bot turns', () => {
  it('auto-resolves a bot turn after the configured delay', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
    });

    handleClientAction(tableId, playerId, { type: 'call' }); // hands the turn to the bot (BB)
    const stateBeforeBot = getTable(tableId)!.state;

    vi.advanceTimersByTime(BOT_ACTION_DELAY_MS);

    expect(getTable(tableId)!.state).not.toBe(stateBeforeBot);
  });
});

describe('turn timer', () => {
  it('does not schedule a countdown when no turnTimeoutSeconds is configured', () => {
    const { tableId } = createTable({ nickname: 'Alice', botCount: 1, maxSeats: 2 });
    expect(getTable(tableId)!.turnExpiresAt).toBeNull();
  });

  it('sets a deadline for a connected human on the clock', () => {
    const { tableId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
      turnTimeoutSeconds: 30,
    });

    expect(getTable(tableId)!.turnExpiresAt).toBe(Date.now() + 30_000);
  });

  it('auto-folds the human once the deadline passes, without marking them forced out', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
      turnTimeoutSeconds: 30,
    });

    vi.advanceTimersByTime(30_000);

    const table = getTable(tableId)!;
    expect(table.state?.street).toBe('complete');
    expect(table.state?.winners).toEqual([table.roster[1]!.playerId]);
    const entry = table.roster.find((r) => r.playerId === playerId)!;
    expect(entry.forcedOut).toBe(false);
    expect(entry.leaveRequested).toBe(false);
  });

  it('does not fire a stale timer once the player has acted in time', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
      turnTimeoutSeconds: 30,
    });

    handleClientAction(tableId, playerId, { type: 'call' }); // acts well before the deadline

    // Advancing past the original (now-stale) deadline also lets the bot's
    // own 1s-delayed turn resolve — the point here is only that Alice, who
    // already acted, is never the one auto-folded by her own old timer.
    vi.advanceTimersByTime(30_000);

    const player = getTable(tableId)!.state!.players.find((p) => p.playerId === playerId)!;
    expect(player.status).not.toBe('folded');
  });

  it('does not run a countdown for a bot turn', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
      turnTimeoutSeconds: 30,
    });

    handleClientAction(tableId, playerId, { type: 'call' }); // hands the turn to the bot

    expect(getTable(tableId)!.turnExpiresAt).toBeNull();
  });

  it('surfaces the deadline on the snapshot message', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
      turnTimeoutSeconds: 30,
    });
    const { socket, messages } = fakeSocket();

    attachSocket(tableId, playerId, socket);

    const snapshotMessage = messages.find((m) => (m as { type: string }).type === 'snapshot');
    expect(snapshotMessage).toMatchObject({ turnExpiresAt: Date.now() + 30_000 });
  });
});

describe('automatic next hand', () => {
  it('starts the next hand with rotated stacks after the delay', () => {
    const { tableId } = createTable({ nickname: 'Alice', botCount: 1, maxSeats: 2 });
    const initialButtonIndex = getTable(tableId)!.state!.buttonIndex;

    driveHandToCompletion(tableId);
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS);

    const nextState = getTable(tableId)!.state!;
    expect(nextState.street).toBe('preflop');
    expect(nextState.buttonIndex).toBe((initialButtonIndex + 1) % 2);
  });
});

describe('requestLeave', () => {
  it('removes the player immediately when the table is a pure lobby, deleting the now-empty table', () => {
    const { tableId, playerId } = createTable({ nickname: 'Solo' });

    requestLeave(tableId, playerId);

    expect(getTable(tableId)).toBeUndefined();
  });

  it('defers removal until the next hand boundary when a hand is in progress', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
    });

    requestLeave(tableId, playerId);
    expect(getTable(tableId)!.roster).toHaveLength(2); // still there mid-hand

    driveHandToCompletion(tableId);
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS);

    expect(getTable(tableId)!.roster.some((r) => r.playerId === playerId)).toBe(false);
  });

  it('drops the table back to a lobby when fewer than 2 players remain after a leave', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
    });
    const botId = getTable(tableId)!.roster[1]!.playerId;

    requestLeave(tableId, botId);
    driveHandToCompletion(tableId);
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS);

    const table = getTable(tableId)!;
    expect(table.state).toBeNull();
    expect(table.roster).toHaveLength(1);
    expect(table.roster[0]!.playerId).toBe(playerId);
  });
});

describe('disconnect timeout', () => {
  it('starts the 60s clock at disconnect and dulls the roster for everyone else immediately', () => {
    const { tableId, playerId: hostId } = createTable({ nickname: 'Host', maxSeats: 2 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };
    const hostSocket = fakeSocket();
    const bobSocket = fakeSocket();
    attachSocket(tableId, hostId, hostSocket.socket);
    attachSocket(tableId, bob.playerId, bobSocket.socket);
    hostSocket.messages.length = 0;

    detachSocket(tableId, bob.playerId);

    const lastMessage = hostSocket.messages.at(-1) as {
      players: Array<{ playerId: string; connected: boolean }>;
    };
    expect(lastMessage.players.find((p) => p.playerId === bob.playerId)?.connected).toBe(false);
  });

  it('ends a solo practice table once its only human (the host) never reconnects', () => {
    // The single human is always roster[0]/host at a solo bot table.
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
    });
    const { socket } = fakeSocket();
    attachSocket(tableId, playerId, socket);
    detachSocket(tableId, playerId);

    vi.advanceTimersByTime(DISCONNECT_TIMEOUT_MS);

    expect(getTable(tableId)).toBeUndefined();
  });

  it('removes a timed-out non-host player from the roster at the next hand boundary, without ending the table', () => {
    const { tableId, playerId: hostId } = createTable({ nickname: 'Host', maxSeats: 2 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };
    attachSocket(tableId, bob.playerId, fakeSocket().socket);
    detachSocket(tableId, bob.playerId);
    vi.advanceTimersByTime(DISCONNECT_TIMEOUT_MS); // flags Bob forcedOut; not his turn yet

    handleClientAction(tableId, hostId, { type: 'call' }); // hands turn to Bob -> instant auto-fold
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS);

    const table = getTable(tableId)!;
    expect(table.roster.some((r) => r.playerId === bob.playerId)).toBe(false);
    expect(table.roster.some((r) => r.playerId === hostId)).toBe(true);
  });

  it('ends a real multi-human table and broadcasts final settlement when the host never reconnects', () => {
    const { tableId, playerId: hostId } = createTable({ nickname: 'Host', maxSeats: 2 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };
    attachSocket(tableId, hostId, fakeSocket().socket);
    const bobConn = fakeSocket();
    attachSocket(tableId, bob.playerId, bobConn.socket);
    bobConn.messages.length = 0;

    detachSocket(tableId, hostId);
    vi.advanceTimersByTime(DISCONNECT_TIMEOUT_MS);

    expect(getTable(tableId)).toBeUndefined();
    expect(bobConn.messages).toContainEqual(expect.objectContaining({ type: 'settlement' }));
    expect(bobConn.messages).toContainEqual({ type: 'tableEnded' });
  });

  it('does not time out once the player has reconnected, and un-dulls them for others', () => {
    const { tableId, playerId: hostId } = createTable({ nickname: 'Host', maxSeats: 2 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };
    const hostSocket = fakeSocket();
    const bobSocket = fakeSocket();
    attachSocket(tableId, hostId, hostSocket.socket);
    attachSocket(tableId, bob.playerId, bobSocket.socket);

    detachSocket(tableId, bob.playerId);
    attachSocket(tableId, bob.playerId, bobSocket.socket); // reconnects before the timer fires

    hostSocket.messages.length = 0;
    vi.advanceTimersByTime(DISCONNECT_TIMEOUT_MS);

    expect(getTable(tableId)!.state?.street).toBe('preflop');
    expect(getTable(tableId)!.roster.find((r) => r.playerId === bob.playerId)?.forcedOut).toBe(
      false,
    );
    expect(hostSocket.messages).toHaveLength(0); // no further roster update fired
  });

  it('folds a forced-out player instantly once their turn arrives, even if flagged earlier', () => {
    // Heads-up: button (Host) acts first preflop, so Bob isn't on the clock
    // yet when he disconnects and times out.
    const { tableId, playerId: hostId } = createTable({ nickname: 'Host', maxSeats: 2 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };

    attachSocket(tableId, bob.playerId, fakeSocket().socket);
    detachSocket(tableId, bob.playerId);
    vi.advanceTimersByTime(DISCONNECT_TIMEOUT_MS);
    expect(getTable(tableId)!.state?.street).toBe('preflop'); // still Host's turn — untouched
    expect(getTable(tableId)!.roster.find((r) => r.playerId === bob.playerId)?.forcedOut).toBe(
      true,
    );

    // Host calls, handing the turn to Bob — who is auto-folded instantly
    // (within this single synchronous call, no further timer needed) rather
    // than the table waiting on him again.
    handleClientAction(tableId, hostId, { type: 'call' });

    const table = getTable(tableId)!;
    expect(table.state!.street).toBe('complete');
    expect(table.state!.winners).toEqual([hostId]);
  });
});

describe('kickPlayer', () => {
  it('does nothing when a non-host tries to kick someone', () => {
    const { tableId } = createTable({ nickname: 'Host', botCount: 1, maxSeats: 3 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };
    const botId = getTable(tableId)!.roster.find((r) => r.isBot)!.playerId;

    kickPlayer(tableId, bob.playerId, botId); // Bob isn't the host

    expect(getTable(tableId)!.roster.some((r) => r.playerId === botId)).toBe(true);
  });

  it('does nothing when the host tries to kick themselves', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Host',
      botCount: 1,
      maxSeats: 2,
    });

    kickPlayer(tableId, playerId, playerId);

    expect(getTable(tableId)!.roster.some((r) => r.playerId === playerId)).toBe(true);
  });

  it('force-folds the target immediately when kicking the current actor', () => {
    const { tableId, playerId: hostId } = createTable({ nickname: 'Host', maxSeats: 3 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };
    joinTable(tableId, 'Carol');

    handleClientAction(tableId, hostId, { type: 'call' }); // hands the turn to Bob (SB)
    kickPlayer(tableId, hostId, bob.playerId);

    const table = getTable(tableId)!;
    const bobPlayer = table.state!.players.find((p) => p.playerId === bob.playerId)!;
    expect(bobPlayer.status).toBe('folded');
    expect(table.roster.find((r) => r.playerId === bob.playerId)?.forcedOut).toBe(true);
  });

  it('sends the target a kicked message and stops sending them further updates', () => {
    const { tableId, playerId: hostId } = createTable({ nickname: 'Host', maxSeats: 3 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };
    joinTable(tableId, 'Carol');
    const { socket, messages } = fakeSocket();
    attachSocket(tableId, bob.playerId, socket);
    messages.length = 0;

    kickPlayer(tableId, hostId, bob.playerId);

    expect(messages).toEqual([{ type: 'kicked' }]);
  });

  it('clears a connected client’s stale snapshot once kicks drop the table below the player minimum', () => {
    const { tableId, playerId: hostId } = createTable({ nickname: 'Host', maxSeats: 2 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };
    const { socket, messages } = fakeSocket();
    attachSocket(tableId, hostId, socket);
    messages.length = 0;

    handleClientAction(tableId, hostId, { type: 'call' }); // hands the turn to Bob (heads-up)
    kickPlayer(tableId, hostId, bob.playerId); // force-folds Bob instantly -> hand completes
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS); // Bob leaves the roster at the hand boundary

    expect(getTable(tableId)!.state).toBeNull();
    expect(getTable(tableId)!.roster).toHaveLength(1);
    expect(messages).toContainEqual({ type: 'snapshot', snapshot: null, turnExpiresAt: null });
  });
});

describe('cancelTable', () => {
  it('does nothing when a non-host tries to cancel', () => {
    const { tableId } = createTable({ nickname: 'Host', maxSeats: 2 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };

    cancelTable(tableId, bob.playerId);

    expect(getTable(tableId)).toBeDefined();
  });

  it('ends a real table, broadcasting final settlement then tableEnded to every other player', () => {
    const { tableId, playerId: hostId } = createTable({ nickname: 'Host', maxSeats: 2 });
    const bob = joinTable(tableId, 'Bob') as { playerId: string };
    const bobConn = fakeSocket();
    attachSocket(tableId, bob.playerId, bobConn.socket);
    bobConn.messages.length = 0;

    cancelTable(tableId, hostId);

    expect(getTable(tableId)).toBeUndefined();
    expect(bobConn.messages).toContainEqual(expect.objectContaining({ type: 'settlement' }));
    expect(bobConn.messages).toContainEqual({ type: 'tableEnded' });
  });

  it('ends a practice table without broadcasting a settlement', () => {
    const { tableId, playerId: hostId } = createTable({
      nickname: 'Host',
      botCount: 1,
      maxSeats: 2,
    });

    cancelTable(tableId, hostId);

    expect(getTable(tableId)).toBeUndefined();
  });
});

describe('sendChatMessage', () => {
  it('broadcasts a chat message to every connected socket', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
    });
    const botId = getTable(tableId)!.roster[1]!.playerId;
    const human = fakeSocket();
    const bot = fakeSocket();
    attachSocket(tableId, playerId, human.socket);
    attachSocket(tableId, botId, bot.socket);
    human.messages.length = 0;
    bot.messages.length = 0;

    sendChatMessage(tableId, playerId, 'nice hand');

    expect(human.messages).toEqual([
      { type: 'chat', playerId, nickname: 'Alice', text: 'nice hand', sentAt: expect.any(Number) },
    ]);
    expect(bot.messages).toHaveLength(1);
  });

  it('ignores blank messages', () => {
    const { tableId, playerId } = createTable({
      nickname: 'Alice',
      botCount: 1,
      maxSeats: 2,
    });
    const { socket, messages } = fakeSocket();
    attachSocket(tableId, playerId, socket);
    messages.length = 0;

    sendChatMessage(tableId, playerId, '   ');

    expect(messages).toHaveLength(0);
  });
});

describe('settlement', () => {
  /** Real (no-bot) 2-player table — settlement is unavailable on practice tables. */
  function createRealTable() {
    const { tableId, playerId: aliceId } = createTable({ nickname: 'Alice', maxSeats: 2 });
    const { playerId: bobId } = joinTable(tableId, 'Bob') as { playerId: string };
    return { tableId, aliceId, bobId };
  }

  function attach(tableId: string, playerId: string) {
    const { socket, messages } = fakeSocket();
    attachSocket(tableId, playerId, socket);
    messages.length = 0;
    return { socket, messages };
  }

  it('rejects settlement computation for a practice-mode (bot) table', () => {
    const { tableId, playerId } = createTable({ nickname: 'Alice', botCount: 1, maxSeats: 2 });
    const { messages } = attach(tableId, playerId);

    computeSettlement(tableId, playerId);

    expect(messages).toEqual([
      {
        type: 'settlementError',
        transferId: undefined,
        message: 'settlement is not available for practice tables',
      },
    ]);
  });

  it('computes net positions and a transfer once stacks diverge', () => {
    const { tableId, aliceId, bobId } = createRealTable();
    const table = getTable(tableId)!;
    table.roster.find((r) => r.playerId === aliceId)!.stack = 250;
    table.roster.find((r) => r.playerId === bobId)!.stack = 150;
    const { messages } = attach(tableId, aliceId);

    computeSettlement(tableId, aliceId);

    expect(messages).toEqual([
      {
        type: 'settlement',
        netPositions: { [aliceId]: 50, [bobId]: -50 },
        transfers: [
          {
            id: `${bobId}:${aliceId}`,
            from: bobId,
            to: aliceId,
            amount: 50,
            payoutMethod: 'manual',
            invoice: undefined,
            paid: false,
          },
        ],
        unit: 'sats',
      },
    ]);
  });

  it('still accounts for a player who already left', () => {
    // A real 2-player table deals immediately, so leaving only flags intent
    // (`leaveRequested`) until the current hand finishes — matching
    // `requestLeave`'s existing deferred-removal behavior for a hand in
    // progress (see the `requestLeave` describe block above).
    const { tableId, aliceId, bobId } = createRealTable();
    requestLeave(tableId, bobId);
    driveHandToCompletion(tableId);
    vi.advanceTimersByTime(NEXT_HAND_DELAY_MS); // prunes Bob, snapshotting his final net position

    expect(getTable(tableId)!.roster.some((r) => r.playerId === bobId)).toBe(false);

    const { messages } = attach(tableId, aliceId);
    computeSettlement(tableId, aliceId);

    const settlementMessage = messages[0] as { netPositions: Record<string, number> };
    expect(Object.keys(settlementMessage.netPositions).sort()).toEqual([aliceId, bobId].sort());
    // Chip-conservation: whatever the hand's outcome, the two net positions cancel out.
    expect(settlementMessage.netPositions[aliceId]! + settlementMessage.netPositions[bobId]!).toBe(
      0,
    );
  });

  it('picks lnbits over a lightning address, and a lightning address over manual', () => {
    const { tableId, aliceId, bobId } = createRealTable();
    const table = getTable(tableId)!;
    table.roster.find((r) => r.playerId === aliceId)!.stack = 250;
    table.roster.find((r) => r.playerId === bobId)!.stack = 150;

    updateLightningSettings(tableId, aliceId, { lightningAddress: 'alice@example.com' });
    const { messages: afterAddress } = attach(tableId, bobId);
    computeSettlement(tableId, bobId);
    expect(
      (afterAddress[0] as { transfers: Array<{ payoutMethod: string }> }).transfers[0]!,
    ).toMatchObject({ payoutMethod: 'lnurl' });

    updateLightningSettings(tableId, aliceId, { lnbits: { apiKey: 'key123' } });
    afterAddress.length = 0;
    computeSettlement(tableId, bobId);
    expect(
      (afterAddress[0] as { transfers: Array<{ payoutMethod: string }> }).transfers[0]!,
    ).toMatchObject({ payoutMethod: 'lnbits' });
  });

  it('clears a previously registered lightning address when updated with null', () => {
    const { tableId, aliceId } = createRealTable();
    updateLightningSettings(tableId, aliceId, { lightningAddress: 'alice@example.com' });
    expect(getTable(tableId)!.roster.find((r) => r.playerId === aliceId)!.lightningAddress).toBe(
      'alice@example.com',
    );

    updateLightningSettings(tableId, aliceId, { lightningAddress: null });

    expect(
      getTable(tableId)!.roster.find((r) => r.playerId === aliceId)!.lightningAddress,
    ).toBeUndefined();
  });

  it('generates an invoice via an injected provider and broadcasts it', async () => {
    const { tableId, aliceId, bobId } = createRealTable();
    const table = getTable(tableId)!;
    table.roster.find((r) => r.playerId === aliceId)!.stack = 250;
    table.roster.find((r) => r.playerId === bobId)!.stack = 150;
    computeSettlement(tableId, aliceId);
    const transferId = `${bobId}:${aliceId}`;

    const { messages } = attach(tableId, aliceId);
    const stub = new StubInvoiceProvider();
    await generateSettlementInvoice(tableId, bobId, transferId, () => stub);

    const settlementMessage = messages.find(
      (m) => (m as { type: string }).type === 'settlement',
    ) as { transfers: Array<{ id: string; invoice?: { bolt11: string } }> } | undefined;
    const transfer = settlementMessage?.transfers.find((t) => t.id === transferId);
    expect(transfer?.invoice?.bolt11).toBe('lnbcstub50stub');
  });

  it('rejects invoice generation from someone not party to the transfer', async () => {
    const { tableId } = createTable({ nickname: 'Alice', maxSeats: 3 });
    const { playerId: bobId } = joinTable(tableId, 'Bob') as { playerId: string };
    const { playerId: carolId } = joinTable(tableId, 'Carol') as { playerId: string };
    const table = getTable(tableId)!;
    table.roster.find((r) => r.playerId === bobId)!.stack = 150;
    table.roster.find((r) => r.playerId === carolId)!.stack = 250;
    computeSettlement(tableId, bobId);
    const transferId = `${bobId}:${carolId}`;

    const { messages } = attach(tableId, table.roster[0]!.playerId);
    await generateSettlementInvoice(tableId, table.roster[0]!.playerId, transferId, () => {
      throw new Error('should not resolve a provider for an unauthorized request');
    });

    expect(messages).toEqual([
      { type: 'settlementError', transferId, message: 'not authorized for this transfer' },
    ]);
  });

  it('reports no Lightning method registered when the payee has none linked', async () => {
    const { tableId, aliceId, bobId } = createRealTable();
    const table = getTable(tableId)!;
    table.roster.find((r) => r.playerId === aliceId)!.stack = 250;
    table.roster.find((r) => r.playerId === bobId)!.stack = 150;
    computeSettlement(tableId, aliceId);
    const transferId = `${bobId}:${aliceId}`;

    const { messages } = attach(tableId, bobId);
    await generateSettlementInvoice(tableId, bobId, transferId);

    expect(messages).toEqual([
      {
        type: 'settlementError',
        transferId,
        message: 'no Lightning method registered for the recipient',
      },
    ]);
  });

  it('marks a transfer paid only when requested by the payer or payee', () => {
    const { tableId, aliceId, bobId } = createRealTable();
    const table = getTable(tableId)!;
    table.roster.find((r) => r.playerId === aliceId)!.stack = 250;
    table.roster.find((r) => r.playerId === bobId)!.stack = 150;
    computeSettlement(tableId, aliceId);
    const transferId = `${bobId}:${aliceId}`;

    markSettlementPaid(tableId, aliceId, transferId);

    expect(getTable(tableId)!.settlement!.transfers.find((t) => t.id === transferId)!.paid).toBe(
      true,
    );
  });

  it('rejects marking a transfer paid by someone not party to it', () => {
    const { tableId } = createTable({ nickname: 'Alice', maxSeats: 3 });
    const { playerId: bobId } = joinTable(tableId, 'Bob') as { playerId: string };
    const { playerId: carolId } = joinTable(tableId, 'Carol') as { playerId: string };
    const table = getTable(tableId)!;
    table.roster.find((r) => r.playerId === bobId)!.stack = 150;
    table.roster.find((r) => r.playerId === carolId)!.stack = 250;
    computeSettlement(tableId, bobId);
    const transferId = `${bobId}:${carolId}`;

    const outsiderId = table.roster[0]!.playerId;
    markSettlementPaid(tableId, outsiderId, transferId);

    expect(getTable(tableId)!.settlement!.transfers.find((t) => t.id === transferId)!.paid).toBe(
      false,
    );
  });

  it('polls an lnbits-linked payee and confirms payment automatically', async () => {
    const { tableId, aliceId, bobId } = createRealTable();
    const table = getTable(tableId)!;
    table.roster.find((r) => r.playerId === aliceId)!.stack = 250;
    table.roster.find((r) => r.playerId === bobId)!.stack = 150;
    computeSettlement(tableId, aliceId);
    const transferId = `${bobId}:${aliceId}`;

    const stub = new StubInvoiceProvider(true);
    await generateSettlementInvoice(tableId, bobId, transferId, () => stub);
    expect(getTable(tableId)!.settlement!.transfers.find((t) => t.id === transferId)!.paid).toBe(
      false,
    );

    stub.markPaidForTesting();
    await vi.advanceTimersByTimeAsync(4000);

    expect(getTable(tableId)!.settlement!.transfers.find((t) => t.id === transferId)!.paid).toBe(
      true,
    );
  });
});

describe('hand-history audit trail', () => {
  it('persists a durable record of the completed hand, separate from crash-recovery state', async () => {
    const { tableId } = createTable({ nickname: 'Alice', maxSeats: 2 });
    const { playerId: bobId } = joinTable(tableId, 'Bob') as { playerId: string };
    const seedAtStart = getTable(tableId)!.state!.seed;

    driveHandToCompletion(tableId);
    // enqueuePersist chains onto a promise queue, so the call lands on a
    // later microtask rather than synchronously within driveHandToCompletion.
    await vi.waitFor(() => expect(saveHandHistory).toHaveBeenCalled());

    expect(saveHandHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId,
        seed: seedAtStart,
        players: expect.arrayContaining([expect.objectContaining({ playerId: bobId })]),
        actionLog: expect.any(Array),
      }),
    );
  });
});
