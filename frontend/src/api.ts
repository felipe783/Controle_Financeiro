export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  // Senha errada no login também é 401, mas não é sessão expirada.
  if (res.status === 401 && !res.url.endsWith("/api/auth/login")) window.dispatchEvent(new Event("auth:expired"));
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
    } catch {
      if (res.status >= 500) msg = "O servidor não respondeu corretamente. Tente novamente.";
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") || "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

function qs(params?: Record<string, unknown>): string {
  if (!params) return "";
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

// X-Requested-With é exigido pelo backend em toda alteração (proteção contra CSRF).
const HEADERS = { "X-Requested-With": "fetch" };

export async function request<T>(method: string, path: string, body?: unknown, params?: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs(params)}`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { ...HEADERS, "Content-Type": "application/json" } : HEADERS,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Não foi possível conectar ao servidor.");
  }
  return handle<T>(res);
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>) => request<T>("GET", path, undefined, params),
  post: <T>(path: string, body?: unknown, params?: Record<string, unknown>) =>
    request<T>("POST", path, body ?? {}, params),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: (path: string) => request<void>("DELETE", path),
  async upload<T>(path: string, form: FormData): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin", headers: HEADERS, body: form });
    } catch {
      throw new ApiError(0, "Não foi possível conectar ao servidor.");
    }
    return handle<T>(res);
  },
  url: (path: string, params?: Record<string, unknown>) => `/api${path}${qs(params)}`,
};
