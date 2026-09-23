"""Isolated training dialplan. No trunks, external routes, anonymous calls or default demo."""

import os
import socket
from ipaddress import ip_address, ip_network
from pathlib import Path

root = Path("/etc/asterisk")
password = os.environ["ARI_PASSWORD"]
address = os.environ.get("SIP_PUBLIC_ADDRESS", "127.0.0.1")
ip_address(address)
local_net = os.environ.get("SIP_LOCAL_NET", "172.16.0.0/12")
ip_network(local_net)
ice_address = str(
    ip_address(os.environ.get("SIP_ICE_ADDRESS", socket.gethostbyname(socket.gethostname())))
)
for value in (password, address, local_net):
    if any(char in value for char in "\r\n;[]"):
        raise ValueError("Invalid configuration value")
if len(password) < 24:
    raise ValueError("ARI_PASSWORD must contain at least 24 characters")
configs = {
    "asterisk.conf": """[directories]
astetcdir=/etc/asterisk
astmoddir=/usr/lib/asterisk/modules
astvarlibdir=/var/lib/asterisk
astdbdir=/var/lib/asterisk
astkeydir=/var/lib/asterisk
astdatadir=/var/lib/asterisk
astagidir=/var/lib/asterisk/agi-bin
astspooldir=/var/spool/asterisk
astrundir=/var/run/asterisk
astlogdir=/var/log/asterisk
[options]
verbose=1
""",
    "http.conf": "[general]\nenabled=yes\nbindaddr=0.0.0.0\nbindport=8088\n",
    "ari.conf": (
        f"[general]\nenabled=yes\n[trainer]\ntype=user\nread_only=no\npassword={password}\n"
    ),
    "modules.conf": "[modules]\nautoload=yes\nnoload=chan_sip.so\n",
    "logger.conf": "[logfiles]\nconsole=notice,warning,error\n",
    "rtp.conf": (
        "[general]\nrtpstart=10000\nrtpend=10100\nicesupport=yes\n[ice_host_candidates]\n"
        f"{ice_address} => {address}\n"
    ),
    "sorcery.conf": (
        "[res_pjsip]\nendpoint=astdb,ps_endpoints\nauth=astdb,ps_auths\naor=astdb,ps_aors\n"
    ),
    "pjsip.conf": f"""[global]
type=global
endpoint_identifier_order=username,ip
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060
local_net={local_net}
external_media_address={address}
external_signaling_address={address}
[transport-ws]
type=transport
protocol=ws
bind=0.0.0.0
local_net={local_net}
external_media_address={address}
""",
    "extensions.conf": """[training-only]
exten => 9000,1,Stasis(trainer,${CHANNEL(endpoint)})
 same => n,Hangup()
exten => _.,1,Hangup(21)
""",
}
for name, content in configs.items():
    path = root / name
    path.write_text(content)
    path.chmod(0o600)
os.execvp("asterisk", ["asterisk", "-f", "-g"])
