# Live Feed Portal

A clean, fast, **no-authentication** portal for viewing available live camera
feeds — built for AI / computer-vision development (ALPR, OCR, detection). Open
it and see the cameras; click one for a full-size view.

It is a **standalone project**: it has its own camera registry and depends on no
other application's database. It plays the **real** HLS streams produced by the
Edge Agent → cloud ingest path — there is no fake/demo video. Cameras whose feed
is not live simply show as OFFLINE.

## How it fits the live-stream architecture

```
CCTV camera ──RTSP──▶ Edge Agent ──HTTP PUT──▶ Cloud ingest ──HTTP GET──▶ this portal (browser)
                                               (serves HLS: index.m3u8 + .ts)
```

The portal never touches cameras directly. It only ever holds a camera's
**credential-free HLS URL** (e.g. `https://<ingest>/api/edge/ingest/<key>/index.m3u8`)
and plays it with `hls.js`. No RTSP URLs, camera passwords, or ingest tokens ever
reach the browser.

## Quick start

```bash
npm install
cp .env.example .env.local     # optional; defaults work for local dev
npm run dev                    # http://localhost:3000
```

On first run the portal seeds two placeholder cameras (they show OFFLINE until a
real feed exists). Replace them with your real cameras (below).

## Registering cameras

The portal owns its registry. Add cameras any of three ways:

1. **Admin API** (runtime):
   ```bash
   curl -X POST http://localhost:3000/api/admin/cameras \
     -H 'Content-Type: application/json' \
     -d '{"id":"cam-001","name":"Front Gate","group":"Entrance",
          "hlsUrl":"https://ingest.example.com/api/edge/ingest/cam-001/index.m3u8"}'
   ```
   Set `LIVEFEED_ADMIN_TOKEN` to require `Authorization: Bearer <token>` for edits.
2. **Data file**: edit `data/cameras.json` (created on first run).
3. **Env (serverless)**: set `CAMERAS_JSON` to the full array — ideal for Vercel,
   whose filesystem is not persistent.

Each camera: `{ id, name, hlsUrl, group?, note? }`. `hlsUrl` must be a real,
credential-free HLS playlist URL.

## API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/cameras` | none | List cameras + live status (`?status=false` skips probing) |
| GET | `/api/cameras/:id` | none | One camera + live status |
| GET | `/api/admin/cameras` | token* | Full registry (no probing) |
| POST | `/api/admin/cameras` | token* | Add/replace a camera (upsert by id) |
| DELETE | `/api/admin/cameras?id=` | token* | Remove a camera |

\* only when `LIVEFEED_ADMIN_TOKEN` is set. **Viewing is always unauthenticated.**

Public responses expose only `id, name, group, hlsUrl, note, status, available,
checkedAt` — no secrets.

## Playback behavior (handles many cameras / viewers)

- **Lazy play**: a tile streams only when it is on-screen (IntersectionObserver),
  the tab is visible, the camera is live, and global streaming is on.
- **Teardown**: scrolling a tile away, hiding the tab, or a camera going offline
  fully destroys its `hls.js` instance — hidden tiles cost nothing.
- **Pause all**: one toggle stops every stream without leaving the page.
- **Focus view**: click a tile for a full-size single-camera stream.
- **Status polling** pauses while the tab is hidden.

This keeps a wall of cameras from overloading the browser, the ingest, or the
Edge Agent.

## Deploy to Vercel

```bash
vercel
```
Set `CAMERAS_JSON` (and optionally `LIVEFEED_ADMIN_TOKEN`) as Vercel env vars —
Vercel's filesystem is ephemeral, so the env registry is the reliable source
there. The portal is the frontend + a thin API; the **media ingest is separate
infrastructure** (the Edge Agent's cloud ingest), which Vercel does not host.

## Integrating with a live Edge Agent (optional)

The Edge Agent exposes a credential-free `GET /streams` discovery list on its
local control API. A site-local integration can read it and upsert each camera
into this portal's registry (mapping `cameraId` → the camera's HLS URL). See the
Edge Agent's `edge-agent-integration-contract.md`.

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production
- `npm run typecheck` — `tsc --noEmit`
