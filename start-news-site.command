#!/bin/zsh
cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  exec node server.mjs
fi

exec "/Users/wanghanzhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" server.mjs
