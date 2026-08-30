import { useState } from 'react';
import type { ChatLogEntry } from '../store/tableStore';

interface ChatPanelProps {
  readonly chatLog: readonly ChatLogEntry[];
  readonly onSend: (text: string) => void;
}

export function ChatPanel({ chatLog, onSend }: ChatPanelProps) {
  const [text, setText] = useState('');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded border border-neutral-700 bg-neutral-900 p-3">
      <div
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto text-xs"
        data-testid="chat-log"
      >
        {chatLog.map((entry, index) => (
          <div key={index}>
            <span className="font-medium text-neutral-300">{entry.nickname}: </span>
            <span className="text-neutral-400">{entry.text}</span>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = text.trim();
          if (trimmed.length > 0) {
            onSend(trimmed);
            setText('');
          }
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Say something…"
          className="flex-1 rounded border border-neutral-600 bg-neutral-950 px-2 py-1 text-xs text-neutral-50"
        />
        <button
          type="submit"
          className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
        >
          Send
        </button>
      </form>
    </div>
  );
}
