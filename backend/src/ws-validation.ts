import type { ClientMessage } from '@lightning-poker/shared';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidLnbits(value: unknown): value is { apiKey: string; baseUrl?: string } | null {
  if (value === null || value === undefined) {
    return true;
  }
  if (!isPlainObject(value) || typeof value.apiKey !== 'string') {
    return false;
  }
  return value.baseUrl === undefined || typeof value.baseUrl === 'string';
}

/**
 * Guards against malformed WS frames reaching handlers that assume
 * well-typed fields (e.g. `text.trim()`, `switch (action.type)`) and would
 * otherwise throw synchronously inside the `message` listener.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isPlainObject(raw) || typeof raw.type !== 'string') {
    return null;
  }

  switch (raw.type) {
    case 'action':
      return isPlainObject(raw.action) && typeof raw.action.type === 'string'
        ? { type: 'action', action: raw.action }
        : null;
    case 'chat':
      return typeof raw.text === 'string' ? { type: 'chat', text: raw.text } : null;
    case 'leave':
      return { type: 'leave' };
    case 'cancelTable':
      return { type: 'cancelTable' };
    case 'addBot':
      return { type: 'addBot' };
    case 'kick':
      return isNonEmptyString(raw.playerId) ? { type: 'kick', playerId: raw.playerId } : null;
    case 'computeSettlement':
      return { type: 'computeSettlement' };
    case 'generateSettlementInvoice':
      return isNonEmptyString(raw.transferId)
        ? { type: 'generateSettlementInvoice', transferId: raw.transferId }
        : null;
    case 'markSettlementPaid':
      return isNonEmptyString(raw.transferId)
        ? { type: 'markSettlementPaid', transferId: raw.transferId }
        : null;
    case 'updateLightningSettings': {
      if (
        (raw.lightningAddress !== undefined &&
          raw.lightningAddress !== null &&
          typeof raw.lightningAddress !== 'string') ||
        !isValidLnbits(raw.lnbits)
      ) {
        return null;
      }
      return {
        type: 'updateLightningSettings',
        lightningAddress: raw.lightningAddress as string | null | undefined,
        lnbits: raw.lnbits as { apiKey: string; baseUrl?: string } | null | undefined,
      };
    }
    default:
      return null;
  }
}
