import { NextResponse } from "next/server";
import { traccarUrl, getToken } from "@/lib/traccar";

/**
 * Live push: relays Traccar's WebSocket (/api/socket) to the browser as Server-Sent Events, so a position reaches the map
 * as soon as Traccar has processed it instead of on the next poll. Only `positions` are forwarded; the browser merges them
 * with the polled /api/live data (see lib/api.ts), which stays the source of truth.
 */
export const dynamic = "force-dynamic";

// Node's WebSocket (undici) accepts request headers as a second argument; the DOM typings don't know that
const NodeWebSocket = WebSocket as unknown as new (url: string, init: { headers: Record<string, string> }) => WebSocket;
const enc = new TextEncoder();

export async function GET(req: Request) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // the socket authenticates with a session cookie, which Traccar issues for an existing token
  let cookie = "";
  try {
    const s = await fetch(`${traccarUrl()}/api/session?token=${encodeURIComponent(token)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!s.ok) return NextResponse.json({ error: "unauthorized" }, { status: s.status === 401 ? 401 : 502 });
    cookie = (s.headers.get("set-cookie") || "").split(";")[0];
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }

  let ws: WebSocket | null = null, ping: ReturnType<typeof setInterval> | undefined, closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const send = (s: string) => { if (!closed) try { ctrl.enqueue(enc.encode(s)); } catch { stop(); } };
      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        try { ws?.close(); } catch {}
        try { ctrl.close(); } catch {}
      };
      ws = new NodeWebSocket(`${traccarUrl().replace(/^http/, "ws")}/api/socket`, { headers: { Cookie: cookie } });
      ws.onmessage = (m) => {
        try {
          const j = JSON.parse(String(m.data)) as { positions?: unknown[] };
          if (j.positions?.length) send(`event: positions\ndata: ${JSON.stringify(j.positions)}\n\n`);
        } catch {}
      };
      ws.onclose = stop; // the browser's EventSource reconnects by itself
      ws.onerror = stop;
      ping = setInterval(() => send(": ping\n\n"), 20000); // keeps proxies from closing an idle stream
      req.signal.addEventListener("abort", stop);
      send("retry: 3000\n\n");
    },
    cancel() { closed = true; clearInterval(ping); try { ws?.close(); } catch {} },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
