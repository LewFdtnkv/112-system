#!/bin/sh
set -eu

maps_api_key="${SYSTEM112_MAPS_API_KEY:-${VITE_YANDEX_MAPS_API_KEY:-}}"

if [ -n "$maps_api_key" ]; then
  case "$maps_api_key" in
    *[!a-zA-Z0-9_-]*)
      echo 'Invalid JavaScript Maps API key format' >&2
      exit 1
      ;;
  esac
  printf 'window.SYSTEM112_MAP_CONFIG = { apiKey: "%s" };\n' \
    "$maps_api_key" \
    > /usr/share/nginx/html/map-config.js
fi
