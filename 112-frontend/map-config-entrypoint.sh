#!/bin/sh
set -eu

if [ -n "${VITE_YANDEX_MAPS_API_KEY:-}" ]; then
  printf 'window.SYSTEM112_MAP_CONFIG = { apiKey: "%s" };\n' \
    "$VITE_YANDEX_MAPS_API_KEY" \
    > /usr/share/nginx/html/map-config.js
fi
