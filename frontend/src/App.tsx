import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AccessGateScreen } from './components/AccessGateScreen';
import { ErrorBanner } from './components/ErrorBanner';
import { HomeScreen } from './components/HomeScreen';
import { JoinExistingTableScreen } from './components/JoinExistingTableScreen';
import { LobbyView } from './components/LobbyView';
import { SettlementView } from './components/SettlementView';
import { TableView } from './components/TableView';
import { useTableConnection } from './hooks/useTableConnection';
import { checkAccess, getSession } from './lib/api';
import { clearTableIdFromUrl, getTableIdFromUrl } from './lib/url';
import { useTableStore } from './store/tableStore';

const queryClient = new QueryClient();

function AppContent() {
  const tableId = useTableStore((state) => state.tableId);
  const playerId = useTableStore((state) => state.playerId);
  const nickname = useTableStore((state) => state.nickname);
  const snapshot = useTableStore((state) => state.snapshot);
  const turnExpiresAt = useTableStore((state) => state.turnExpiresAt);
  const lobby = useTableStore((state) => state.lobby);
  const hostPlayerId = useTableStore((state) => state.hostPlayerId);
  const playerDirectory = useTableStore((state) => state.playerDirectory);
  const chatLog = useTableStore((state) => state.chatLog);
  const error = useTableStore((state) => state.error);
  const wasKicked = useTableStore((state) => state.wasKicked);
  const tableEnded = useTableStore((state) => state.tableEnded);
  const settlement = useTableStore((state) => state.settlement);
  const settlementError = useTableStore((state) => state.settlementError);
  const join = useTableStore((state) => state.join);
  const reset = useTableStore((state) => state.reset);
  const {
    sendAction,
    sendChat,
    kickPlayer,
    leaveTable,
    cancelTable,
    addBot,
    computeSettlement,
    generateSettlementInvoice,
    markSettlementPaid,
    updateLightningSettings,
  } = useTableConnection(tableId);

  const [accessGranted, setAccessGranted] = useState<boolean | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  // A rejected fetch (server down, CORS misconfigured, etc.) must not leave
  // accessGranted/sessionChecked stuck at their initial values forever —
  // without this, a connectivity failure looks identical to "still loading".
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkAccess()
      .then((granted) => {
        if (!cancelled) {
          setAccessGranted(granted);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConnectionError('Could not reach the server. Is it running?');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (accessGranted !== true) {
      return; // still checking, or the gate hasn't been passed yet
    }
    let cancelled = false;
    getSession()
      .then((session) => {
        if (cancelled) {
          return;
        }
        if (session) {
          join(session.tableId, session.playerId, session.nickname);
        }
        setSessionChecked(true);
      })
      .catch(() => {
        if (!cancelled) {
          setConnectionError('Could not reach the server. Is it running?');
        }
      });
    return () => {
      cancelled = true;
    };
    // Only re-runs when the gate is first passed — this resumes whatever
    // session the cookie points to, not on every store change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessGranted]);

  useEffect(() => {
    if (wasKicked) {
      window.alert('You were removed from the table by the host.');
      clearTableIdFromUrl();
      reset();
    }
  }, [wasKicked, reset]);

  useEffect(() => {
    if (tableEnded && !settlement) {
      // Practice tables have nothing to settle — go straight home.
      clearTableIdFromUrl();
      reset();
    }
  }, [tableEnded, settlement, reset]);

  const onLeave = () => {
    leaveTable();
    clearTableIdFromUrl();
    reset();
  };

  const banner = error ? <ErrorBanner message={error} /> : null;
  const settlementModal =
    (settlementOpen || (tableEnded && settlement)) && playerId ? (
      <SettlementView
        myPlayerId={playerId}
        playerDirectory={playerDirectory}
        settlement={settlement}
        settlementError={settlementError}
        onCompute={computeSettlement}
        onGenerateInvoice={generateSettlementInvoice}
        onMarkPaid={markSettlementPaid}
        onUpdateLightningSettings={updateLightningSettings}
        onClose={tableEnded ? onLeave : () => setSettlementOpen(false)}
        closedNotice={
          tableEnded ? 'This table has ended — here are the final balances.' : undefined
        }
      />
    ) : null;

  if (connectionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-50">
        {connectionError}
      </div>
    );
  }

  if (accessGranted === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-50">
        Loading…
      </div>
    );
  }

  if (!accessGranted) {
    return <AccessGateScreen onGranted={() => setAccessGranted(true)} />;
  }

  if (!sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-50">
        Loading…
      </div>
    );
  }

  if (!tableId || !playerId) {
    // Read fresh on every render (not memoized) — the URL changes when a
    // table is created/left, and this must reflect that immediately.
    const urlTableId = getTableIdFromUrl();
    return (
      <>
        {banner}
        {urlTableId ? <JoinExistingTableScreen tableId={urlTableId} /> : <HomeScreen />}
      </>
    );
  }

  if (snapshot) {
    return (
      <>
        {banner}
        {settlementModal}
        <TableView
          snapshot={snapshot}
          turnExpiresAt={turnExpiresAt}
          myPlayerId={playerId}
          myNickname={nickname ?? 'You'}
          hostPlayerId={hostPlayerId}
          practiceMode={lobby?.practiceMode ?? false}
          maxSeats={lobby?.maxSeats ?? snapshot.players.length}
          playerDirectory={playerDirectory}
          chatLog={chatLog}
          onAction={sendAction}
          onSendChat={sendChat}
          onLeave={onLeave}
          onCancelTable={cancelTable}
          onKick={kickPlayer}
          onAddBot={addBot}
          onOpenSettlement={() => setSettlementOpen(true)}
        />
      </>
    );
  }

  if (lobby) {
    return (
      <>
        {banner}
        {settlementModal}
        <LobbyView
          tableId={tableId}
          myPlayerId={playerId}
          hostPlayerId={hostPlayerId ?? playerId}
          players={lobby.players}
          maxSeats={lobby.maxSeats}
          practiceMode={lobby.practiceMode}
          onLeave={onLeave}
          onKick={kickPlayer}
          onAddBot={addBot}
          onOpenSettlement={() => setSettlementOpen(true)}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-50">
      {banner}
      Connecting…
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
