#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";

function usage() {
  console.error(`Usage:
  create-thread.mjs [options] [prompt]

Options:
  --cwd <path>        Working directory for the new thread (default: cwd)
  --url <ws-url>      Existing app-server WebSocket URL
  --model <id>        Optional model override
  --no-turn           Create only the thread, without sending a prompt
  --no-wait           Return after turn/start is accepted
  --timeout-ms <n>    Timeout for protocol requests (default: 120000)
  -h, --help          Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    cwd: process.cwd(),
    url: null,
    model: null,
    noTurn: false,
    noWait: false,
    timeoutMs: 120000,
    prompt: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--cwd") opts.cwd = argv[++i];
    else if (arg === "--url") opts.url = argv[++i];
    else if (arg === "--model") opts.model = argv[++i];
    else if (arg === "--no-turn") opts.noTurn = true;
    else if (arg === "--no-wait") opts.noWait = true;
    else if (arg === "--timeout-ms") opts.timeoutMs = Number(argv[++i]);
    else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      opts.prompt.push(arg);
    }
  }

  opts.cwd = path.resolve(opts.cwd);
  opts.prompt = opts.prompt.join(" ").trim();
  if (!opts.noTurn && !opts.prompt) {
    throw new Error("Provide a prompt or pass --no-turn.");
  }
  if (opts.noWait && !opts.url) {
    throw new Error("--no-wait requires --url so a persistent app-server can keep the turn running.");
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }
  return opts;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address?.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function waitForReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else if (Date.now() > deadline) {
          reject(new Error(`app-server did not become ready: HTTP ${res.statusCode}`));
        } else {
          setTimeout(tick, 100);
        }
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("app-server did not become ready before timeout."));
        else setTimeout(tick, 100);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    tick();
  });
}

async function startServer(timeoutMs) {
  const port = await getFreePort();
  const url = `ws://127.0.0.1:${port}`;
  const child = spawn("codex", ["app-server", "--listen", url], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGINT" && signal !== "SIGTERM") {
      console.error(logs.trim());
    }
  });

  await waitForReady(`http://127.0.0.1:${port}/readyz`, timeoutMs);
  return { url, child };
}

function connect(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out connecting to ${url}`)), timeoutMs);
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`Failed to connect to ${url}`));
    });
  });
}

function createRpc(ws, timeoutMs) {
  let nextId = 1;
  const pending = new Map();
  const notifications = [];
  const notificationWaiters = [];

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (Object.hasOwn(msg, "id") && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
      return;
    }

    notifications.push(msg);
    for (let i = notificationWaiters.length - 1; i >= 0; i -= 1) {
      const waiter = notificationWaiters[i];
      if (waiter.predicate(msg)) {
        notificationWaiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      }
    }
  });

  function request(method, params) {
    const id = nextId;
    nextId += 1;
    const payload = { id, method, params };
    ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
    });
  }

  function waitForNotification(predicate) {
    const existing = notifications.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for notification.")), timeoutMs);
      notificationWaiters.push({ predicate, resolve, timer });
    });
  }

  return { request, waitForNotification };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let server = null;
  let ws = null;

  try {
    server = opts.url ? { url: opts.url, child: null } : await startServer(opts.timeoutMs);
    ws = await connect(server.url, opts.timeoutMs);
    const rpc = createRpc(ws, opts.timeoutMs);

    await rpc.request("initialize", {
      clientInfo: { name: "codex-thread-cli", title: null, version: "0.1.0" },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });

    const startParams = { cwd: opts.cwd };
    if (opts.model) startParams.model = opts.model;
    const started = await rpc.request("thread/start", startParams);
    const threadId = started.thread.id;
    const output = { threadId, cwd: started.cwd, path: started.thread.path };

    if (!opts.noTurn) {
      const turnStarted = await rpc.request("turn/start", {
        threadId,
        input: [{ type: "text", text: opts.prompt, text_elements: [] }],
      });
      output.turnId = turnStarted.turn.id;

      if (!opts.noWait) {
        const done = await rpc.waitForNotification(
          (msg) => msg.method === "turn/completed" && msg.params.threadId === threadId && msg.params.turn.id === output.turnId,
        );
        output.turnStatus = done.params.turn.status;
      }
    }

    console.log(JSON.stringify(output, null, 2));
  } finally {
    if (ws) ws.close();
    if (server?.child) {
      server.child.kill("SIGINT");
      setTimeout(() => server.child.kill("SIGTERM"), 2000).unref();
    }
  }
}

main().catch((error) => {
  console.error(`create-thread: ${error.message}`);
  process.exit(1);
});
