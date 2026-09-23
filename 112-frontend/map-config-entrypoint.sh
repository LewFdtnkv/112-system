#!/bin/sh
set -eu

if [ -n "${VITE_YANDEX_MAPS_API_KEY:-}" ]; then
  case "$VITE_YANDEX_MAPS_API_KEY" in
    *[!a-zA-Z0-9_-]*)
      echo 'Invalid JavaScript Maps API key format' >&2
      exit 1
      ;;
  esac
  printf 'window.SYSTEM112_MAP_CONFIG = { apiKey: "%s" };\n' \
    "$VITE_YANDEX_MAPS_API_KEY" \
    > /usr/share/nginx/html/map-config.js
fi
