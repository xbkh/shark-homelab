"use strict";
const $app = document.getElementById("app");

/* ---------- Outils ---------- */
const ic = (n, c = "") => `<svg class="i ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.ICONS || {})[n] || ""}</svg>`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FIN = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0a0a0b"/><path d="M9 45c7-1 11-6 13-14 2-9 9-15 20-17-3 6-4 12-1 17 3 2 7 7 8 13-7-3-12-3-18 0-5 2-11 3-22 1z" fill="#ffd400"/></svg>`;
const gb = b => (b / 1e9).toFixed(b >= 1e11 ? 0 : 1).replace(".", ",") + " Go";
const rate = b => b > 1e6 ? (b / 1e6).toFixed(1).replace(".", ",") + " Mo/s" : Math.round(b / 1e3) + " Ko/s";
const dur = s => { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + " j " : "") + (d || h ? h + " h " : "") + m + " min"; };
const lv = p => p >= 90 ? "bad" : p >= 78 ? "warn" : "";
const SVC_ICON = { Nextcloud: "folder-open", Immich: "image", Sunshine: "radio-tower", Beszel: "activity", Homepage: "layout-dashboard", Cockpit: "terminal" };
const OS_ICON = o => /android|ios|iphone/i.test(o || "") ? "smartphone" : /linux|windows|mac/i.test(o || "") ? "laptop" : "server";

const TABS = [["home", "layout-dashboard", "Aperçu"], ["services", "blocks", "Services"], ["vpn", "shield-check", "VPN"], ["cloud", "cloud", "Cloud"], ["stream", "monitor-play", "Streaming"], ["alerts", "bell", "Alertes"]];
const TITLES = {
  home: ["Aperçu", "L'état de ton Sharkoon en direct."],
  services: ["Services", "Ce qui tourne sur la machine, et un accès direct à chacun."],
  vpn: ["VPN", "Ton réseau privé NetBird et ses appareils."],
  cloud: ["Cloud", "Tes fichiers et tes photos, chez toi."],
  stream: ["Streaming et bureau", "Joue et travaille sur le Sharkoon depuis n'importe où."],
  alerts: ["Alertes", "Les vérifications automatiques, mises à jour toutes les 10 secondes."],
};
let tab = location.hash.slice(1) in TITLES ? location.hash.slice(1) : "home";
let data = null, hist = [], vpn = null, notif = null, timer = null;

async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...opts });
  if (r.status === 401 && path !== "/api/login") { renderLogin(); throw new Error("401"); }
  if (!r.ok) { let d = ""; try { d = (await r.json()).detail; } catch { } throw new Error(d || r.status); }
  return r.json();
}
function toast(msg, icon = "circle-check") { const t = document.createElement("div"); t.className = "toast"; t.innerHTML = ic(icon, "sm") + `<span>${esc(msg)}</span>`; document.body.appendChild(t); setTimeout(() => t.remove(), 3000); }

/* ---------- Connexion ---------- */
function renderLogin() {
  clearInterval(timer); data = null;
  $app.innerHTML = `<div class="login"><div class="box">
    <div class="mark">${FIN}<b>SHARK</b></div>
    <p>Connecte-toi pour piloter ton Sharkoon.</p>
    <form id="f" style="display:grid;gap:12px">
      <div class="field">${ic("lock")}<input type="password" id="pw" placeholder="Mot de passe" autocomplete="current-password" required autofocus></div>
      <button class="btn" type="submit">Se connecter</button>
      <div class="err" id="err" role="alert"></div>
    </form></div></div>`;
  document.getElementById("f").onsubmit = async e => {
    e.preventDefault();
    try { await api("/api/login", { method: "POST", body: JSON.stringify({ password: document.getElementById("pw").value }) }); start(); }
    catch (x) { document.getElementById("err").textContent = x.message === "401" ? "Mot de passe incorrect." : x.message; }
  };
}

