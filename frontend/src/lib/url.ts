const TABLE_QUERY_PARAM = 'table';

export function getTableIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(TABLE_QUERY_PARAM);
}

export function setTableIdInUrl(tableId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(TABLE_QUERY_PARAM, tableId);
  window.history.pushState({}, '', url);
}

export function buildInviteLink(tableId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(TABLE_QUERY_PARAM, tableId);
  return url.toString();
}

export function clearTableIdFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(TABLE_QUERY_PARAM);
  window.history.pushState({}, '', url);
}
