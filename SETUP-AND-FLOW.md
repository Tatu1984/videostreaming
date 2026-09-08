# End-to-End Flow — Live Feed Portal + Edge Agent

This is the complete operator guide: the whole path from a CCTV camera on a
private network to a live feed in the portal, plus how to build/share the macOS
Edge Agent and where to host things.

```
CCTV camera ──RTSP──▶ Edge Agent (Mac app) ──HTTP PUT──▶ Ingest (media host) ──HTTP GET──▶ Portal (browser)
   private LAN            friend's MacBook        outbound HTTPS       real disk / storage      Vercel etc.
```

There are three moving parts, hosted in three different places:

| Part | What it is | Where it runs |
|------|-----------|---------------|
| **Portal** (this project) | The web UI + camera registry API | A web host (Vercel, or a VM) |
| **Ingest / media** | Receives the agent's HLS PUTs, stores & serves segments | A host **with a real disk** (NOT Vercel's ephemeral FS) — see §4 |
| **Edge Agent** | Desktop app that reads cameras and pushes them out | The customer's Mac/PC on the camera LAN |

---

## 1. Adding a camera **in the portal**

The portal has an "＋ Add camera" button (top-right).

1. Click **＋ Add camera**.
2. Fill in:
   - **Camera ID** — stable id, e.g. `cam-001` (should match the Edge Agent's camera id / stream key).
   - **Name** — friendly label.
   - **Group** — optional (for filtering).
   - **HLS URL** — the credential-free playlist the ingest serves, e.g.
     `https://<your-ingest-host>/api/edge/ingest/cam-001/index.m3u8`
   - **Admin token** — only if the deployment set `LIVEFEED_ADMIN_TOKEN` (below).
3. Save. The camera appears in the grid; it shows **OFFLINE** until the Edge
   Agent actually starts pushing that stream, then flips **ONLINE** and plays.

Remove a camera with the **✕** on its tile.

**Auth model:** viewing the portal needs no login (by design — the AI dev just
opens it). *Adding/removing* is a write, so it's gated by an optional admin
token. Set `LIVEFEED_ADMIN_TOKEN` on the deployment and the Add form will ask
for it once (remembered in the browser). If you don't set it, anyone with the
URL can edit the list — only do that for a private/internal URL.

You can also register cameras without the UI:
- `POST /api/admin/cameras` (curl) — see the portal README.
- `CAMERAS_JSON` env var — the whole registry as JSON (best for serverless).

---

## 2. The Edge Agent — GUI-first, portal-agnostic

The Edge Agent is a **desktop app**. The operator:

1. **Links it to a portal ONCE** — in the app's **Portal** section, paste:
   - **Ingest URL** — where video is PUT (your ingest host, §4).
   - **Token** — the portal's ingest token.
   Click **Save connection**.
2. **Adds cameras** — each with a stable **Camera ID** and the camera's local
   **RTSP URL**. Cameras inherit the Portal Connection, so you don't repeat the
   URL/token per camera (you *can* override per camera if needed).
3. **Start All** — the agent probes each camera and pushes its feed outbound to
   the linked portal.

To point the agent at a **different portal**, just paste that portal's URL +
token in the Portal section and save. Nothing else changes — the agent starts
feeding the new portal. The camera passwords never leave the Mac; only
credential-free HLS reaches the portal/browser.

---

## 3. Building the macOS (Apple Silicon / M4) app — for your friend

The desktop GUI uses native macOS frameworks, so **it must be built on a Mac**
(it can't be cross-built from Linux). Your friend does this once and can then
share the resulting `.app` with others.

### Files to send your friend
Send the **entire `edge-agent/` folder** from the Smart-Parking repo (it's ~13
MB; it's the Go source the build compiles). The relevant build kit inside it:
- `build/macos/build-macos.sh` — the build script
- `build/macos/install.sh` — installs the `.app` to /Applications
- `build/macos/README.txt` — end-user instructions

### What your friend runs (on his M4 Mac)
```bash
# one-time prerequisites
xcode-select --install                 # Apple build tools
brew install go ffmpeg                  # Go 1.22+ and FFmpeg

# build the app (from inside the edge-agent/ folder)
cd edge-agent
./build/macos/build-macos.sh
```
This produces **`build/macos/dist/SParking Edge Agent.app`** — a double-clickable
app bundling both the GUI and the background worker, built for `arm64` (M4).

### Installing / running
```bash
cd build/macos/dist
./install.sh          # copies the .app to /Applications
```
First launch: right-click the app → **Open** → **Open** (once), because the
build isn't signed with an Apple Developer ID. Then follow the app's on-screen
flow (Portal Connection → Add camera → Start All).

### Sharing the app with OTHER people
Your friend can zip and send `SParking Edge Agent.app`:
```bash
cd build/macos/dist
ditto -c -k --keepParent "SParking Edge Agent.app" SParkingEdgeAgent.zip
```
Recipients still need **FFmpeg** (`brew install ffmpeg`) and the right-click →
Open step. For a smoother share (no Gatekeeper warning), sign + notarize with an
Apple Developer ID — the commands are printed at the end of `build-macos.sh`.
That's optional and needs a paid Apple Developer account.

> Note: every recipient's Mac must be **on the same local network as their
> cameras** — that's the whole point of the edge agent (it reaches the private
> cameras and pushes outbound; the cloud never reaches into their network).

---

## 4. Media architecture — Vercel + Cloudflare R2 (built in)

The portal **includes the ingest** at `/api/edge/ingest/[...path]`. It receives
the Edge Agent's HLS uploads and stores them in a **media store**. Vercel's own
filesystem is ephemeral, so at scale the store is **Cloudflare R2** (S3-
compatible object storage — durable, effectively unlimited, **zero egress
fees**, CDN-frontable). This is the 10K design and it is implemented.

```
Edge Agent ──PUT (Bearer)──▶ Vercel: /api/edge/ingest ──▶ Cloudflare R2 ──▶ CDN ──▶ browser GET
```

- **Ingest (write):** the agent PUTs `index.m3u8` + `.ts` to the portal's ingest
  route with a Bearer token (`EDGE_INGEST_TOKEN`). The route writes them to R2
  with correct content-types and cache headers (playlists no-cache, segments
  immutable — so a CDN serves the fan-out and R2 stays cool).
- **Playback (read):** the browser GETs `/api/edge/ingest/<key>/index.m3u8`.
  When `R2_PUBLIC_BASE` (a CDN/public bucket URL) is set, the route **redirects
  the browser straight to the CDN** — segment bytes never pass through the
  serverless function, which is what makes many viewers cheap and fast.

**Why this scales to 10K:** R2 handles massive parallel writes; the CDN absorbs
read fan-out; the Vercel function only handles small control traffic (auth +
redirects), not video bytes. There is no single disk or box in the hot path.

**Backend switch** — `MEDIA_BACKEND`:
- `r2` → Cloudflare R2 (production / scale / Vercel).
- `fs` (default) → local disk, for `npm run dev` or a single VM. Same code path;
  just a different store.

**The Edge Agent is unchanged and backend-agnostic** — it always does outbound
HTTP PUT to whatever Ingest URL + token you paste into its Portal Connection.

### One-time Cloudflare R2 setup
1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `live-feed-hls`).
2. **Manage R2 API Tokens** → create a token with **Object Read & Write** on
   that bucket. Note the **Access Key ID**, **Secret Access Key**, and your
   **Account ID**.
3. **Public access / CDN** (recommended): enable the bucket's public `r2.dev`
   URL, or (better) connect a **custom domain** to the bucket. That URL is your
   `R2_PUBLIC_BASE`. With a custom domain you also get Cloudflare's CDN in front
   for free — the ideal setup for many viewers.

---

## 5. Deploying to Vercel — the exact steps

**The portal + ingest are Vercel-ready** (build passes, CSP production-safe, R2
replaces the ephemeral filesystem). Deploy:

```bash
cd live-feed-only
vercel            # or connect the repo in the Vercel dashboard, then deploy
```

Set these **Environment Variables** in the Vercel project (Settings → Environment
Variables), for Production (and Preview if you use it):

| Variable | Value / purpose |
|----------|-----------------|
| `MEDIA_BACKEND` | `r2` |
| `EDGE_INGEST_TOKEN` | a strong random string. **Paste the same value into the Edge Agent's Portal Connection "Token".** Guards uploads. |
| `R2_ACCOUNT_ID` | your Cloudflare account id |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | e.g. `live-feed-hls` |
| `R2_PUBLIC_BASE` | your R2 public/CDN base, e.g. `https://media.your-domain.com` (recommended) |
| `R2_PREFIX` | optional, default `hls` |
| `LIVEFEED_ADMIN_TOKEN` | token required to add/remove cameras in the UI. **Set it** on any public deploy. |
| `CAMERAS_JSON` | the camera registry as a JSON array (see below). |

**What the Edge Agent points at:** its Portal Connection **Ingest URL** =
`https://<your-vercel-app>.vercel.app` (or your custom domain), **Token** =
`EDGE_INGEST_TOKEN`. Each camera's id becomes its stream key, so it publishes to
`.../api/edge/ingest/<cameraId>/index.m3u8` automatically.

**What the portal camera list points at:** each camera's `hlsUrl` =
`https://<your-vercel-app>/api/edge/ingest/<cameraId>/index.m3u8` (the portal
serves/redirects that to R2/CDN).

### Camera registry on Vercel
Vercel's FS is ephemeral, so the **Add-camera UI updates only the running
instance** and won't persist across deploys/cold-starts. For a durable list on
Vercel, set **`CAMERAS_JSON`** (the whole registry), e.g.:
```json
[{"id":"cam-001","name":"Front Gate","group":"Site A",
  "hlsUrl":"https://your-app.vercel.app/api/edge/ingest/cam-001/index.m3u8"}]
```
(For a mutable UI-managed registry later, back it with a DB — a small, clean
swap behind the existing store interface. On a VM host the file store persists as
is, so the Add-camera UI works there without `CAMERAS_JSON`.)

So: **portal + ingest → Vercel = yes. Video bytes → Cloudflare R2 (+ CDN).**

---

## 6. Quick end-to-end checklist

1. Stand up an **ingest host** with a disk (§4A) — note its base URL + a token.
2. Deploy the **portal** (Vercel or a VM); set `LIVEFEED_ADMIN_TOKEN`
   (+ `CAMERAS_JSON` on Vercel).
3. Friend **builds + installs** the Mac app (§3), links it to the ingest
   (Portal Connection), adds his camera, clicks Start All.
4. In the portal, **Add camera** with the matching id and the ingest HLS URL.
5. The tile flips **ONLINE** and plays. Done.
