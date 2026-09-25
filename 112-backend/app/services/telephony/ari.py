from urllib.parse import quote

import httpx

from app.core.config import settings


class ARI:
    def __init__(self):
        if not settings.ari_password:
            raise RuntimeError("ARI_PASSWORD is required")
        self.client = httpx.AsyncClient(
            base_url=settings.ari_url.rstrip("/") + "/",
            timeout=5,
            auth=(settings.ari_username, settings.ari_password.get_secret_value()),
        )

    async def request(self, method, path, *, params=None, json=None, missing_ok=False):
        response = await self.client.request(method, path, params=params, json=json)
        if missing_ok and response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json() if response.content else {}

    async def provision(self, station):
        endpoint = quote(station.endpoint, safe="")
        prefix = "asterisk/config/dynamic/res_pjsip/"
        if not station.enabled:
            for kind in ("endpoint", "auth", "aor"):
                await self.request("DELETE", f"{prefix}{kind}/{endpoint}", missing_ok=True)
            return
        configs = {
            "auth": {
                "auth_type": "userpass",
                "username": station.endpoint,
                "password": station.sip_password,
            },
            "aor": {"max_contacts": "1", "remove_existing": "yes", "qualify_frequency": "0"},
            "endpoint": {
                "auth": station.endpoint,
                "aors": station.endpoint,
                "context": "training-only",
                "disallow": "all",
                "allow": "g722,ulaw,alaw",
                "direct_media": "no",
                "force_rport": "yes",
                "rewrite_contact": "yes",
                "rtp_symmetric": "yes",
                "callerid": station.endpoint,
                "from_domain": settings.telephony_sip_domain,
            },
        }
        if station.mode == "browser":
            configs["endpoint"].update(
                {
                    "webrtc": "yes",
                    "dtls_auto_generate_cert": "yes",
                    "transport": "transport-ws",
                }
            )
        else:
            configs["endpoint"]["transport"] = "transport-udp"
        for kind, fields in configs.items():
            await self.request(
                "PUT",
                f"{prefix}{kind}/{endpoint}",
                json={
                    "fields": [{"attribute": key, "value": value} for key, value in fields.items()],
                },
            )

    async def channel(self, channel_id):
        return await self.request("GET", f"channels/{quote(channel_id, safe='')}", missing_ok=True)

    async def hangup(self, channel_id):
        await self.request("DELETE", f"channels/{quote(channel_id, safe='')}", missing_ok=True)
