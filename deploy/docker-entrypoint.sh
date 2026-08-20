#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] DATABASE_URL is set - running prisma migrate deploy"
  i=1
  while [ "$i" -le 10 ]; do
    if ./node_modules/.bin/prisma migrate deploy; then
      echo "[entrypoint] migrate ok"
      break
    fi
    echo "[entrypoint] migrate attempt $i failed — retry in 3s"
    i=$((i + 1))
    if [ "$i" -gt 10 ]; then
      echo "[entrypoint] migrate failed after retries"
      exit 1
    fi
    sleep 3
  done
else
  echo "[entrypoint] WARNING: DATABASE_URL is empty — skipping migrate"
fi

exec "$@"
