#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] prisma migrate deploy"
  ./node_modules/.bin/prisma migrate deploy
fi

exec "$@"
