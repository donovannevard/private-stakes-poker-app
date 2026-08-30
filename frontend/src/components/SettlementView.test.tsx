import type { ServerSettlementMessage } from '@lightning-poker/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettlementView } from './SettlementView';

function makeSettlement(overrides: Partial<ServerSettlementMessage> = {}): ServerSettlementMessage {
  return {
    type: 'settlement',
    netPositions: { me: 50, bob: -50 },
    transfers: [
      {
        id: 'bob:me',
        from: 'bob',
        to: 'me',
        amount: 50,
        payoutMethod: 'manual',
        paid: false,
      },
    ],
    unit: 'sats',
    ...overrides,
  };
}

const playerDirectory = { bob: { nickname: 'Bob', isBot: false, connected: true } };

describe('SettlementView', () => {
  it('calls onCompute once when it opens', () => {
    const onCompute = vi.fn();
    render(
      <SettlementView
        myPlayerId="me"
        playerDirectory={playerDirectory}
        settlement={null}
        settlementError={null}
        onCompute={onCompute}
        onGenerateInvoice={vi.fn()}
        onMarkPaid={vi.fn()}
        onUpdateLightningSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(onCompute).toHaveBeenCalledTimes(1);
  });

  it('shows the overall net position and the settlement error, if any', () => {
    render(
      <SettlementView
        myPlayerId="me"
        playerDirectory={playerDirectory}
        settlement={makeSettlement()}
        settlementError="something went wrong"
        onCompute={vi.fn()}
        onGenerateInvoice={vi.fn()}
        onMarkPaid={vi.fn()}
        onUpdateLightningSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("You're owed 50 sats overall.")).toBeInTheDocument();
    expect(screen.getByText('something went wrong')).toBeInTheDocument();
  });

  it('shows a manual "Mark as paid" affordance when the payee has no Lightning method', () => {
    const onMarkPaid = vi.fn();
    render(
      <SettlementView
        myPlayerId="me"
        playerDirectory={playerDirectory}
        settlement={makeSettlement()}
        settlementError={null}
        onCompute={vi.fn()}
        onGenerateInvoice={vi.fn()}
        onMarkPaid={onMarkPaid}
        onUpdateLightningSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Bob owes you')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(onMarkPaid).toHaveBeenCalledWith('bob:me');
  });

  it('shows a "Get invoice" button when a Lightning method is registered but no invoice exists yet', () => {
    const onGenerateInvoice = vi.fn();
    render(
      <SettlementView
        myPlayerId="me"
        playerDirectory={playerDirectory}
        settlement={makeSettlement({
          transfers: [
            {
              id: 'bob:me',
              from: 'bob',
              to: 'me',
              amount: 50,
              payoutMethod: 'lnurl',
              paid: false,
            },
          ],
        })}
        settlementError={null}
        onCompute={vi.fn()}
        onGenerateInvoice={onGenerateInvoice}
        onMarkPaid={vi.fn()}
        onUpdateLightningSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Get invoice' }));
    expect(onGenerateInvoice).toHaveBeenCalledWith('bob:me');
  });

  it('shows a "Paid" badge once a transfer is paid', () => {
    render(
      <SettlementView
        myPlayerId="me"
        playerDirectory={playerDirectory}
        settlement={makeSettlement({
          transfers: [
            {
              id: 'bob:me',
              from: 'bob',
              to: 'me',
              amount: 50,
              payoutMethod: 'manual',
              paid: true,
            },
          ],
        })}
        settlementError={null}
        onCompute={vi.fn()}
        onGenerateInvoice={vi.fn()}
        onMarkPaid={vi.fn()}
        onUpdateLightningSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Paid ✓')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).not.toBeInTheDocument();
  });

  it('says there is nothing to settle when no transfers involve the viewer', () => {
    render(
      <SettlementView
        myPlayerId="me"
        playerDirectory={playerDirectory}
        settlement={makeSettlement({ transfers: [] })}
        settlementError={null}
        onCompute={vi.fn()}
        onGenerateInvoice={vi.fn()}
        onMarkPaid={vi.fn()}
        onUpdateLightningSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Nothing to settle.')).toBeInTheDocument();
  });

  it('submits linked Lightning settings, trimmed, with empty fields cleared to null', () => {
    const onUpdateLightningSettings = vi.fn();
    render(
      <SettlementView
        myPlayerId="me"
        playerDirectory={playerDirectory}
        settlement={null}
        settlementError={null}
        onCompute={vi.fn()}
        onGenerateInvoice={vi.fn()}
        onMarkPaid={vi.fn()}
        onUpdateLightningSettings={onUpdateLightningSettings}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('you@walletprovider.com'), {
      target: { value: '  me@example.com  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onUpdateLightningSettings).toHaveBeenCalledWith('me@example.com', null);
  });

  it('renders a QR code and deep link once an invoice exists, without throwing', async () => {
    render(
      <SettlementView
        myPlayerId="me"
        playerDirectory={playerDirectory}
        settlement={makeSettlement({
          transfers: [
            {
              id: 'bob:me',
              from: 'bob',
              to: 'me',
              amount: 50,
              payoutMethod: 'lnurl',
              invoice: { bolt11: 'lnbc50u1invoice' },
              paid: false,
            },
          ],
        })}
        settlementError={null}
        onCompute={vi.fn()}
        onGenerateInvoice={vi.fn()}
        onMarkPaid={vi.fn()}
        onUpdateLightningSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole('link', { name: 'Open in Lightning wallet' })).toHaveAttribute(
      'href',
      'lightning:lnbc50u1invoice',
    );
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <SettlementView
        myPlayerId="me"
        playerDirectory={playerDirectory}
        settlement={null}
        settlementError={null}
        onCompute={vi.fn()}
        onGenerateInvoice={vi.fn()}
        onMarkPaid={vi.fn()}
        onUpdateLightningSettings={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(onClose).toHaveBeenCalled();
  });
});
