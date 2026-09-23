export type PageCursor = { timestamp: string; id: string };

export type PageResult<T> = {
  items: T[];
  nextCursor: PageCursor | null;
  total: number;
};

export const ALL_BACKGROUNDS_ID = "all-backgrounds";

export function cursorFrom(row: { id: string; timestamp: Date }): PageCursor {
  return { id: row.id, timestamp: row.timestamp.toISOString() };
}

export function isAfterCursor(
  row: { id: string; timestamp: Date },
  cursor: PageCursor,
  direction: "asc" | "desc" = "desc",
): boolean {
  const cursorTime = new Date(cursor.timestamp).getTime();
  const rowTime = row.timestamp.getTime();
  const comparison = rowTime === cursorTime
    ? row.id.localeCompare(cursor.id)
    : rowTime - cursorTime;
  return direction === "asc" ? comparison > 0 : comparison < 0;
}
