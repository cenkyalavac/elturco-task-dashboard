import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Build the full public API base URL that external users (email recipients) can reach.
// In local dev, API_BASE is "" so we use current origin.
// In production, API_BASE is "port/5000" (relative) — we need the full proxy path.
export function getPublicApiBase(): string {
  if (!API_BASE) {
    // Local dev
    return window.location.origin;
  }
  // Production: API_BASE is relative like "port/5000"
  // The page URL is like: https://sites.pplx.app/sites/proxy/JWT/.../dist/public/index.html
  // We need: https://sites.pplx.app/sites/proxy/JWT/.../port/5000
  const pageUrl = window.location.href.split("#")[0]; // strip hash
  // Find the proxy prefix: everything up to and including the JWT token segment
  // Pattern: .../sites/proxy/JWT/web/direct-files/.../dist/public/index.html
  // We want: .../sites/proxy/JWT/  then append port/5000
  const proxyMatch = pageUrl.match(/^(https?:\/\/[^/]+\/sites\/proxy\/[^/]+\/)/);
  if (proxyMatch) {
    return proxyMatch[1] + API_BASE;
  }
  // Fallback: just use origin + API_BASE
  return window.location.origin + "/" + API_BASE;
}

// Auth token management (in-memory, not localStorage)
let authToken: string | null = null;
let currentUser: { id: number; email: string; name: string; role: string } | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken() {
  return authToken;
}
export function setCurrentUser(user: typeof currentUser) {
  currentUser = user;
}
export function getCurrentUser() {
  return currentUser;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(`${API_BASE}${queryKey[0]}`, { headers });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
