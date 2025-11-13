import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import * as http from "http";
import {WebSocketServer} from "ws";

const kSocketPath = "/relay";
const listenerSockets = [];
let lastContent = null;
let lastTimestamp = null;

// This is the entry point: starts server
export async function runRelay(port) {
  // Create app, server, web socket servers
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());
  const server = http.createServer(app);
  const socketServer = new WebSocketServer({noServer: true});

  app.get("/", getRoot);
  app.post("/", postRoot);

  // Upgrade connections to web socker
  server.on("upgrade", (request, socket, head) => {
    if (request.url === kSocketPath) {
      socketServer.handleUpgrade(request, socket, head, (ws) => {
        socketServer.emit("connection", ws, request);
      });
    } //
    else {
      socket.destroy(); // Close the connection for other paths
    }
  });

  socketServer.on("connection", (ws) => {
    console.log("Relay> Client connected");
    listenerSockets.push(ws);
    ws.on("close", () => {
      console.log("Relay> Client disconnected");
      const ix = listenerSockets.indexOf(ws);
      if (ix != -1) listenerSockets.splice(ix, 1);
    });
  });

  // Run
  try {
    await listen(server, port);
    console.log(`Relay server is listening on port ${port}`);
  } catch (err) {
    console.error(`Relay server failed to start; error:\n${err}`);
  }
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.listen(port).once("listening", resolve).once("error", reject);
  });
}

const sep = "==========================================================================\n";

function getRoot(req, response) {
  let respText = "";
  if (lastContent !== null) {
    respText += sep;
    respText += lastTimestamp + "\n";
    respText += sep;
    respText += lastContent + "\n";
    respText += sep;
  }
  respText += "Relay ready\n";
  response.set("Content-Type", "text/plain; charset=utf-8");
  response.status(200).send(respText);
}

function truncate(str) {
  const newline = str.indexOf("\n");
  const end = newline >= 0 && newline < 32 ? newline : 32;
  let res = str.slice(0, end);
  if (res.length < str.length) res += " [...]";
  return res;
}

function postRoot(req, response) {
  const digest = truncate(req.body.command);
  console.log(`Relay> Command posted: ${digest}`);
  lastTimestamp = new Date().toISOString();
  lastContent = req.body.command;
  for (const sck of listenerSockets) sck.send(lastContent);
  response.status(200).send("OK");
}
