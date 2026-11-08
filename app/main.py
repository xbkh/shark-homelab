"""Shark : tableau de bord, supervision, VPN et cloud du home lab."""
import asyncio
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from collections import deque
from pathlib import Path

import httpx
import psutil
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).parent
CONFIG = json.loads((BASE.parent / "config.json").read_text())
PASSWORD = os.environ.get("SHARK_PASSWORD", "")
SECRET = (os.environ.get("SHARK_SECRET") or secrets.token_hex(32)).encode()
NETBIRD_TOKEN = os.environ.get("NETBIRD_API_TOKEN", "")
NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "")
NTFY_URL = os.environ.get("NTFY_URL", "https://ntfy.sh")
HEALTHCHECK_URL = os.environ.get("HEALTHCHECK_URL", "")
DOCKER_URL = os.environ.get("DOCKER_URL", "http://dockerproxy:2375")
SESSION_DAYS = 30

app = FastAPI(title="Shark", docs_url=None, redoc_url=None, openapi_url=None)

# ---------- Authentification (mot de passe unique, cookie signe) ----------
_attempts: dict[str, list[float]] = {}


def _sign(expiry: int) -> str:
    sig = hmac.new(SECRET, str(expiry).encode(), hashlib.sha256).hexdigest()
    return f"{expiry}.{sig}"


