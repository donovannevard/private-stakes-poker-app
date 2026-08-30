import type { ClientLnbitsSettings, ServerSettlementMessage } from '@lightning-poker/shared';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { PlayerDirectoryEntry } from '../store/tableStore';

interface SettlementViewProps {
  readonly myPlayerId: string;
  readonly playerDirectory: Readonly<Record<string, PlayerDirectoryEntry>>;
  readonly settlement: ServerSettlementMessage | null;
  readonly settlementError: string | null;
  readonly onCompute: () => void;
  readonly onGenerateInvoice: (transferId: string) => void;
  readonly onMarkPaid: (transferId: string) => void;
  readonly onUpdateLightningSettings: (
    lightningAddress: string | null | undefined,
    lnbits: ClientLnbitsSettings | null | undefined,
  ) => void;
  readonly onClose: () => void;
  /** Shown above the balances — used when the table has already ended server-side. */
  readonly closedNotice?: string;
}

function useQrCodeDataUrl(value: string | null): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return dataUrl;
}

function TransferRow({
  counterpartName,
  direction,
  amount,
  unit,
  payoutMethod,
  invoice,
  paid,
  onGenerateInvoice,
  onMarkPaid,
}: {
  readonly counterpartName: string;
  readonly direction: 'owe' | 'owed';
  readonly amount: number;
  readonly unit: string;
  readonly payoutMethod: 'lnbits' | 'lnurl' | 'manual';
  readonly invoice?: { bolt11: string };
  readonly paid: boolean;
  readonly onGenerateInvoice: () => void;
  readonly onMarkPaid: () => void;
}) {
  const qrDataUrl = useQrCodeDataUrl(invoice ? `lightning:${invoice.bolt11}` : null);

  return (
    <li className="flex flex-col gap-2 rounded border border-neutral-700 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span>
          {direction === 'owe' ? `You owe ${counterpartName}` : `${counterpartName} owes you`}
        </span>
        <span className="font-semibold text-amber-300">
          {amount} {unit}
        </span>
      </div>

      {paid ? (
        <span className="text-xs text-green-400">Paid ✓</span>
      ) : payoutMethod === 'manual' ? (
        <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
          <span>No Lightning address registered for {counterpartName}.</span>
          <button
            type="button"
            onClick={onMarkPaid}
            className="rounded bg-neutral-700 px-2 py-1 text-neutral-50 hover:bg-neutral-600"
          >
            Mark as paid
          </button>
        </div>
      ) : !invoice ? (
        <button
          type="button"
          onClick={onGenerateInvoice}
          className="self-start rounded bg-amber-600 px-3 py-1 text-xs font-medium text-neutral-950 hover:bg-amber-500"
        >
          Get invoice
        </button>
      ) : (
        <div className="flex flex-col items-center gap-2">
          {qrDataUrl && (
            <img src={qrDataUrl} alt="Invoice QR code" className="rounded bg-white p-1" />
          )}
          <a
            href={`lightning:${invoice.bolt11}`}
            className="break-all text-center text-xs text-amber-300 underline"
          >
            Open in Lightning wallet
          </a>
          {payoutMethod === 'lnbits' ? (
            <span className="text-xs text-neutral-400">Waiting for payment…</span>
          ) : (
            <button
              type="button"
              onClick={onMarkPaid}
              className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-50 hover:bg-neutral-600"
            >
              Mark as paid
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function SettlementView({
  myPlayerId,
  playerDirectory,
  settlement,
  settlementError,
  onCompute,
  onGenerateInvoice,
  onMarkPaid,
  onUpdateLightningSettings,
  onClose,
  closedNotice,
}: SettlementViewProps) {
  const [lightningAddress, setLightningAddress] = useState('');
  const [lnbitsApiKey, setLnbitsApiKey] = useState('');

  useEffect(() => {
    onCompute();
    // Only ever run once, when the view opens — subsequent recomputes happen
    // via explicit user actions (generate invoice, mark paid), not on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = (playerId: string) =>
    playerId === myPlayerId ? 'you' : (playerDirectory[playerId]?.nickname ?? 'Player');

  const myNetPosition = settlement?.netPositions[myPlayerId] ?? 0;
  const myTransfers = settlement?.transfers.filter(
    (t) => t.from === myPlayerId || t.to === myPlayerId,
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-lg bg-neutral-900 p-6 text-neutral-50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settle Up</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-50"
          >
            ✕
          </button>
        </div>

        {closedNotice && (
          <p className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
            {closedNotice}
          </p>
        )}

        {settlementError && <p className="text-sm text-red-400">{settlementError}</p>}

        {settlement && (
          <>
            <p className="text-sm">
              {myNetPosition === 0 && "You're all even."}
              {myNetPosition > 0 && `You're owed ${myNetPosition} ${settlement.unit} overall.`}
              {myNetPosition < 0 && `You owe ${-myNetPosition} ${settlement.unit} overall.`}
            </p>

            {myTransfers && myTransfers.length > 0 ? (
              <ul className="flex flex-col gap-2" data-testid="settlement-transfers">
                {myTransfers.map((transfer) => (
                  <TransferRow
                    key={transfer.id}
                    counterpartName={displayName(
                      transfer.from === myPlayerId ? transfer.to : transfer.from,
                    )}
                    direction={transfer.from === myPlayerId ? 'owe' : 'owed'}
                    amount={transfer.amount}
                    unit={settlement.unit}
                    payoutMethod={transfer.payoutMethod}
                    invoice={transfer.invoice}
                    paid={transfer.paid}
                    onGenerateInvoice={() => onGenerateInvoice(transfer.id)}
                    onMarkPaid={() => onMarkPaid(transfer.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-400">Nothing to settle.</p>
            )}
          </>
        )}

        <form
          className="flex flex-col gap-2 border-t border-neutral-700 pt-4 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdateLightningSettings(
              lightningAddress.trim() || null,
              lnbitsApiKey.trim() ? { apiKey: lnbitsApiKey.trim() } : null,
            );
          }}
        >
          <span className="text-neutral-400">Link Lightning info (optional)</span>
          <input
            type="text"
            value={lightningAddress}
            onChange={(event) => setLightningAddress(event.target.value)}
            placeholder="you@walletprovider.com"
            className="rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm"
          />
          <input
            type="text"
            value={lnbitsApiKey}
            onChange={(event) => setLnbitsApiKey(event.target.value)}
            placeholder="LNbits Invoice/Read key (optional, for auto-confirm)"
            className="rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="self-start rounded bg-neutral-700 px-3 py-1 text-neutral-50 hover:bg-neutral-600"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
