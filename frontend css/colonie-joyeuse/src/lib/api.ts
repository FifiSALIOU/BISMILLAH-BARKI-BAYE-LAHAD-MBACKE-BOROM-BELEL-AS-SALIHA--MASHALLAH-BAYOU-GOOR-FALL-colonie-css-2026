export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export interface ApiRequestOptions {
  method?: string;
  token?: string | null;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  signal?: AbortSignal;
}

export interface ApiErrorPayload {
  detail?: string | Array<{ msg?: string }>;
  message?: string;
}

export function parseApiError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Erreur API';
  const p = payload as ApiErrorPayload;
  if (Array.isArray(p.detail)) {
    return p.detail.map((d) => d?.msg).filter(Boolean).join(' | ') || 'Erreur API';
  }
  if (typeof p.detail === 'string') return p.detail;
  if (typeof p.message === 'string') return p.message;
  return 'Erreur API';
}

export async function apiRequest<T = any>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...((options.body && !isFormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ?? null,
    signal: options.signal,
  });

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      // ignore
    }
    throw new Error(parseApiError(payload));
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
