import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { verifyToken } from "./jwt";
import { URL } from "url";

interface AuthenticatedWebSocket extends WebSocket {
  pmUserId?: number;
  isAuthenticated: boolean;
}

let wsClients = new Set<AuthenticatedWebSocket>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    // Try to extract JWT token from query string or Authorization header
    let token: string | null = null;

    // 1. Check query string: ws://host/ws?token=xxx
    try {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      token = url.searchParams.get("token");
    } catch {}

    // 2. Fallback: check Authorization header (Bearer xxx)
    if (!token && req.headers.authorization) {
      const match = req.headers.authorization.match(/^Bearer\s+(.+)$/i);
      if (match) {
        token = match[1];
      }
    }

    // 3. Verify the token if present
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        ws.pmUserId = payload.pmUserId;
        ws.isAuthenticated = true;
      } else {
        // Invalid token: reject with 4001
        ws.close(4001, "Invalid or expired token");
        return;
      }
    } else {
      // No token provided: allow as anonymous (graceful migration)
      ws.isAuthenticated = false;
    }

    wsClients.add(ws);
    ws.on("close", () => wsClients.delete(ws));
    ws.on("error", () => wsClients.delete(ws));
  });

  return wss;
}

export function wsBroadcast(event: string, data: any) {
  const msg = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  });
}
