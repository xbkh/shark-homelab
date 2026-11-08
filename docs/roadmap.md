# Roadmap

## Done

- Dashboard, services, containers, VPN, cloud and streaming pages.
- Black and yellow design system with inline icons and self-hosted fonts.
- Push alerts through ntfy and a Healthchecks.io heartbeat.
- Container log viewer and backup status page.

## Next

- **Browser desktop**: embed a Moonlight web client so the host desktop opens inside Shark.
- **Cloud backup**: scheduled copy of Nextcloud and Immich data to a second disk (the Cloud page already shows the status of the workstation backups).
- **HTTPS**: put Shark behind a TLS proxy (Caddy with an internal CA) so the service worker and offline mode work.
- **API integrations**: Nextcloud and Immich usage (storage, photo counts) using their API keys.
- **Persistent history**: store samples in SQLite to keep weeks of graphs.
- **Internationalisation**: English and French UI.

## Considered and rejected

- **Native iOS app (IPA)**: building requires macOS and Xcode, and installing without a paid Apple developer account expires every 7 days. The PWA covers the need for free.
- **Custom VPN or cloud implementation**: NetBird (WireGuard) and Nextcloud/Immich are mature and audited; Shark wraps them instead of replacing them.
