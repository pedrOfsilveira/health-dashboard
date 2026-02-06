#!/bin/bash
# health-watchdog.sh
# Watchdog para manter o servidor e o túnel rodando.

PORT=8080
SUBDOMAIN="saude-pedro"
PROJECT_DIR="/home/pedro/clawd/projects/health-dashboard"

cd "$PROJECT_DIR" || exit

while true; do
    # Verifica Python HTTP Server
    if ! pgrep -f "python3 -m http.server $PORT" > /dev/null; then
        echo "$(date): Reiniciando python server..."
        nohup python3 -m http.server $PORT > server.log 2>&1 &
    fi

    # Verifica LocalTunnel
    if ! pgrep -f "lt --port $PORT --subdomain $SUBDOMAIN" > /dev/null; then
        echo "$(date): Reiniciando localtunnel..."
        nohup lt --port $PORT --subdomain $SUBDOMAIN > lt.log 2>&1 &
    fi

    sleep 60
done
