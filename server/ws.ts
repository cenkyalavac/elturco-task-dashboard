import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

let wsClients = new Set<WebSocket>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
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
