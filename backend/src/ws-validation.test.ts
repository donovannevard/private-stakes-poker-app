import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './ws-validation.js';

describe('parseClientMessage', () => {
  it('rejects non-object input', () => {
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage('hello')).toBeNull();
    expect(parseClientMessage(42)).toBeNull();
    expect(parseClientMessage(['action'])).toBeNull();
  });

  it('rejects a missing or unknown type', () => {
    expect(parseClientMessage({})).toBeNull();
    expect(parseClientMessage({ type: 'nonsense' })).toBeNull();
    expect(parseClientMessage({ type: 123 })).toBeNull();
  });

  describe('action', () => {
    it('accepts a well-formed action envelope', () => {
      expect(parseClientMessage({ type: 'action', action: { type: 'check' } })).toEqual({
        type: 'action',
        action: { type: 'check' },
      });
    });

    it('rejects a null or non-object action', () => {
      expect(parseClientMessage({ type: 'action', action: null })).toBeNull();
      expect(parseClientMessage({ type: 'action', action: 'check' })).toBeNull();
      expect(parseClientMessage({ type: 'action' })).toBeNull();
    });

    it('rejects an action object with a non-string type', () => {
      expect(parseClientMessage({ type: 'action', action: { type: 123 } })).toBeNull();
    });
  });

  describe('chat', () => {
    it('accepts a string text', () => {
      expect(parseClientMessage({ type: 'chat', text: 'hi' })).toEqual({
        type: 'chat',
        text: 'hi',
      });
    });

    it('rejects a non-string text', () => {
      expect(parseClientMessage({ type: 'chat', text: 123 })).toBeNull();
      expect(parseClientMessage({ type: 'chat' })).toBeNull();
    });
  });

  it('accepts leave, cancelTable, addBot, and computeSettlement with no extra fields', () => {
    expect(parseClientMessage({ type: 'leave' })).toEqual({ type: 'leave' });
    expect(parseClientMessage({ type: 'cancelTable' })).toEqual({ type: 'cancelTable' });
    expect(parseClientMessage({ type: 'addBot' })).toEqual({ type: 'addBot' });
    expect(parseClientMessage({ type: 'computeSettlement' })).toEqual({
      type: 'computeSettlement',
    });
  });

  describe('kick', () => {
    it('accepts a non-empty string playerId', () => {
      expect(parseClientMessage({ type: 'kick', playerId: 'p1' })).toEqual({
        type: 'kick',
        playerId: 'p1',
      });
    });

    it('rejects a non-string or empty playerId', () => {
      expect(parseClientMessage({ type: 'kick', playerId: 42 })).toBeNull();
      expect(parseClientMessage({ type: 'kick', playerId: '' })).toBeNull();
      expect(parseClientMessage({ type: 'kick' })).toBeNull();
    });
  });

  describe('generateSettlementInvoice / markSettlementPaid', () => {
    it('accepts a non-empty string transferId', () => {
      expect(parseClientMessage({ type: 'generateSettlementInvoice', transferId: 't1' })).toEqual({
        type: 'generateSettlementInvoice',
        transferId: 't1',
      });
      expect(parseClientMessage({ type: 'markSettlementPaid', transferId: 't1' })).toEqual({
        type: 'markSettlementPaid',
        transferId: 't1',
      });
    });

    it('rejects a non-string or missing transferId', () => {
      expect(parseClientMessage({ type: 'generateSettlementInvoice', transferId: 5 })).toBeNull();
      expect(parseClientMessage({ type: 'markSettlementPaid' })).toBeNull();
    });
  });

  describe('updateLightningSettings', () => {
    it('accepts omitted, null, and string lightningAddress', () => {
      expect(parseClientMessage({ type: 'updateLightningSettings' })).toEqual({
        type: 'updateLightningSettings',
        lightningAddress: undefined,
        lnbits: undefined,
      });
      expect(
        parseClientMessage({ type: 'updateLightningSettings', lightningAddress: null }),
      ).toEqual({ type: 'updateLightningSettings', lightningAddress: null, lnbits: undefined });
      expect(
        parseClientMessage({ type: 'updateLightningSettings', lightningAddress: 'me@wallet' }),
      ).toEqual({
        type: 'updateLightningSettings',
        lightningAddress: 'me@wallet',
        lnbits: undefined,
      });
    });

    it('rejects a non-string lightningAddress', () => {
      expect(
        parseClientMessage({ type: 'updateLightningSettings', lightningAddress: 42 }),
      ).toBeNull();
    });

    it('accepts a well-formed lnbits object, with or without baseUrl', () => {
      expect(
        parseClientMessage({ type: 'updateLightningSettings', lnbits: { apiKey: 'key' } }),
      ).toEqual({
        type: 'updateLightningSettings',
        lightningAddress: undefined,
        lnbits: { apiKey: 'key' },
      });
      expect(
        parseClientMessage({
          type: 'updateLightningSettings',
          lnbits: { apiKey: 'key', baseUrl: 'https://example.com' },
        }),
      ).toEqual({
        type: 'updateLightningSettings',
        lightningAddress: undefined,
        lnbits: { apiKey: 'key', baseUrl: 'https://example.com' },
      });
    });

    it('rejects a malformed lnbits object', () => {
      expect(
        parseClientMessage({ type: 'updateLightningSettings', lnbits: 'not-an-object' }),
      ).toBeNull();
      expect(
        parseClientMessage({ type: 'updateLightningSettings', lnbits: { apiKey: 42 } }),
      ).toBeNull();
      expect(
        parseClientMessage({
          type: 'updateLightningSettings',
          lnbits: { apiKey: 'key', baseUrl: 42 },
        }),
      ).toBeNull();
    });
  });
});
