import { describe, expect, it } from 'vitest';
import type { ClientMessage, ServerMessage } from './ws-protocol.js';

describe('ws-protocol envelope', () => {
  it('round-trips client action, chat, leave, cancelTable, addBot, and kick messages through JSON', () => {
    const action: ClientMessage = { type: 'action', action: { type: 'check' } };
    const chat: ClientMessage = { type: 'chat', text: 'nice hand' };
    const leave: ClientMessage = { type: 'leave' };
    const cancelTable: ClientMessage = { type: 'cancelTable' };
    const addBot: ClientMessage = { type: 'addBot' };
    const kick: ClientMessage = { type: 'kick', playerId: 'p2' };

    expect(JSON.parse(JSON.stringify(action))).toEqual(action);
    expect(JSON.parse(JSON.stringify(chat))).toEqual(chat);
    expect(JSON.parse(JSON.stringify(leave))).toEqual(leave);
    expect(JSON.parse(JSON.stringify(cancelTable))).toEqual(cancelTable);
    expect(JSON.parse(JSON.stringify(addBot))).toEqual(addBot);
    expect(JSON.parse(JSON.stringify(kick))).toEqual(kick);
  });

  it('round-trips client settlement messages through JSON', () => {
    const compute: ClientMessage = { type: 'computeSettlement' };
    const generateInvoice: ClientMessage = {
      type: 'generateSettlementInvoice',
      transferId: 'bob:alice',
    };
    const markPaid: ClientMessage = { type: 'markSettlementPaid', transferId: 'bob:alice' };
    const updateSettings: ClientMessage = {
      type: 'updateLightningSettings',
      lightningAddress: 'alice@example.com',
      lnbits: { apiKey: 'key123', baseUrl: 'https://legend.lnbits.com' },
    };

    expect(JSON.parse(JSON.stringify(compute))).toEqual(compute);
    expect(JSON.parse(JSON.stringify(generateInvoice))).toEqual(generateInvoice);
    expect(JSON.parse(JSON.stringify(markPaid))).toEqual(markPaid);
    expect(JSON.parse(JSON.stringify(updateSettings))).toEqual(updateSettings);
  });

  it('round-trips server snapshot, error, lobby, chat, and kicked messages through JSON', () => {
    const snapshot: ServerMessage = {
      type: 'snapshot',
      snapshot: { street: 'preflop' },
      turnExpiresAt: 1700000030000,
    };
    const error: ServerMessage = { type: 'error', message: 'not your turn' };
    const lobby: ServerMessage = {
      type: 'lobby',
      players: [{ playerId: 'p1', nickname: 'Alice', isBot: false, connected: true }],
      maxSeats: 6,
      hostPlayerId: 'p1',
      practiceMode: false,
    };
    const chat: ServerMessage = {
      type: 'chat',
      playerId: 'p1',
      nickname: 'Alice',
      text: 'gg',
      sentAt: 1700000000000,
    };
    const kicked: ServerMessage = { type: 'kicked' };
    const tableEnded: ServerMessage = { type: 'tableEnded' };

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(JSON.parse(JSON.stringify(error))).toEqual(error);
    expect(JSON.parse(JSON.stringify(lobby))).toEqual(lobby);
    expect(JSON.parse(JSON.stringify(chat))).toEqual(chat);
    expect(JSON.parse(JSON.stringify(kicked))).toEqual(kicked);
    expect(JSON.parse(JSON.stringify(tableEnded))).toEqual(tableEnded);
  });

  it('round-trips server settlement and settlementError messages through JSON', () => {
    const settlement: ServerMessage = {
      type: 'settlement',
      netPositions: { alice: 50, bob: -50 },
      transfers: [
        {
          id: 'bob:alice',
          from: 'bob',
          to: 'alice',
          amount: 50,
          payoutMethod: 'lnurl',
          invoice: { bolt11: 'lnbc1invoice' },
          paid: false,
        },
      ],
      unit: 'sats',
    };
    const settlementError: ServerMessage = {
      type: 'settlementError',
      transferId: 'bob:alice',
      message: 'could not resolve invoice',
    };

    expect(JSON.parse(JSON.stringify(settlement))).toEqual(settlement);
    expect(JSON.parse(JSON.stringify(settlementError))).toEqual(settlementError);
  });
});
