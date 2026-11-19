#!/usr/bin/env bash
# Runs every demo behind nginx on one port (PORTAL_PORT, default 8080).
#
#   portal/run.sh up       build the home page and nginx config, start each demo's fieldtec-web
#                          server that isn't running yet, then start (or reload) nginx
#   portal/run.sh down     stop nginx and the demo servers
#   portal/run.sh restart  down, then up (after pnpm db:setup, or a fieldtec-web rebuild)
#   portal/run.sh status   what is listening
#
# Each app must have been set up once with `pnpm db:setup` (its database and server config).
# Server output goes to <app>/demo/server.log.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
dist="$here/dist"
port="${PORTAL_PORT:-8080}"

listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# nginx's daemon keeps the stdout/stderr it starts with, which would hold a caller's pipe open
run_nginx() {
  if ! nginx -p "$dist" -c "$dist/nginx.conf" -e "$dist/logs/error.log" "$@" >"$dist/logs/nginx.out" 2>&1; then
    cat "$dist/logs/nginx.out" >&2
    return 1
  fi
}

# "<dir> <port> <path>" for every app with a demo/app.mjs
apps() {
  for f in "$root"/*/demo/app.mjs; do
    node --input-type=module -e "const { app } = await import('$f'); if (app.basePath) console.log('$(dirname "$(dirname "$f")")', app.port, app.basePath);"
  done
}

nginx_running() { [[ -f "$dist/nginx.pid" ]] && kill -0 "$(cat "$dist/nginx.pid")" 2>/dev/null; }

up() {
  node "$here/build.mjs"
  while read -r dir app_port path; do
    if listening "$app_port"; then
      echo "  /$path: already running on $app_port"
    else
      echo "  /$path: starting fieldtec-web on $app_port"
      # detached, with no stdio of ours, so a caller's pipe (run.sh up | tail) can close
      (cd "$dir" && exec nohup setsid pnpm demo:server) </dev/null >/dev/null 2>&1 &
    fi
  done < <(apps)

  if nginx_running; then
    run_nginx -s reload
    echo "nginx reloaded on $port"
  else
    run_nginx
    echo "nginx started on $port"
  fi

  echo -n "Waiting for the servers"
  for _ in $(seq 1 90); do
    all=1
    while read -r _dir app_port _path; do listening "$app_port" || all=0; done < <(apps)
    [[ $all == 1 ]] && break
    echo -n "."; sleep 2
  done
  echo
  status
}

down() {
  if nginx_running; then
    run_nginx -s quit && echo "nginx stopped"
  fi
  pkill -f "demo/server.mjs" && echo "demo servers stopped" || true
  # fieldtec-web's server is a child of demo/server.mjs; give it a moment to exit with it
  sleep 2
}

status() {
  local base="http://127.0.0.1:$port"
  if [[ -n "${VSCODE_PROXY_URI:-}" ]]; then base="${VSCODE_PROXY_URI//\{\{port\}\}/$port}"; base="${base%/}"; fi
  if nginx_running && listening "$port"; then echo "Home page:  $base/"; else echo "nginx:      not running"; fi
  while read -r _dir app_port path; do
    if listening "$app_port"; then printf '  %-24s %s\n' "$base/$path/" "(fieldtec-web on $app_port)"
    else printf '  %-24s %s\n' "/$path/" "not running (port $app_port)"; fi
  done < <(apps)
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  restart) down; up ;;
  status) status ;;
  *) echo "Usage: $0 up|down|restart|status" >&2; exit 2 ;;
esac