/* ---------- Composants ---------- */
function meter(icon, label, pct, valueHtml) {
  return `<div class="meter"><div class="top"><span>${ic(icon, "sm")}${label}</span><b>${valueHtml}</b></div><div class="led ${lv(pct)}" style="--p:${Math.min(Math.max(pct, 0), 100)}%"></div></div>`;
}
function chart(series) {
  const w = 600, h = 150, pad = 6;
  const n = Math.max(...series.map(s => s.v.length));
  if (n < 2) return `<div class="note">${ic("clock", "sm")}<span>Les courbes apparaissent après une minute de mesures.</span></div>`;
  let svg = `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Historique">`;
  for (const g of [0, 25, 50, 75, 100]) { const y = pad + (1 - g / 100) * (h - 2 * pad); svg += `<line x1="0" x2="${w}" y1="${y}" y2="${y}" stroke="#26262c" stroke-width="1"/>`; }
  series.forEach(s => {
    const pts = s.v.map((v, i) => [i / (s.v.length - 1) * w, pad + (1 - Math.min(v, 100) / 100) * (h - 2 * pad)]);
    const line = pts.map(p => p.map(x => x.toFixed(1)).join(",")).join(" ");
    if (s.fill) svg += `<polygon points="0,${h} ${line} ${w},${h}" fill="${s.color}" opacity=".12"/>`;
    svg += `<polyline points="${line}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  });
  return svg + `</svg><div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div>`;
}
const statusOf = () => data.checks.some(c => c.level === "crit") ? "bad" : data.checks.some(c => c.level === "warn") ? "warn" : "ok";
const problems = () => data.checks.filter(c => c.level !== "ok").length;

/* ---------- Pages ---------- */
function pageHome() {
  const h = data.host, st = statusOf(), up = data.services.filter(s => s.up).length, nProb = problems();
  const head = st === "ok" ? "Tout fonctionne." : nProb === 1 ? "Un point à traiter." : `${nProb} points à traiter.`;
  const chipTxt = st === "ok" ? "En ligne" : st === "warn" ? "À surveiller" : "Problème détecté";
  const disks = data.disks.map(d => d.mounted
    ? `<div class="line" style="display:block"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b style="font-weight:600">${esc(d.name)}</b><span class="muted">${gb(d.used)} sur ${gb(d.total)}</span></div><div class="led thin ${lv(d.percent)}" style="--p:${d.percent}%"></div></div>`
    : `<div class="line"><div class="tile" style="color:var(--dim)">${ic("hard-drive")}</div><div class="txt"><b>${esc(d.name)}</b><span>Non branché sur le Sharkoon</span></div><span class="tag">Absent</span></div>`).join("");
  const top = data.services.slice(0, 6).map(s => `<div class="line"><div class="tile">${ic(SVC_ICON[s.name] || "server")}</div><div class="txt"><b>${esc(s.name)}</b><span>${s.up ? "Répond en " + s.ms + " ms" : "Ne répond pas"}</span></div><span class="sdot ${s.up ? "ok" : "bad"}"></span></div>`).join("");
  return `<div class="stack">
    <section class="panel hot hero">
      <div class="state"><span class="chip ${st === "ok" ? "" : st}"><i class="sdot ${st === "ok" ? "ok" : st}"></i>${chipTxt}</span>
        <h1>${head}</h1>
        <p>Allumé depuis ${dur(h.uptime)}. ${up} service${up > 1 ? "s" : ""} sur ${data.services.length} répondent${nProb ? "" : ", aucune alerte"}.</p></div>
      <div class="meters">
        ${meter("cpu", "Processeur", h.cpu, `${h.cpu.toFixed(0)}<small>%</small>`)}
        ${meter("memory-stick", "Mémoire", h.mem, `${h.mem.toFixed(0)}<small>% · ${gb(h.mem_used)}</small>`)}
        ${meter("thermometer", "Température", h.temp ? h.temp / 90 * 100 : 0, h.temp ? `${h.temp.toFixed(0)}<small>°C</small>` : "—")}
        ${meter("activity", "Réseau", Math.min((h.rx + h.tx) / 5e6 * 100, 100), `${rate(h.rx + h.tx)}`)}
      </div>
    </section>
    <div class="grid g2">
      <section class="panel"><h2>${ic("activity")}Charge sur la dernière heure</h2>${chart([{ name: "Processeur", color: "#ffd400", v: hist.map(x => x.cpu), fill: true }, { name: "Mémoire", color: "#9a9aa4", v: hist.map(x => x.mem) }])}</section>
      <section class="panel"><h2>${ic("hard-drive")}Stockage</h2><div class="rows">${disks}</div></section>
    </div>
    <section class="panel"><h2>${ic("blocks")}Services<span class="tail">${up}/${data.services.length} en ligne</span></h2><div class="grid g3" style="gap:0 28px">${top}</div></section>
  </div>`;
}

function pageServices() {
  const groups = {}; data.services.forEach(s => (groups[s.group] ||= []).push(s));
  const gh = Object.entries(groups).map(([g, list]) => `<section class="panel"><h2>${esc(g)}</h2><div class="rows">` + list.map(s =>
    `<div class="line"><div class="tile">${ic(SVC_ICON[s.name] || "server")}</div><div class="txt"><b>${esc(s.name)}</b><span>${s.up ? "En ligne · " + s.ms + " ms" : "Ne répond pas"}</span></div><span class="sdot ${s.up ? "ok" : "bad"}"></span><a class="iconbtn" href="${esc(s.link)}" target="_blank" rel="noopener" aria-label="Ouvrir ${esc(s.name)}">${ic("external-link", "sm")}</a></div>`).join("") + `</div></section>`).join("");
  const ct = data.containers.length ? data.containers.map(c => {
    const prot = /^shark|dockerproxy/.test(c.name);
    return `<div class="line"><div class="tile">${ic("container")}</div><div class="txt"><b>${esc(c.name)}</b><span>${esc(c.status)}</span></div><span class="sdot ${c.state === "running" ? "ok" : "bad"}"></span>${prot ? "" : `<button class="iconbtn" data-restart="${esc(c.name)}" aria-label="Redémarrer ${esc(c.name)}" title="Redémarrer">${ic("rotate-cw", "sm")}</button>`}</div>`;
  }).join("") : `<div class="note">${ic("info", "sm")}<span>Aucun conteneur détecté.</span></div>`;
  return `<div class="stack"><div class="grid g2">${gh}</div><section class="panel"><h2>${ic("container")}Conteneurs Docker<span class="tail">${data.containers.filter(c => c.state === "running").length}/${data.containers.length} actifs</span></h2><div class="rows">${ct}</div></section></div>`;
}

function pageVpn() {
  const how = `<section class="panel"><h2>${ic("smartphone")}Se connecter depuis l'iPhone</h2><ol class="steps">
    <li><div><b>Installe NetBird</b><div class="muted">Depuis l'App Store.</div></div></li>
    <li><div><b>Connecte-toi avec le même compte</b><div class="muted">Celui de ton TUF et de ton Sharkoon.</div></div></li>
    <li><div><b>Active le VPN</b><div class="muted">Shark et le cloud répondent alors en Wi-Fi comme en 4G ou 5G.</div></div></li></ol>
    <div style="margin-top:16px" class="muted">Adresse du Sharkoon sur le VPN : <span class="code">${esc(data.host_ip)}</span></div></section>`;
  let peers;
  if (!vpn) peers = `<div class="note">${ic("clock", "sm")}<span>Chargement…</span></div>`;
  else if (!vpn.configured) peers = `<div class="note">${ic("info", "sm")}<span>Pour lister tes appareils ici, crée un jeton d'API dans NetBird (Paramètres, Jetons d'accès personnels) et ajoute-le à la ligne <b>NETBIRD_API_TOKEN</b> du fichier <b>~/cloud/shark/.env</b> sur le Sharkoon.</span></div>`;
  else if (vpn.error) peers = `<div class="alert crit">${ic("circle-x")}<span>${esc(vpn.error)}</span></div>`;
  else peers = `<div class="rows">` + vpn.peers.map(p => `<div class="line"><div class="tile">${ic(OS_ICON(p.os))}</div><div class="txt"><b>${esc(p.name)}</b><span>${esc(p.ip)}${p.os ? " · " + esc(p.os) : ""}</span></div><span class="tag ${p.connected ? "ok" : ""}">${p.connected ? "Connecté" : "Hors ligne"}</span></div>`).join("") + `</div>`;
  return `<div class="grid g2"><section class="panel hot"><h2>${ic("shield-check")}Appareils du réseau</h2>${peers}</section>${how}</div>`;
}

function pageCloud() {
  const nc = data.services.find(s => s.name === "Nextcloud"), im = data.services.find(s => s.name === "Immich"), d = data.disks[0];
  const tile = (s, icon, title, desc) => `<section class="panel"><h2>${ic(icon)}${title}<span class="tail"><span class="tag ${s && s.up ? "ok" : "bad"}">${s && s.up ? "En ligne" : "Hors ligne"}</span></span></h2><p class="muted" style="margin-bottom:16px">${desc}</p>${s ? `<a class="btn" href="${esc(s.link)}" target="_blank" rel="noopener">Ouvrir ${esc(s.name)} ${ic("external-link", "sm")}</a>` : ""}</section>`;
  return `<div class="stack"><div class="grid g2">
    ${tile(nc, "folder-open", "Fichiers", "Documents, dossiers et synchronisation avec Nextcloud.")}
    ${tile(im, "image", "Photos et vidéos", "Sauvegarde automatique de ton téléphone avec Immich.")}
  </div>
  <div class="grid g2">
    <section class="panel"><h2>${ic("database")}Espace disponible</h2>${d && d.mounted ? `<div class="meter"><div class="top"><span>Disque du cloud</span><b>${gb(d.total - d.used)}<small>libres</small></b></div><div class="led ${lv(d.percent)}" style="--p:${d.percent}%"></div></div><p class="muted" style="margin-top:12px">${gb(d.used)} utilisés sur ${gb(d.total)}.</p>` : `<div class="note">${ic("info", "sm")}<span>Disque indisponible.</span></div>`}</section>
    <section class="panel"><h2>${ic("shield-check")}Sauvegarde du cloud</h2><div class="note">${ic("triangle-alert", "sm")}<span>Ton cloud n'a qu'une seule copie, sur le disque du Sharkoon. Garde une autre copie de tout ce qui compte tant qu'une sauvegarde automatique n'est pas en place.</span></div></section>
  </div></div>`;
}

function pageStream() {
  const sun = data.services.find(s => s.name === "Sunshine"), cp = data.services.find(s => s.name === "Cockpit");
  return `<div class="grid g2">
    <section class="panel hot"><h2>${ic("gamepad-2")}Moonlight<span class="tail"><span class="tag ${sun && sun.up ? "ok" : "bad"}">${sun && sun.up ? "Prêt" : "Indisponible"}</span></span></h2>
      <ol class="steps"><li><div><b>Ouvre Moonlight</b><div class="muted">Sur ton PC, ton iPhone ou ta tablette, avec le VPN actif.</div></div></li>
      <li><div><b>Ajoute le Sharkoon</b><div class="muted">Adresse : <span class="code">${esc(data.host_ip)}</span></div></div></li>
      <li><div><b>Lance « Desktop »</b><div class="muted">Pour voir et utiliser le bureau du Sharkoon.</div></div></li></ol>
      ${sun ? `<div style="margin-top:18px"><a class="btn ghost" href="${esc(sun.link)}" target="_blank" rel="noopener">${ic("settings", "sm")}Réglages Sunshine</a></div>` : ""}</section>
    <div class="stack">
      <section class="panel"><h2>${ic("terminal")}Terminal et administration</h2><p class="muted" style="margin-bottom:16px">Une console dans le navigateur : terminal, services, mises à jour et journaux du Sharkoon.</p>${cp ? `<a class="btn" href="${esc(cp.link)}" target="_blank" rel="noopener">Ouvrir Cockpit ${ic("external-link", "sm")}</a>` : ""}</section>
      <section class="panel"><h2>${ic("monitor-play")}Bureau dans Shark<span class="tail"><span class="tag y">Bientôt</span></span></h2><p class="muted">Le bureau du Sharkoon directement dans cette page, sans installer d'application.</p></section>
    </div></div>`;
}

function pageAlerts() {
  const icon = l => l === "ok" ? "circle-check" : l === "warn" ? "triangle-alert" : "circle-x";
  const checks = `<section class="panel ${statusOf() === "ok" ? "" : "hot"}"><h2>${ic("bell")}Vérifications</h2>${data.checks.map(c => `<div class="alert ${c.level}">${ic(icon(c.level))}<span>${esc(c.text)}</span></div>`).join("")}</section>`;
  let push;
  if (!notif) push = `<div class="note">${ic("clock", "sm")}<span>Chargement…</span></div>`;
  else if (!notif.configured) push = `<div class="note">${ic("info", "sm")}<span>Les notifications ne sont pas encore activées sur le Sharkoon.</span></div>`;
  else push = `<ol class="steps">
      <li><div><b>Installe ntfy</b><div class="muted">Application gratuite, depuis l'App Store.</div></div></li>
      <li><div><b>Abonne-toi à ce sujet</b><div class="muted">Touche « + » dans ntfy, puis saisis :</div><div style="margin-top:8px"><span class="code">${esc(notif.topic)}</span></div></div></li>
      <li><div><b>Vérifie que ça marche</b><div class="muted">Tu recevras une alerte dès qu'un service tombe, qu'un disque se remplit ou que la température monte.</div></div></li></ol>
      <div style="margin-top:16px"><button class="btn ghost" id="notiftest">${ic("bell", "sm")}Envoyer un test</button></div>`;
  return `<div class="grid g2">${checks}<section class="panel"><h2>${ic("smartphone")}Notifications sur ton iPhone</h2>${push}</section></div>`;
}

/* ---------- Rendu ---------- */
const PAGES = { home: pageHome, services: pageServices, vpn: pageVpn, cloud: pageCloud, stream: pageStream, alerts: pageAlerts };
function render() {
  if (!data) return;
  const n = problems(), [title, sub] = TITLES[tab] || TITLES.home;
  const side = TABS.map(([k, i, l]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}" ${tab === k ? 'aria-current="page"' : ""}>${ic(i)}<span>${l}</span>${k === "alerts" && n ? `<span class="badge">${n}</span>` : ""}</button>`).join("");
  const bar = TABS.map(([k, i, l]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}" aria-label="${l}">${ic(i)}<span>${l}</span>${k === "alerts" && n ? `<i class="dotbad"></i>` : ""}</button>`).join("");
  $app.innerHTML = `<div class="shell">
    <aside class="side"><div class="brand">${FIN}<div><b>SHARK</b><small>Home lab</small></div></div><nav class="nav" aria-label="Navigation">${side}</nav>
      <div class="foot"><span class="ip">${esc(data.host_ip)}</span><button class="linkbtn" id="logout">${ic("log-out", "sm")}Se déconnecter</button></div></aside>
    <div><div class="mtop"><div class="brand">${FIN}<b>SHARK</b></div><span class="live"><i></i>En direct</span></div>
    <main><div class="pagehead"><div><h1>${title}</h1><p>${sub}</p></div><span class="live"><i></i>En direct</span></div>${(PAGES[tab] || pageHome)()}</main></div>
    <nav class="tabbar" aria-label="Navigation">${bar}</nav></div>`;
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; location.hash = tab; if (tab === "vpn") loadVpn(); if (tab === "alerts") loadNotif(); render(); window.scrollTo(0, 0); });
  document.querySelectorAll("[data-restart]").forEach(b => b.onclick = async () => {
    const name = b.dataset.restart; if (!confirm(`Redémarrer « ${name} » ?`)) return;
    try { await api(`/api/containers/${encodeURIComponent(name)}/restart`, { method: "POST" }); toast(`${name} redémarré`); refresh(); } catch (e) { toast("Échec : " + e.message, "circle-x"); }
  });
  const nt = document.getElementById("notiftest");
  if (nt) nt.onclick = async () => { try { await api("/api/notify/test", { method: "POST" }); toast("Notification envoyée"); } catch (e) { toast("Échec : " + e.message, "circle-x"); } };
  const lo = document.getElementById("logout"); if (lo) lo.onclick = async () => { await api("/api/logout", { method: "POST" }); renderLogin(); };
}

async function refresh() {
  try { [data, hist] = await Promise.all([api("/api/status"), api("/api/history")]); render(); }
  catch (e) { if (e.message !== "401" && !data) $app.innerHTML = `<div class="login"><div class="box"><div class="mark">${FIN}<b>SHARK</b></div><div class="alert crit">${ic("circle-x")}<span>Shark est injoignable. Vérifie que le VPN NetBird est actif.</span></div><button class="btn" onclick="location.reload()">Réessayer</button></div></div>`; }
}
async function loadVpn() { try { vpn = await api("/api/vpn"); render(); } catch { } }
async function loadNotif() { try { notif = await api("/api/notify"); render(); } catch { } }
async function start() { clearInterval(timer); await refresh(); if (tab === "vpn") loadVpn(); if (tab === "alerts") loadNotif(); timer = setInterval(refresh, 10000); }
(async () => { try { const me = await api("/api/me"); me.authenticated ? start() : renderLogin(); } catch { renderLogin(); } })();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => { });
