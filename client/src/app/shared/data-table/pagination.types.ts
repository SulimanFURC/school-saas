export interface TableQueryState {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  q?: string;
  filters?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function normalizePaginatedResponse<T>(
  payload: unknown,
  fallback: Pick<TableQueryState, 'page' | 'limit'>
): PaginatedResponse<T> {
  const obj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const data = Array.isArray(obj['data']) ? (obj['data'] as T[]) : [];
  const total = typeof obj['total'] === 'number' ? obj['total'] : data.length;
  const page = typeof obj['page'] === 'number' ? obj['page'] : fallback.page;
  const limit = typeof obj['limit'] === 'number' ? obj['limit'] : fallback.limit;
  const safeLimit = Math.max(1, limit);
  const totalPages =
    typeof obj['totalPages'] === 'number' ? Math.max(1, obj['totalPages']) : Math.max(1, Math.ceil(total / safeLimit));
  return { data, total, page, limit: safeLimit, totalPages };
}
