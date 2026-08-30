import type { TexasHoldemAction, TexasHoldemSnapshot } from '@lightning-poker/game-engine';
import type { ChatLogEntry, PlayerDirectoryEntry } from '../store/tableStore';
import { ActionControls } from './ActionControls';
import { Header } from './Header';
import { PokerTable } from './PokerTable';
import { Sidebar } from './Sidebar';

interface TableViewProps {
  readonly snapshot: TexasHoldemSnapshot;
  readonly turnExpiresAt: number | null;
  readonly myPlayerId: string;
  readonly myNickname: string;
  readonly hostPlayerId: string | null;
  readonly practiceMode: boolean;
  readonly maxSeats: number;
  readonly playerDirectory: Readonly<Record<string, PlayerDirectoryEntry>>;
  readonly chatLog: readonly ChatLogEntry[];
  readonly onAction: (action: TexasHoldemAction) => void;
  readonly onSendChat: (text: string) => void;
  readonly onLeave: () => void;
  readonly onCancelTable: () => void;
  readonly onKick: (playerId: string) => void;
  readonly onAddBot: () => void;
  readonly onOpenSettlement: () => void;
}

export function TableView({
  snapshot,
  turnExpiresAt,
  myPlayerId,
  myNickname,
  hostPlayerId,
  practiceMode,
  maxSeats,
  playerDirectory,
  chatLog,
  onAction,
  onSendChat,
  onLeave,
  onCancelTable,
  onKick,
  onAddBot,
  onOpenSettlement,
}: TableViewProps) {
  const unitLabel = practiceMode ? 'chips' : 'sats';
  const displayName = (playerId: string) => {
    if (playerId === myPlayerId) {
      return `You (${myNickname})`;
    }
    return playerDirectory[playerId]?.nickname ?? 'Player';
  };
  const canLeave = snapshot.street === 'complete';
  const isHost = myPlayerId === hostPlayerId;

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-50">
      <Header practiceMode={practiceMode} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          chatLog={chatLog}
          onSendChat={onSendChat}
          isHost={isHost}
          canLeave={canLeave}
          practiceMode={practiceMode}
          onLeave={onLeave}
          onCancelTable={onCancelTable}
          onOpenSettlement={onOpenSettlement}
        />

        <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6">
          <PokerTable
            snapshot={snapshot}
            myPlayerId={myPlayerId}
            displayName={displayName}
            playerDirectory={playerDirectory}
            isHost={isHost}
            maxSeats={maxSeats}
            onKick={onKick}
            onAddBot={onAddBot}
            unitLabel={unitLabel}
          />

          <ActionControls
            snapshot={snapshot}
            myPlayerId={myPlayerId}
            onAction={onAction}
            turnExpiresAt={turnExpiresAt}
          />
        </div>
      </div>
    </div>
  );
}
