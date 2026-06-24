# Codex Multi Thread

A small Codex skill that replicates Codex App thread spawning for Codex CLI and Codex Mobile workflows.

It uses the experimental `codex app-server` protocol to spawn visible Codex Desktop/App threads from a terminal script, and can optionally send the first prompt to the new thread.

## Install

Ask Codex:

```text
Install this skill: https://github.com/ImSakushi/codex-multi-thread
```

Or install manually:

```bash
git clone https://github.com/ImSakushi/codex-multi-thread.git ~/.codex/skills/codex-multi-thread
```

## Use

Create a thread and send an initial prompt:

```bash
node ~/.codex/skills/codex-multi-thread/scripts/create-thread.mjs \
  --cwd /absolute/project/path \
  "hello world!"
```

Create only the thread, without sending a model turn:

```bash
node ~/.codex/skills/codex-multi-thread/scripts/create-thread.mjs \
  --cwd /absolute/project/path \
  --no-turn
```

You can also ask Codex to use `$codex-multi-thread`.