def _valid(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    expiry, _, sig = token.partition(".")
    if not expiry.isdigit() or int(expiry) < time.time():
        return False
    return hmac.compare_digest(_sign(int(expiry)), token)


def require_auth(request: Request):
    if not _valid(request.cookies.get("shark_session")):
        raise HTTPException(status_code=401, detail="non connecte")


@app.post("/api/login")
async def login(request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    now = time.time()
    recent = [t for t in _attempts.get(ip, []) if now - t < 300]
    if len(recent) >= 8:
        raise HTTPException(status_code=429, detail="trop de tentatives, reessaie dans 5 minutes")
    body = await request.json()
    pwd = str(body.get("password", ""))
    if not PASSWORD or not hmac.compare_digest(pwd.encode(), PASSWORD.encode()):
        recent.append(now)
        _attempts[ip] = recent
        await asyncio.sleep(1)
        raise HTTPException(status_code=401, detail="mot de passe incorrect")
    _attempts.pop(ip, None)
    expiry = int(now + SESSION_DAYS * 86400)
    response.set_cookie("shark_session", _sign(expiry), max_age=SESSION_DAYS * 86400,
                        httponly=True, samesite="strict")
    return {"ok": True}


@app.post("/api/logout")
async def logout(response: Response):
    response.delete_cookie("shark_session")
    return {"ok": True}


@app.get("/api/me")
async def me(request: Request):
    return {"authenticated": _valid(request.cookies.get("shark_session")), "name": CONFIG["name"]}


# ---------- Metriques machine ----------
HISTORY: deque = deque(maxlen=240)  # 240 x 15 s = 1 h
_last_net = {"t": time.time(), "rx": 0, "tx": 0}


def _temps() -> float | None:
    try:
        best = None
        for _, entries in psutil.sensors_temperatures().items():
            for e in entries:
                if e.current and (best is None or e.current > best):
                    best = e.current
        return round(best, 1) if best is not None else None
    except Exception:
        return None


def _net_rate() -> tuple[float, float]:
    c = psutil.net_io_counters()
    now = time.time()
    dt = max(now - _last_net["t"], 0.001)
    rx = (c.bytes_recv - _last_net["rx"]) / dt if _last_net["rx"] else 0.0
    tx = (c.bytes_sent - _last_net["tx"]) / dt if _last_net["tx"] else 0.0
    _last_net.update(t=now, rx=c.bytes_recv, tx=c.bytes_sent)
    return max(rx, 0.0), max(tx, 0.0)


def snapshot() -> dict:
    vm = psutil.virtual_memory()
    rx, tx = _net_rate()
    load = os.getloadavg()
    return {
        "t": int(time.time()),
        "cpu": psutil.cpu_percent(interval=None),
        "mem": vm.percent,
        "mem_used": vm.used,
        "mem_total": vm.total,
        "temp": _temps(),
        "rx": rx,
        "tx": tx,
        "load": [round(x, 2) for x in load],
        "uptime": int(time.time() - psutil.boot_time()),
        "cores": psutil.cpu_count(),
    }


async def sampler():
    psutil.cpu_percent(interval=None)
    while True:
        await asyncio.sleep(15)
        s = snapshot()
        HISTORY.append({k: s[k] for k in ("t", "cpu", "mem", "temp", "rx", "tx")})


@app.on_event("startup")
async def _startup():
    snapshot()
    asyncio.create_task(sampler())
    asyncio.create_task(alerter())
    asyncio.create_task(heartbeat())


def disks() -> list[dict]:
    out = []
    for d in CONFIG["disks"]:
        p = d["path"]
        try:
            if not os.path.ismount(p) and p != "/host/rootfs":
                out.append({"name": d["name"], "mounted": False})
                continue
            u = psutil.disk_usage(p)
            out.append({"name": d["name"], "mounted": True, "total": u.total, "used": u.used, "percent": u.percent})
        except Exception:
            out.append({"name": d["name"], "mounted": False})
    return out


# ---------- Services et conteneurs ----------
async def check_service(client: httpx.AsyncClient, svc: dict) -> dict:
    t0 = time.time()
    ok, code = False, None
    try:
        r = await client.get(svc["check"], timeout=4)
        code = r.status_code
        ok = r.status_code < 500
    except Exception:
        pass
    return {"name": svc["name"], "group": svc["group"], "link": svc["link"], "icon": svc.get("icon", ""),
            "up": ok, "code": code, "ms": int((time.time() - t0) * 1000)}


async def containers() -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=4) as c:
            r = await c.get(f"{DOCKER_URL}/containers/json", params={"all": 1})
            r.raise_for_status()
            return [{"name": x["Names"][0].lstrip("/"), "state": x["State"], "status": x["Status"],
                     "image": x["Image"].split("@")[0][-40:]} for x in r.json()]
    except Exception:
        return []


def build_checks(s: dict, ds: list, svcs: list, cts: list) -> list[dict]:
    checks = []

    def add(level, text):
        checks.append({"level": level, "text": text})

    for d in ds:
        if d.get("mounted") and d["percent"] >= 90:
            add("crit", f"Disque « {d['name']} » plein à {d['percent']:.0f} %")
        elif d.get("mounted") and d["percent"] >= 80:
            add("warn", f"Disque « {d['name']} » rempli à {d['percent']:.0f} %")
    if s["mem"] >= 92:
        add("crit", f"Mémoire saturée ({s['mem']:.0f} %)")
    elif s["mem"] >= 85:
        add("warn", f"Mémoire élevée ({s['mem']:.0f} %)")
    if s["temp"] and s["temp"] >= 85:
        add("crit", f"Température élevée ({s['temp']} °C)")
    elif s["temp"] and s["temp"] >= 75:
        add("warn", f"Température à surveiller ({s['temp']} °C)")
    for v in svcs:
        if not v["up"]:
            add("crit", f"Service « {v['name']} » ne répond pas")
    for c in cts:
        if c["state"] != "running":
            add("crit", f"Conteneur « {c['name']} » arrêté ({c['status']})")
    if not checks:
        add("ok", "Tout est en ordre")
    return checks


async def collect(s: dict | None = None) -> dict:
    s = s or snapshot()
    ds = disks()
    async with httpx.AsyncClient(verify=False) as client:
        svcs, cts = await asyncio.gather(
            asyncio.gather(*[check_service(client, v) for v in CONFIG["services"]]),
            containers(),
        )
    svcs = list(svcs)
    return {"host": s, "disks": ds, "services": svcs, "containers": cts,
            "checks": build_checks(s, ds, svcs, cts), "host_ip": CONFIG["host_ip"]}


@app.get("/api/status", dependencies=[Depends(require_auth)])
async def status():
    return await collect()


# ---------- Notifications push (ntfy) ----------
async def notify(title: str, message: str, priority: int = 3, tags: list[str] | None = None) -> bool:
    if not NTFY_TOPIC:
        return False
    for _ in range(3):
        try:
            async with httpx.AsyncClient(timeout=25) as c:
                r = await c.post(NTFY_URL, json={"topic": NTFY_TOPIC, "title": title, "message": message,
                                                 "priority": priority, "tags": tags or []})
            if r.status_code < 300:
                return True
        except Exception:
            pass
        await asyncio.sleep(2)
    return False


def _key(text: str) -> str:
    return re.sub(r"\d+", "#", text)


async def alerter():
    """Previent par notification quand un probleme dure plus d'une minute, puis quand il est resolu."""
    seen: dict[str, int] = {}      # cle -> nombre de controles consecutifs
    sent: dict[str, str] = {}      # cle -> texte envoye
    await asyncio.sleep(60)
    while True:
        try:
            s = {"mem": psutil.virtual_memory().percent, "temp": _temps()}
            data = await collect(s)
            now_keys = {}
            for c in data["checks"]:
                if c["level"] != "ok":
                    now_keys[_key(c["text"])] = c
            for k, c in now_keys.items():
                seen[k] = seen.get(k, 0) + 1
                if seen[k] >= 2 and k not in sent:
                    ok = await notify("Shark : " + ("problème" if c["level"] == "crit" else "à surveiller"),
                                      c["text"], 4 if c["level"] == "crit" else 3,
                                      ["rotating_light" if c["level"] == "crit" else "warning"])
                    if ok:
                        sent[k] = c["text"]
            for k in list(seen):
                if k not in now_keys:
                    seen.pop(k)
                    if k in sent:
                        await notify("Shark : résolu", sent.pop(k), 3, ["white_check_mark"])
        except Exception:
            pass
        await asyncio.sleep(30)


async def heartbeat():
    """Pings an external dead man's switch (e.g. Healthchecks.io) every minute.
    If the host, Docker or Shark itself dies, the pings stop and the external service alerts you."""
    if not HEALTHCHECK_URL:
        return
    while True:
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                await c.get(HEALTHCHECK_URL)
        except Exception:
            pass
        await asyncio.sleep(60)


@app.get("/api/notify", dependencies=[Depends(require_auth)])
async def notify_status():
    return {"configured": bool(NTFY_TOPIC), "server": NTFY_URL, "topic": NTFY_TOPIC}


@app.post("/api/notify/test", dependencies=[Depends(require_auth)])
async def notify_test():
    ok = await notify("Shark : test", "Les notifications fonctionnent.", 3, ["bell"])
    if not ok:
        raise HTTPException(status_code=502, detail="envoi impossible (sujet ntfy absent ou serveur injoignable)")
    return {"ok": True}


@app.get("/api/history", dependencies=[Depends(require_auth)])
async def history():
    return list(HISTORY)


@app.post("/api/containers/{name}/restart", dependencies=[Depends(require_auth)])
async def restart_container(name: str):
    if name.startswith("shark") or "dockerproxy" in name:
        raise HTTPException(status_code=400, detail="refuse : conteneur de Shark")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{DOCKER_URL}/containers/{name}/restart")
    if r.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"docker a repondu {r.status_code}")
    return {"ok": True}


