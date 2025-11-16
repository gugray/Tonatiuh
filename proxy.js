import http from "node:http";
import {WebSocketServer, WebSocket} from "ws";

// Backend targets
const HTTP_TARGET_HOST = "100.67.53.78";
const HTTP_TARGET_PORT = 8080;

const WS_TARGET_HOST = "100.67.53.78";
const WS_TARGET_PORT = 8090;

// ---------------------
// HTTP proxy: GET only
// ---------------------
const httpServer = http.createServer((req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, {"Content-Type": "text/plain"});
    res.end("Only GET requests are supported");
    return;
  }

  const options = {
    hostname: HTTP_TARGET_HOST,
    port: HTTP_TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, {end: true});
  });

  req.pipe(proxyReq, {end: true});
});

httpServer.listen(8080, () => {
  console.log(`HTTP proxy running at http://localhost:8080 -> http://${HTTP_TARGET_HOST}:${HTTP_TARGET_PORT}`);
});

// ---------------------
// WebSocket proxy
// ---------------------
const wsServer = new WebSocketServer({port: 8090});

wsServer.on("connection", (client, req) => {
  const targetUrl = `ws://${WS_TARGET_HOST}:${WS_TARGET_PORT}${req.url}`;

  const ws = new WebSocket(targetUrl, {
    headers: req.headers,
  });

  ws.on("open", () => {
    // Pipe messages both ways
    ws.on("message", (msg) => client.send(msg));
    client.on("message", (msg) => ws.send(msg));

    ws.on("close", () => client.close());
    client.on("close", () => ws.close());
  });

  ws.on("error", (err) => {
    console.error("WebSocket proxy error:", err);
    client.close();
  });
});

console.log(`WebSocket proxy running at ws://localhost:8090 -> ws://${WS_TARGET_HOST}:${WS_TARGET_PORT}`);
