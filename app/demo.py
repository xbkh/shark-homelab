"""Demo mode (SHARK_DEMO=1): realistic sample data so the dashboard can be tried or
screenshotted without a server, a VPN or any real credentials."""
import math
import random
import time

_START = time.time()
_rng = random.Random(7)


def _wave(t: float, base: float, amp: float, period: float, noise: float = 0.0) -> float:
    # two incommensurate sines plus noise look far more natural than a single wave
    slow = math.sin(t / period) + 0.6 * math.sin(t / (period * 2.7) + 1.3)
    return base + amp * slow + _rng.uniform(-noise, noise) * 2.5


def snapshot() -> dict:
    t = time.time()
    mem_total = 32 * 1024 ** 3
    mem = max(5.0, min(95.0, _wave(t, 38, 3, 90, 0.4)))
    return {
        "t": int(t),
        "cpu": round(max(1.0, min(99.0, _wave(t, 14, 9, 40, 3))), 1),
        "mem": round(mem, 1),
        "mem_used": int(mem_total * mem / 100),
        "mem_total": mem_total,
        "temp": round(_wave(t, 52, 4, 70, 0.6), 1),
        "rx": max(0.0, _wave(t, 420_000, 380_000, 25, 90_000)),
        "tx": max(0.0, _wave(t, 180_000, 150_000, 31, 60_000)),
        "load": [0.62, 0.55, 0.48],
        "uptime": int(26 * 3600 + 14 * 60 + (t - _START)),
        "cores": 8,
    }


def history(n: int = 240) -> list[dict]:
    now = time.time()
    out = []
    for i in range(n):
        t = now - (n - i) * 15
        mem = max(5.0, min(95.0, _wave(t, 38, 3, 90, 0.4)))
        out.append({
            "t": int(t),
            "cpu": round(max(1.0, min(99.0, _wave(t, 14, 9, 40, 3))), 1),
            "mem": round(mem, 1),
            "temp": round(_wave(t, 52, 4, 70, 0.6), 1),
            "rx": max(0.0, _wave(t, 420_000, 380_000, 25, 90_000)),
            "tx": max(0.0, _wave(t, 180_000, 150_000, 31, 60_000)),
        })
    return out


GB = 1024 ** 3


def disks() -> list[dict]:
    rows = [("System (NVMe)", 465, 0.31), ("Games SSD", 600, 0.38), ("Data SSD", 294, 0.12)]
    return [{"name": n, "mounted": True, "total": int(t * GB), "used": int(t * GB * p), "percent": round(p * 100, 1)}
            for n, t, p in rows]


def service_state(svc: dict) -> dict:
    ms = {"Nextcloud": 38, "Immich": 22, "Sunshine": 31, "Beszel": 14, "Homepage": 11,
          "AdGuard Home": 9, "Cockpit": 27}.get(svc["name"], 20)
    return {"name": svc["name"], "group": svc["group"], "link": svc["link"], "icon": svc.get("icon", ""),
            "up": True, "code": 200, "ms": ms + _rng.randint(0, 6)}


def containers() -> list[dict]:
    rows = [
        ("shark-shark-1", "shark-shark", "Up 3 hours"),
        ("shark-dockerproxy-1", "tecnativa/docker-socket-proxy", "Up 3 hours"),
        ("nextcloud-app-1", "nextcloud:stable", "Up 2 days"),
        ("nextcloud-db-1", "mariadb:11", "Up 2 days"),
        ("nextcloud-redis-1", "redis:7-alpine", "Up 2 days"),
        ("immich_server", "ghcr.io/immich-app/immich-server", "Up 2 days"),
        ("immich_machine_learning", "ghcr.io/immich-app/immich-machine-learning", "Up 2 days"),
        ("immich_postgres", "ghcr.io/immich-app/postgres", "Up 2 days (healthy)"),
        ("immich_redis", "redis:7-alpine", "Up 2 days (healthy)"),
        ("adguard-adguard-1", "adguard/adguardhome", "Up 5 hours"),
        ("monitoring-beszel-1", "henrygd/beszel", "Up 2 days"),
        ("monitoring-beszel-agent-1", "henrygd/beszel-agent", "Up 2 days"),
        ("monitoring-homepage-1", "ghcr.io/gethomepage/homepage", "Up 2 days"),
    ]
    return [{"name": n, "state": "running", "status": s, "image": i} for n, i, s in rows]


def backups() -> dict:
    today = time.time()
    days = [time.strftime("%Y-%m-%d", time.localtime(today - d * 86400)) for d in range(11, 0, -1)]
    return {"available": True, "snapshots": days, "in_progress": None,
            "last": {"name": days[-1], "age_h": 9.5}}


def vpn() -> dict:
    return {"configured": True, "peers": [
        {"name": "shark", "ip": "100.64.0.10", "connected": True, "last_seen": None, "os": "Linux", "version": "0.82.0"},
        {"name": "laptop", "ip": "100.64.0.20", "connected": True, "last_seen": None, "os": "Linux", "version": "0.82.0"},
        {"name": "iphone", "ip": "100.64.0.30", "connected": True, "last_seen": None, "os": "iOS", "version": "0.41.0"},
    ]}


def logs(name: str) -> str:
    now = time.time()
    lines = []
    msgs = ["GET /status.php 200", "cron: background job finished", "health check OK",
            "sync: 3 files up to date", "GET /api/server/ping 200", "metrics scrape completed"]
    for i in range(40):
        ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(now - (40 - i) * 37)) + ".000000000Z"
        lines.append(f"{ts} [{name}] {msgs[i % len(msgs)]}")
    return "\n".join(lines)
