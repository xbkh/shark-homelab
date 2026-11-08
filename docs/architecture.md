# Architecture

```
iPhone / laptop (VPN on)
        │  HTTP, port 7070
        ▼
┌─────────────────────────────── home server ───────────────────────────────┐
│  shark (FastAPI + static PWA)                                             │
│    ├─ /api/status   metrics, health checks, containers, alerts            │
│    ├─ /api/history  last hour of samples (in memory)                      │
│    ├─ /api/vpn      NetBird peers (NetBird cloud API)                     │
│    ├─ /api/notify   ntfy status and test push                             │
│    └─ background tasks: sampler, alerter, heartbeat                       │
│            │                                                              │
│            ├── dockerproxy (tecnativa/docker-socket-proxy) ── docker.sock │
│            ├── HTTP checks: Nextcloud, Immich, Sunshine, Beszel, ...      │
│            └── outbound: ntfy.sh, Healthchecks.io, api.netbird.io         │
└───────────────────────────────────────────────────────────────────────────┘
```

## Backend

- **FastAPI** with a single module, `app/main.py`.
- **Authentication**: one shared password (`SHARK_PASSWORD`). A successful login sets a signed cookie (`HMAC-SHA256`, 30 days). Failed logins are rate limited per client IP.
- **Metrics**: `psutil`, read from inside the container. CPU, memory and temperature are host-wide; disk usage is read through the bind-mounted paths in `config.json`.
- **History**: a ring buffer of 240 samples taken every 15 seconds (one hour). It lives in memory and resets on restart.
- **Health checks**: each service in `config.json` is probed over HTTP(S); any status below 500 counts as up.
- **Containers**: listed and restarted through the Docker socket proxy only. Shark refuses to restart itself or the proxy.
- **Alerts**: a check that stays bad for two consecutive polls (about one minute) triggers one ntfy notification. A second notification is sent when it clears.
- **Heartbeat**: when `HEALTHCHECK_URL` is set, Shark pings it every minute. If the server, Docker or Shark stops, the pings stop and the external service raises the alarm.

## Frontend

- Vanilla JavaScript, no build step, served from `app/static/` (bind-mounted, so UI changes need no image rebuild).
- Lucide icons inlined from `icons.js`; Saira and Hanken Grotesk fonts are self-hosted.
- Visual identity: black and yellow, segmented LED meters, chamfered panels.
- PWA manifest and apple-touch icons so the app installs on the iPhone home screen. A service worker is included but browsers only run it on HTTPS, so offline support requires putting Shark behind a TLS proxy.

## Limits

- Plain HTTP: acceptable inside a WireGuard-based VPN, not on the open internet.
- One user, one password.
- History is not persisted.
