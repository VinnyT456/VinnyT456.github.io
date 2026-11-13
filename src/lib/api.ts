/**
 * The site is static (GitHub Pages); anything needing secrets or memory lives
 * in the separate API in /server (Render). NEXT_PUBLIC_API_URL is inlined at
 * build time; in `next dev` it defaults to the local API on :8787.
 *
 * Every caller must cope with the API being absent or asleep: the free Render
 * tier spins down when idle and takes ~30–60s to wake, so features fall back
 * to what the static site already shows.
 */
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8787" : "")
).replace(/\/$/, "");

export const hasApi = API_URL !== "";

export class ApiError extends Error {
  constructor(
    public status: number,
    /** the server's own words when it rejected the request (4xx), else null */
    public reason: string | null
  ) {
    super(reason ?? `api ${status}`);
  }
}

/** fetch → JSON with a timeout. Throws ApiError (status 0 = network/timeout). */
export async function api<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  if (!hasApi) throw new ApiError(0, null);
  const { timeoutMs = 10_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(0, null);
  }
  if (!res.ok) {
    let reason: string | null = null;
    // 4xx = the server told us what's wrong; 5xx = it just failed
    if (res.status < 500) {
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body.error === "string") reason = body.error;
      } catch {
        /* no JSON body — callers fall back to their generic copy */
      }
    }
    throw new ApiError(res.status, reason);
  }
  return (await res.json()) as T;
}

export const postJSON = (body: unknown, timeoutMs?: number): RequestInit & { timeoutMs?: number } => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  timeoutMs,
});

let warmed = false;
/** Nudge a sleeping instance awake before the visitor needs it. Once per load. */
export function warmApi() {
  if (warmed || !hasApi) return;
  warmed = true;
  fetch(`${API_URL}/health`).catch(() => {});
}

/** A cold start can take a minute; sends wait that long before giving up. */
export const COLD_START_MS = 75_000;
