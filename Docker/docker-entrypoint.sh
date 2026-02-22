#!/bin/bash

## In docker-compose service set
#   stop_signal: SIGTERM
#   stop_grace_period: 30s
set -e # Exit immediately if a command exits with a non-zero status.
## INIT
# Set list of pid for each sub-process
pids=""
# Create fonction for kill each sub process
term_handler() {
  echo "Received stop signal, shutting down..."
  for pid in $pids; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait
  exit 0
}
# Handle exit signal from Docker
trap term_handler TERM INT


FLUENT_CONFIG_FILE=/fluentd/etc/fluent.conf
# Check if fluent.conf is present
if [[ ! -f "$FLUENT_CONFIG_FILE" ]]; then
    echo "fluent.conf does not exist."
    echo "Please provide this file via a mounted volume like:"
    echo "-v /path/to/fluent.conf:/fluentd/etc/fluent.conf:ro"
    exit 1
fi


##################################
## PRODUCTION MODE
##################################
# Execute Fluentd
# Créer les répertoires nécessaires
mkdir -p /logs /logs-parsed /var/log/fluentd
echo "Starting Fluentd..."
fluentd -c $FLUENT_CONFIG_FILE -o /tmp/fluentd.log &
pids="$pids $!"
# Attendre que Fluentd lise TOUS les fichiers
# Avec flush_mode=immediate, les fichiers JSON seront créés rapidement
echo "Waiting for Fluentd to read all log files..."
while ! grep -q "fluentd worker is now running" /tmp/fluentd.log 2>/dev/null; do
  echo "Fluentd not ready! Sleep 2s"
  sleep 2
done
echo "Fluentd is ready!"
# Continuer d'afficher les logs de Fluentd
tail -f /tmp/fluentd.log &
pids="$pids $!"


# Execute Docker-Socket-Proxy
echo "Starting HAProxy..."
/usr/sbin/haproxy -f /usr/local/etc/haproxy/haproxy.cfg -W -db &
# Add pid of this sub-process in list
pids="$pids $!"


# Execute server for fake docker.sock
echo "Starting Node.js server..."
node /app/server.js &
# Add pid of this sub-process in list
pids="$pids $!"
##################################
##################################



echo "All services started"


wait
exit 0

