import type { ChatLogEntry } from '../store/tableStore';
import { ChatPanel } from './ChatPanel';

interface SidebarProps {
  readonly chatLog: readonly ChatLogEntry[];
  readonly onSendChat: (text: string) => void;
  readonly isHost: boolean;
  readonly canLeave: boolean;
  readonly practiceMode: boolean;
  readonly onLeave: () => void;
  readonly onCancelTable: () => void;
  readonly onOpenSettlement: () => void;
}

export function Sidebar({
  chatLog,
  onSendChat,
  isHost,
  canLeave,
  practiceMode,
  onLeave,
  onCancelTable,
  onOpenSettlement,
}: SidebarProps) {
  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 border-r border-neutral-800 bg-neutral-950 p-4">
      <ChatPanel chatLog={chatLog} onSend={onSendChat} />

      <div className="flex flex-col items-start gap-2 border-t border-neutral-800 pt-3">
        {!practiceMode && (
          <button
            type="button"
            onClick={onOpenSettlement}
            className="text-sm text-amber-300 underline"
          >
            Settle up
          </button>
        )}
        {isHost ? (
          <button type="button" onClick={onCancelTable} className="text-sm text-red-400 underline">
            Cancel table
          </button>
        ) : (
          <button
            type="button"
            onClick={onLeave}
            disabled={!canLeave}
            title={canLeave ? undefined : 'You can leave once the current hand finishes'}
            className="text-sm text-neutral-400 underline disabled:cursor-not-allowed disabled:text-neutral-700 disabled:no-underline"
          >
            Leave table
          </button>
        )}
      </div>
    </div>
  );
}
