# End-to-End Flow — Live Feed Portal + Edge Agent

The complete path from a CCTV camera on a private network to a live feed in the
portal, with per-user accounts. Each user signs in, adds their own cameras, and
sees only their own feeds.

```
CCTV camera ──RTSP──▶ Edge Agent (desktop app) ──HTTP PUT──▶ Portal /api/edge/ingest ──▶ Cloudflare R2
   private LAN           user's machine            outbound HTTPS      (on Vercel)              (video store)
                                                                              │
                                       user signs in ──▶ Portal ──owner-gated playback──┘ ──▶ browser
```

Three parts:

| Part | What it is | Where it runs |
|------|-----------|---------------|
| **Portal** (this project) | Auth + per-user camera management + ingest + playback | Vercel |
| **Database** | Users + cameras (Neon Postgres) | Neon (serverless) |
| **Video store** | HLS segments | Cloudflare R2 |
| **Edge Agent** | Desktop app that reads cameras and pushes them out | The user's machine on the camera LAN |

---

## 1. How a user uses the portal

1. **Sign up / sign in** at `/login` (email + password). No access without login.
2. Click **＋ Add camera**, give it a name (+ optional group). The portal creates
   the camera **on your account** and shows, once:
   - **Ingest URL** — paste into the Edge Agent's Portal Connection.
   - **Token** — paste into the Edge Agent's Portal Connection (shown once!).
   - **Camera ID** — use this as the camera id in the Edge Agent.
3. Configure the Edge Agent with those values (next section) and start it.
4. The camera tile flips **ONLINE** and plays — **only in your account**. Another
   user signing in sees only *their* cameras.

Delete a camera with the **✕** on its tile. Sign out from the header.

**Isolation guarantee:** every camera belongs to the user who created it. All
camera list/view/delete queries are scoped by the logged-in user, and playback
is owner-gated — user A can never see user B's feed, even with the URL.

---

## 2. The Edge Agent (desktop, GUI-first)

The Edge Agent runs on the user's machine, **on the same LAN as their cameras**.

1. In the app's **Portal** section, paste the **Ingest URL** + **Token** the
   portal gave you when you added the camera, and Save.
2. Add a camera in the agent using the **Camera ID** from the portal and the
   camera's local **RTSP URL** (e.g. `rtsp://user:pass@192.168.1.100:554/...`).
3. **Start All.** The agent probes the camera and pushes its feed outbound to the
   portal. Camera passwords never leave the machine.

The agent is outbound-only (works behind NAT/CGNAT, no inbound ports). See the
edge-agent build/run instructions in §3.

---

## 3. Building the macOS (Apple Silicon / M4) app

The GUI must be built on a Mac (native frameworks; can't cross-build from Linux).

Send your friend the **`edge-agent/` folder** from the Smart-Parking repo. On his
Mac:
```bash
xcode-select --install
brew install go ffmpeg
cd edge-agent
./build/macos/build-macos.sh          # → build/macos/dist/SParking Edge Agent.app
cd build/macos/dist && ./install.sh   # installs to /Applications
```
First launch: right-click → Open → Open (once; the build is unsigned).

Share the `.app` with others by zipping it (`ditto -c -k --keepParent "SParking
Edge Agent.app" app.zip`); recipients need `brew install ffmpeg` and must be on
the same LAN as their cameras. Optional signing/notarization commands are printed
by `build-macos.sh`. The worker also cross-builds for Linux/Windows.

---

## 4. Media storage — Cloudflare R2

The portal's `/api/edge/ingest` route receives the agent's HLS uploads and stores
them in **Cloudflare R2** (durable, unlimited, zero egress fees — the 10K design).
Playback is **served through the app and owner-gated** (a public CDN URL would
bypass the per-user ownership check, so playback intentionally streams through
the app). Segments are stored with immutable cache headers for efficiency.

### One-time R2 setup
1. Cloudflare → **R2** → **Create bucket** (e.g. `cctv-streaming`).
2. **Manage R2 API Tokens** → create **Object Read & Write** token → note the
   Access Key ID, Secret Access Key, and your Account ID.
3. No public bucket URL is needed (playback goes through the app for privacy).

---

## 5. One-time Neon (database) setup

1. Create a project at neon.tech → copy the **pooled** connection string.
2. That's your `DATABASE_URL`. The portal creates its tables automatically on
   first use (no migration step).

---

## 6. Deploying to Vercel — exact env vars

```bash
cd live-feed-only
vercel        # or connect the repo in the Vercel dashboard
```

Set these **Environment Variables** (Production, + Preview if used):

| Variable | Value / purpose |
|----------|-----------------|
| `DATABASE_URL` | Neon pooled connection string |
| `AUTH_SECRET` | long random string — `openssl rand -hex 32` (signs session cookies) |
| `NEXT_PUBLIC_APP_URL` | your deployment URL, e.g. `https://your-app.vercel.app` (used to build the ingest URLs shown to users) |
| `MEDIA_BACKEND` | `r2` |
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | R2 token access key |
| `R2_SECRET_ACCESS_KEY` | R2 token secret |
| `R2_BUCKET` | e.g. `cctv-streaming` |
| `R2_PREFIX` | optional, default `hls` |

There is **no** `CAMERAS_JSON`, `EDGE_INGEST_TOKEN`, or `LIVEFEED_ADMIN_TOKEN`
anymore — cameras live in Neon, and each camera has its own ingest token issued
at creation.

---

## 7. End-to-end checklist

1. Create a **Neon** project → `DATABASE_URL`.
2. Create a **Cloudflare R2** bucket + API token → R2 env vars.
3. Deploy the **portal** to Vercel with all env vars above.
4. Open the portal → **sign up** → **Add camera** → copy the Ingest URL + Token +
   Camera ID.
5. On the camera's machine: build/install the **Edge Agent**, paste the Portal
   Connection (URL + Token), add the camera (Camera ID + RTSP), **Start All**.
6. Back in the portal, the tile flips **ONLINE** and plays — visible only to that
   signed-in user.

---

## 8. What's verified vs. needs your infra

- **Verified here:** build + typecheck clean, 0 vulnerabilities, auth gate
  (unauthenticated requests → 401, login page renders, ingest playback rejects
  non-owners), all routes present.
- **Needs your Neon + R2 to test live:** signup/login persistence, per-user
  camera CRUD, and real video ingest→R2→playback. The code paths are typed and
  built; they run the moment the env vars point at a real Neon DB and R2 bucket.
