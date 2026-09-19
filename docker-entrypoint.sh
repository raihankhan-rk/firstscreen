#!/bin/sh
set -eu

mkdir -p /data
chown -R nextjs:nodejs /data

if ! su-exec nextjs:nodejs test -w /data; then
  echo "firstscreen_startup error=/data_not_writable user=nextjs" >&2
  exit 1
fi

echo "firstscreen_startup data=/data persistence=volume user=nextjs"
exec su-exec nextjs:nodejs "$@"