# ---------- VPN (NetBird) ----------
@app.get("/api/vpn", dependencies=[Depends(require_auth)])
async def vpn():
    if not NETBIRD_TOKEN:
        return {"configured": False, "peers": []}
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get("https://api.netbird.io/api/peers",
                            headers={"Authorization": f"Token {NETBIRD_TOKEN}", "Accept": "application/json"})
            r.raise_for_status()
        peers = [{"name": p.get("name"), "ip": p.get("ip"), "connected": p.get("connected"),
                  "last_seen": p.get("last_seen"), "os": p.get("os"), "version": p.get("version")}
                 for p in r.json()]
        return {"configured": True, "peers": peers}
    except Exception as e:
        return {"configured": True, "error": str(e)[:200], "peers": []}


@app.get("/api/config", dependencies=[Depends(require_auth)])
async def config():
    return {"name": CONFIG["name"], "host_ip": CONFIG["host_ip"], "services": CONFIG["services"]}


# ---------- Interface ----------
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.get("/")
async def index():
    return FileResponse(BASE / "static" / "index.html")


@app.get("/manifest.webmanifest")
async def manifest():
    return FileResponse(BASE / "static" / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/sw.js")
async def sw():
    return FileResponse(BASE / "static" / "sw.js", media_type="application/javascript",
                        headers={"Service-Worker-Allowed": "/"})
