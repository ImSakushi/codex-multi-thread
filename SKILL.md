---
name: codex-multi-thread
description: Replicate Codex App thread spawning behavior for Codex CLI and Codex Mobile workflows by using the experimental `codex app-server` protocol. Use when the user asks to automate spawning new Codex Desktop/App threads, reproduce Codex App `create_thread` behavior outside the app, send an initial prompt to a spawned thread, or build a CLI/mobile-friendly wrapper around Codex thread creation.
---

# Codex Multi Thread

## Quick Start

Use the bundled script for deterministic thread creation:

```bash
node ~/.codex/skills/codex-multi-thread/scripts/create-thread.mjs \
  --cwd /absolute/project/path \
  "hello world!"
```

The script prints JSON containing at least `threadId`. When a prompt is provided, it also starts a first turn and waits for completion by default.

For a no-cost smoke test that only creates an empty thread:

```bash
node ~/.codex/skills/codex-multi-thread/scripts/create-thread.mjs \
  --cwd /absolute/project/path \
  --no-turn
```

## Workflow

1. Prefer the script over retyping protocol code.
2. Use an absolute `--cwd` so the new thread loads the intended project instructions.
3. Use `--no-turn` when validating the wrapper without sending a model request.
4. Use `--no-wait` only when connecting to an already-running app-server with `--url`; a temporary app-server process cannot keep working after the script exits.
5. Treat this as experimental. Regenerate protocol bindings with `codex app-server generate-ts --experimental --out /tmp/codex-app-ts` if a future Codex version changes request shapes.

## Protocol Notes

The minimum request sequence is:

```json
{"id":1,"method":"initialize","params":{"clientInfo":{"name":"codex-thread-cli","title":null,"version":"0.1.0"},"capabilities":{"experimentalApi":true,"requestAttestation":false}}}
{"id":2,"method":"thread/start","params":{"cwd":"/absolute/project/path"}}
{"id":3,"method":"turn/start","params":{"threadId":"...","input":[{"type":"text","text":"hello world!","text_elements":[]}]}}
```

`thread/start` creates the visible Codex thread. `turn/start` sends the initial user prompt.

## Script Options

- `--cwd <path>`: project working directory. Defaults to `process.cwd()`.
- `--url <ws-url>`: connect to an existing app-server instead of starting a temporary one.
- `--model <id>`: optional model override for `thread/start`.
- `--no-turn`: create the thread but do not send a prompt.
- `--no-wait`: return after `turn/start` is accepted instead of waiting for completion.
- `--timeout-ms <n>`: request timeout. Defaults to 120000.
