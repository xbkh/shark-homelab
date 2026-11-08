# Deployment

## 1. Prerequisites

- Linux host with Docker and the Compose plugin.
- A private network to reach it from your devices. The reference setup uses [NetBird](https://netbird.io) and binds Shark to the VPN address.

## 2. Configure

```bash
cp .env.example .env
python3 -c "import secrets;print(secrets.token_hex(32))"   # use as SHARK_SECRET
```

Edit `.env` and `config.json`:

- `host_ip` and every `link` / `check` URL in `config.json` must use your server address.
- In `docker-compose.yml`, change the published port to your VPN address, for example `'100.64.0.10:7070:7070'`.
- If the host firewall is `ufw` with a default deny, allow the Docker bridge network to reach host-level services you want to check (for example `ufw allow from 172.16.0.0/12 to any port 9090 proto tcp`).

## 3. Run

```bash
docker compose up -d --build
```

Update the UI only: edit files under `app/static/` and reload the page (the folder is bind-mounted). Backend changes need `docker compose up -d --build`.

## 4. Install on iPhone

1. Turn the VPN on.
2. Open `http://<vpn-address>:7070` in Safari.
3. Share, then Add to Home Screen.

## 5. Alerts

**Push notifications (ntfy)**

1. Choose a long random topic and set `NTFY_TOPIC` in `.env`.
2. Install the ntfy app and subscribe to that topic.
3. In Shark, open the Alerts page and press Send test.

**Server offline alert (Healthchecks.io)**

1. Create a free account and a check named `Shark`: period 1 minute, grace time 3 minutes.
2. Add the ntfy integration to the check (same topic) so the alert reaches your phone.
3. Copy the check's ping URL into `HEALTHCHECK_URL` in `.env`.
4. Run `docker compose up -d`. Stop the container for a few minutes to verify that the alert arrives.

## 6. Backups

Shark stores no data. Back up `.env` and `config.json`; everything else is in the repository.
