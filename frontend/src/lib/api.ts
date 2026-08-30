// Derived from whatever host served this page, so it works both from
// localhost and from another device on the LAN hitting this machine's IP.
// The port is overridable (VITE_BACKEND_PORT) for machines where 3000 is
// already taken by another project.
const API_BASE_URL = `http://${window.location.hostname}:${import.meta.env.VITE_BACKEND_PORT ?? 3000}`;

export interface TableSession {
  readonly tableId: string;
  readonly playerId: string;
}

export interface CreateTableOptions {
  readonly nickname: string;
  readonly maxSeats?: number;
  readonly botCount?: number;
  readonly smallBlind?: number;
  readonly bigBlind?: number;
  readonly startingStack?: number;
  readonly turnTimeoutSeconds?: number | null;
  readonly lightningAddress?: string;
}

export async function createTable(options: CreateTableOptions): Promise<TableSession> {
  return postJson<TableSession>('/api/tables', options);
}

export async function joinTable(
  tableId: string,
  nickname: string,
  lightningAddress?: string,
): Promise<TableSession> {
  return postJson<TableSession>(`/api/tables/${tableId}/join`, { nickname, lightningAddress });
}

/** Whether this browser needs to pass the site-wide access gate before anything else. */
export async function checkAccess(): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/api/access`, { credentials: 'include' });
  if (!response.ok) {
    return false;
  }
  const data = (await response.json()) as { granted: boolean };
  return data.granted;
}

export async function submitAccessCode(code: string): Promise<void> {
  await postJson('/api/access', { code });
}

export interface RestoredSession extends TableSession {
  readonly nickname: string;
}

/** Resumes a session from the cookie, if one still points at a live seat. */
export async function getSession(): Promise<RestoredSession | null> {
  const response = await fetch(`${API_BASE_URL}/api/session`, { credentials: 'include' });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as RestoredSession;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? 'Request failed. Please try again.');
  }

  return (await response.json()) as T;
}
