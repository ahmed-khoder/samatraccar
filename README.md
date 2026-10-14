<div align="center">

# Tracar

**Fleet intelligence dashboard for [Traccar](https://github.com/traccar/traccar)**
Live tracking · trip replay · analytics computed from raw GPS tracks · a full reports centre

Arabic (RTL) & English · Dark & light themes · Responsive · Self-hosted with Docker

[English](README.md) · [العربية](README.ar.md)

</div>

---

## What is it?

Tracar is a web front-end built with **Next.js 16 / React 19** that sits on top of an existing Traccar server.
It does not replace Traccar — your devices keep reporting to Traccar, and Tracar reads everything through the
Traccar REST API and gives you a modern UI for operations and management:

| Area | What you get |
|---|---|
| **Live map** | Open-source maps (OpenStreetMap), vehicles glide smoothly between GPS fixes, heading arrow, movement trails, labels, geofences, fullscreen, dark/light/satellite/topographic styles. |
| **Vehicle customization** | 22 vehicle types (car, pickup, van, truck, **container truck – top view**, bus, motorcycle, tractor, boat, plane, …) and map colours, saved on the Traccar device. |
| **Analytics** | Distance, driving / idling / stopped time, trips & stops, speed bands, overspeed, harsh braking/acceleration, driving score, fleet utilization. |
| **Trip replay** | Speed-coloured route, play / pause / speed control, heat-map, speed / altitude / battery charts. |
| **Reports centre** | Overview with auto-generated insights, per-vehicle summary, daily report + heat-map, trips, stops, driving behaviour, events. Multi-vehicle selection, custom date ranges (up to 92 days), **vehicle-vs-vehicle** and **period-vs-previous-period** comparison, CSV export, print / PDF. |
| **Alerts & events** | Ignition, movement, geofence and alarm events, filterable and localized. |
| **UX** | Arabic/English with full RTL, dark/light/system theme, collapsible & movable menus (start / end / top / bottom, compact-on-hover or always-open), phone / tablet / desktop layouts, PWA manifest. |

> **Why compute analytics ourselves?** On many Traccar installs the odometer-based `summary` / `trips` values are
> unreliable (resetting odometers give negative distances, `maxSpeed` can be `0`). Tracar recomputes everything from
> the raw GPS positions (`/api/reports/route`) so the numbers match what the vehicles actually did.

## Requirements

* A running **Traccar** server (tested against Traccar 6.0) reachable from where Tracar runs.
* A Traccar user account (email + password). Tracar stores **no credentials** — see [Security](#security).
* Either **Docker** (recommended) or **Node.js ≥ 20.9** for local development.

## Quick start (Docker)

```bash
git clone <your-repo-url> tracar && cd tracar
cp .env.example .env
nano .env                      # set TRACCAR_URL=https://your-traccar-server
docker compose up -d --build   # → http://<server-ip>:3000
```

Sign in with your Traccar email and password.

> Opening the app over plain `http://` (before you have a domain/HTTPS)? Add `COOKIE_SECURE=false` to `.env`,
> otherwise the browser will not keep the session cookie. Remove it once you are behind HTTPS.

Useful commands:

```bash
docker compose logs -f tracar     # logs
docker compose up -d --build      # update after pulling new code
docker compose down               # stop (cache volume is kept)
```

## Quick start (development)

```bash
cp .env.example .env.local        # set TRACCAR_URL
npm install
npm run dev                       # http://localhost:3000
```

Other scripts: `npm run build` · `npm start` · `npm run lint`.

To open the dev server from a phone / another PC on your LAN just browse to `http://<your-ip>:3000`
(private ranges are allowed in `next.config.ts`).

## Configuration

All configuration is through environment variables.

| Variable | Required | Default | Description |
|---|:--:|---|---|
| `TRACCAR_URL` | ✅ | – | Base URL of your Traccar server, no trailing slash. Read at request time, so one image works for any server. |
| `COOKIE_SECURE` | – | `true` in production | Set to `false` only when testing over plain HTTP. Must stay `true` behind HTTPS. |
| `CACHE_DIR` | – | `./.cache` (`/data` in Docker) | Where the analytics and address caches are stored. Mounted as a volume in `docker-compose.yml`. |
| `PORT` / `HOSTNAME` | – | `3000` / `0.0.0.0` (Docker) | Standard Next.js server settings. |

User preferences (theme, menu positions, default map style, overspeed limit, address lookup) are stored in the
browser and a small cookie — they are per device, not per Traccar account. They can be changed in **Settings**.

## Deploy behind Nginx Proxy Manager (domain + HTTPS)

1. Make sure the DNS record of your domain (e.g. `tracar.example.com`) points to the server running NPM.
2. Start Tracar (`docker compose up -d --build`). Either
   * keep the `ports: "3000:3000"` mapping and forward to `server-ip:3000`, **or**
   * put Tracar on the same Docker network as NPM (uncomment the `networks` blocks in `docker-compose.yml`,
     remove the `ports` mapping) and forward to the container name `tracar` on port `3000`.
3. In NPM: **Hosts → Proxy Hosts → Add Proxy Host**
   * *Domain Names*: `tracar.example.com`
   * *Scheme*: `http` · *Forward Hostname / IP*: `tracar` (or the server IP) · *Forward Port*: `3000`
   * Enable **Block Common Exploits** and **Websockets Support**
4. **SSL** tab → *Request a new SSL certificate* (Let's Encrypt) → enable **Force SSL** and **HTTP/2**.
5. Leave `COOKIE_SECURE` unset. Open `https://tracar.example.com` and sign in.

Long reports are fetched in short (≤ 7 day) requests, so the default proxy timeouts are sufficient.

## Architecture

```
Browser ──► Next.js (Tracar) ──► Traccar REST API
            │  • login: email+password → Traccar session → 30-day token
            │    stored in an httpOnly cookie (never exposed to JS)
            │  • /api/t/*        authenticated proxy to Traccar (read-only + device edit + commands)
            │  • /api/analytics  server-side analytics engine + disk cache
            └  • /api/geocode    optional reverse geocoding via OpenStreetMap Nominatim
```

* **Live data** is polled every 3 s through the proxy; the map interpolates between fixes so motion looks continuous.
* **Analytics engine** (`lib/analytics.ts`): pulls the raw route per vehicle per day, then computes distance (haversine with
  spike filtering), driving / idling / stopped time, trips & stops (≥ 3 min stop), speed bands, overspeed episodes,
  harsh braking / acceleration (≥ 8 km/h per second) and a driving score. Finished days are cached on disk
  (`CACHE_DIR/analytics.json`); today is recomputed every ~45 s.
* **Driving score** = `100 − overspeed share × 60 − min(harsh events per 100 km × 3, 40)`, clamped to 0–100.
  The overspeed limit is configurable in Settings.
* **Reports** split long ranges into 7-day chunks fetched in parallel with a progress bar, then aggregate client-side.

### Project layout

```
app/
  (app)/live          live map + vehicle list
  (app)/dashboard     fleet analytics
  (app)/devices       vehicle grid and per-vehicle page (replay, charts, trips)
  (app)/reports       reports centre
  (app)/events        alerts & events
  (app)/settings      theme, layout, map, analytics, address lookup
  api/                auth, Traccar proxy, analytics, geocode
components/           MapView, Shell, DeviceEditor, report tabs, shared UI
lib/                  analytics engine, API hooks, i18n dictionary, preferences, formatting
```

## Security

* **No credentials in the code or the image.** Users sign in with their own Traccar account; Tracar exchanges it for a
  Traccar token and keeps only that token, in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production).
* The proxy (`/api/t/*`) only allows `GET`, `POST commands/send` and `PUT devices/{id}` — nothing else
  (no users, no deletes, no server settings). Every call is made with the signed-in user's own permissions, so
  Traccar's access control still applies.
* **Sending device commands (e.g. engine cut-off) is exposed by the proxy but has no UI** on purpose.
* **Address lookup via OpenStreetMap is opt-in** (Settings → Addresses). When enabled, stop coordinates are sent to the
  public Nominatim service (cached, rate-limited to 1 request/second). The default asks your Traccar server instead.
* Map tiles are loaded from OpenStreetMap / Esri / OpenTopoMap, which reveals the viewed area to those providers.
  Review their usage policies for production traffic, or swap the tile URLs in `components/MapView.tsx`
  for your own tile server.
* Keep `.env` out of git (it is already in `.gitignore`).

## Known limitations

* Live updates are polled (3 s), not pushed over WebSocket.
* Analytics are calculated per whole day; a trip crossing midnight is split between the two days.
* Devices with a wrong clock (e.g. a fixed +8 h offset, or a GPS date from 2007) are detected and flagged
  ("No GPS fix" / clock-skew notice) but not corrected; times shown are the device's own times.
* No scheduled / e-mailed reports, maintenance or fuel reports yet.
* Preferences are stored per browser, not in the Traccar account.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login works but you are bounced back to the login page | You are on plain HTTP with secure cookies — use HTTPS, or set `COOKIE_SECURE=false` for testing. |
| `TRACCAR_URL is not set` | Create `.env` (Docker) or `.env.local` (dev) from `.env.example`. |
| Reports are empty for old dates | Traccar only has data from when the devices started reporting. |
| "Some days could not be loaded" | The Traccar server dropped a connection; reload — finished days are cached, so only the missing ones are retried. |
| First load of a 30–90 day report is slow | The first run computes each day from raw GPS; afterwards it is served from the cache volume. |
| Dev server shows "Blocked cross-origin request" | Add your host to `allowedDevOrigins` in `next.config.ts` and restart `npm run dev`. |

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Leaflet · Recharts · SWR · lucide-react.
Maps © OpenStreetMap contributors. Built for [Traccar](https://www.traccar.org/) (Apache-2.0).

## License

Choose a license for your repository (e.g. MIT) and add a `LICENSE` file.
