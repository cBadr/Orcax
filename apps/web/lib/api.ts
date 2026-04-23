const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
  issues?: unknown;
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refreshToken');
}

export function setTokens(accessToken: string, refreshToken: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

async function refreshAccess(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  const r = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!r.ok) {
    clearTokens();
    return null;
  }
  const data = (await r.json()) as { accessToken: string; refreshToken: string };
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const h = new Headers(headers);
  if (!h.has('content-type') && options.body && !(options.body instanceof FormData)) {
    h.set('content-type', 'application/json');
  }
  if (auth) {
    const token = getAccessToken();
    if (token) h.set('authorization', `Bearer ${token}`);
  }

  let res = await fetch(`${API_URL}${path}`, { ...rest, headers: h });

  if (res.status === 401 && auth) {
    const newToken = await refreshAccess();
    if (newToken) {
      h.set('authorization', `Bearer ${newToken}`);
      res = await fetch(`${API_URL}${path}`, { ...rest, headers: h });
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = data as ApiError;
    const e = new Error(err?.message ?? `Request failed: ${res.status}`) as Error & {
      code?: string;
      details?: unknown;
    };
    e.code = err?.error;
    e.details = err?.issues ?? err?.details;
    throw e;
  }
  return data as T;
}
