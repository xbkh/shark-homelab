# Shark

A self-hosted dashboard for a home lab: monitoring, services, private VPN (NetBird), private cloud (Nextcloud, Immich) and game/desktop streaming (Sunshine + Moonlight) in one installable web app.

Shark runs as two small containers on the home server, is reachable only through the VPN, and installs on an iPhone or desktop as a progressive web app (PWA).

> The user interface is currently in French. Documentation, code and commit messages are in English.

## Features

- **Overview**: live CPU, memory, temperature and network meters, one-hour history, disk usage.
- **Services**: health checks (HTTP) for every service you configure, with direct links.
- **Containers**: list of Docker containers with one-tap restart and a log viewer, through a restricted Docker socket proxy.
- **VPN**: connection guide and, with a NetBird API token, the list of peers and their state.
- **Cloud**: status of Nextcloud and Immich, free space, and the state of the nightly backup snapshots.
- **Streaming**: Moonlight/Sunshine quick start and a link to the Cockpit web terminal.
- **Alerts**: automatic checks (full disk, memory, temperature, service or container down) with push notifications through [ntfy](https://ntfy.sh).
- **Dead man's switch**: optional heartbeat to [Healthchecks.io](https://healthchecks.io) so you are alerted when the whole server goes offline.

## Quick start

Requirements: a Linux host with Docker and Docker Compose, plus a VPN or network you trust (Shark serves plain HTTP).

```bash
cp .env.example .env        # set SHARK_PASSWORD and SHARK_SECRET
$EDITOR config.json         # your host IP, services and disks
docker compose up -d --build
```

Open `http://<host-ip>:7070`. On iPhone, use Safari, then Share, then Add to Home Screen.

See [docs/deployment.md](docs/deployment.md) for details and [docs/architecture.md](docs/architecture.md) for how it works.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `SHARK_PASSWORD` | yes | Password of the web UI |
| `SHARK_SECRET` | yes | Secret used to sign session cookies |
| `NETBIRD_API_TOKEN` | no | Lists NetBird peers in the VPN page |
| `NTFY_TOPIC` | no | Enables push alerts (use a long random topic, it acts as a password) |
| `HEALTHCHECK_URL` | no | Healthchecks.io ping URL, pinged every minute |
| `BACKUPS_DIR` | no | Host folder with backup snapshots, mounted read-only to show their status |

Services and disks are defined in [`config.json`](config.json).

## Security notes

- Shark is meant to be reachable **only through a VPN** or a trusted LAN. Do not expose port 7070 to the internet.
- Login is a single shared password, signed cookie sessions (HttpOnly, SameSite=Strict) and a rate limit of 8 failed attempts per 5 minutes per IP.
- Docker is reached through `tecnativa/docker-socket-proxy`, which only allows listing and restarting containers.
- The app mounts only a hostname file (for root disk usage) and `/mnt` read-only from the host.

## Project layout

```
app/main.py        FastAPI backend: auth, metrics, health checks, Docker, NetBird, alerts
app/static/        Vanilla JS PWA (no build step), Lucide icons, self-hosted fonts
config.json        Services and disks to monitor
docker-compose.yml Shark + Docker socket proxy
docs/              Architecture, deployment and roadmap
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).
