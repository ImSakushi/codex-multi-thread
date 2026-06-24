# codex-multi-thread

`codex-multi-thread` packages the **Codex Multi Thread** skill and helper script that replicate Codex App thread spawning from Codex CLI.

The core idea: Codex App exposes thread creation through its local experimental `codex app-server` protocol. This repo wraps that protocol so a CLI workflow can create visible Codex Desktop/App threads and optionally send the first prompt.

## What Is Included

- `skills/codex-multi-thread/SKILL.md`: Codex skill instructions.
- `skills/codex-multi-thread/scripts/create-thread.mjs`: Node.js CLI wrapper around `codex app-server`.
- `create-thread`: small root-level launcher for the bundled script.

## Usage

Create a Codex thread and send an initial prompt:

```bash
./create-thread --cwd /absolute/project/path "hello world!"
```

Create a thread without sending a model turn:

```bash
./create-thread --cwd /absolute/project/path --no-turn
```

Install the skill locally:

```bash
mkdir -p ~/.codex/skills
cp -R skills/codex-multi-thread ~/.codex/skills/
```

Then ask Codex to use `$codex-multi-thread`.

## Notes

This relies on the experimental Codex app-server API:

- `initialize`
- `thread/start`
- `turn/start`

Because the protocol is experimental, request shapes can change between Codex versions. Regenerate local protocol types with:

```bash
codex app-server generate-ts --experimental --out /tmp/codex-app-ts
```

## Requirements

- Codex CLI available as `codex`
- Node.js with global `WebSocket` support
- A logged-in Codex environment
