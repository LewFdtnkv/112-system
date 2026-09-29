# HTTPS через Nginx

Пример для Nginx, установленного на том же сервере, где запущен Docker Compose. Приложение открывается по адресу `https://trainer.example.ru`, без префикса пути.

В DNS направьте домен на сервер и получите доверенный TLS-сертификат, например через Let's Encrypt. В закрытой сети подойдёт сертификат внутреннего центра сертификации, которому доверяют компьютеры учеников. Ниже указаны стандартные пути Let's Encrypt; замените домен и пути своими.

В `.env` оставьте `FRONTEND_BIND_ADDRESS=127.0.0.1` и `FRONTEND_PORT=8080`. Внешний Nginx принимает HTTPS на порту 443 и передаёт запросы встроенному Nginx фронтенда:

| Путь | Назначение |
| --- | --- |
| `/` | Интерфейс, статические файлы и страницы приложения |
| `/api/` | API; встроенный Nginx уже направляет эти запросы в backend |
| `/sip-ws` | WebSocket браузерного телефона; встроенный Nginx направляет его в Asterisk |

## Конфигурация

Сохраните как `/etc/nginx/conf.d/trainer.conf`. Каталог должен подключаться внутри блока `http` основного `nginx.conf`. Сертификаты должны существовать до проверки конфигурации.

```nginx
server {
    listen 80;
    server_name trainer.example.ru;
    return 301 https://trainer.example.ru$request_uri;
}

server {
    listen 443 ssl;
    server_name trainer.example.ru;

    ssl_certificate /etc/letsencrypt/live/trainer.example.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/trainer.example.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # JSON-запросы могут быть больше файлов. Загрузки файлов API ограничивает 1 МБ.
    client_max_body_size 10m;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        # Без завершающего /: исходный путь, в том числе /api/v1/..., сохраняется.
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_read_timeout 120s;
    }

    location = /sip-ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
```

Маршруты `/api/` обслуживаются общим `location /`. Сохраняйте путь `/sip-ws`: в `/ws` его преобразует встроенный прокси. Порты API, БД, Ollama и ARI остаются внутренними. Если внешний Nginx тоже работает в Docker, вместо `127.0.0.1:8080` используйте `frontend:80` и подключите его к сети Compose.

Проверьте конфигурацию и примените её:

```sh
sudo nginx -t
sudo systemctl reload nginx
curl -I https://trainer.example.ru/
curl -s -o /dev/null -w '%{http_code}\n' https://trainer.example.ru/api/v1/users/me
```

Ожидаются `200` для интерфейса и `401` для API без авторизации. В браузере проверьте вход и обновление страницы занятия. При включённой телефонии запрос к `/sip-ws` после подключения телефона должен получить `101 Switching Protocols`.

## Звонки из браузера

Установите `TELEPHONY_WS_URL=/sip-ws`, включите профиль `telephony` и задайте `SIP_PUBLIC_ADDRESS` — IPv4 сервера, доступный ученикам. Через HTTPS браузер автоматически использует `wss://trainer.example.ru/sip-ws`.

Nginx передаёт сигнализацию звонка. Для звука нужен прямой доступ к RTP UDP `10000–10100`, поэтому настройте публикацию через `SIP_BIND_ADDRESS`, firewall и NAT по [инструкции телефонии](TELEPHONY.md). Для отдельного SIP-телефона также нужен UDP `5060`. Удалённой гарнитуре требуется HTTPS с доверенным сертификатом и разрешение на микрофон.

Справочник Nginx: [WebSocket Upgrade и таймауты](https://nginx.org/en/docs/http/websocket.html), [proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass).
