# Deploying SaanPaw

SaanPaw is three deployable pieces that talk to one API.

| Piece | What it is | Where it can run |
|-------|-----------|------------------|
| **API** (`backend/`) | Node + Express + MongoDB | Any host that runs a container or Node 20, plus a MongoDB database |
| **Developer console** (`web/`) | Static site | Any static host (Netlify, Vercel, Cloudflare Pages, S3, nginx, GitHub Pages) |
| **Mobile app** (`mobile/`) | Expo app | App stores through EAS Build, and optionally a static web export |

The GitHub Pages site is a **demo with no backend**. It is not a deployment of the real system
(see [Demo mode](#demo-mode-github-pages)).

Deploy in this order: API, then the console and app that point at it.

---

## 1. The API

### What it needs

- **MongoDB 4.4+.** MongoDB Atlas is the easy option. Create a database user and allow your API host's address.
- **HTTPS in front of it.** Phones refuse plain `http://` APIs in store builds, and passwords must not cross the network in the clear. Put a reverse proxy or your host's built-in TLS in front.
- **Somewhere to keep photos.** By default, uploaded photos are written to disk (`UPLOAD_DIR`) — mount a persistent volume there, or they disappear on every deploy. On a serverless platform with no disk (Vercel), photos are kept in the database automatically, or in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set; see [Option D](#option-d-vercel-serverless).

### Settings

Set these as environment variables on the host. `backend/.env.example` lists them all.

| Variable | Required | Meaning |
|----------|----------|---------|
| `NODE_ENV` | yes | Set to `production`. Turns on the safety checks below. |
| `MONGODB_URI` | yes | Connection string, e.g. your Atlas URI. |
| `JWT_SECRET` | yes | Random string of 32+ characters. Generate one with `openssl rand -hex 32`. Changing it signs everyone out. |
| `CORS_ORIGINS` | for web | Comma-separated browser origins allowed to call the API, e.g. `https://console.example.com,https://app.example.com`. Native apps do not need it. If empty in production, browser apps are blocked. |
| `TRUST_PROXY` | behind a proxy | Number of proxies in front of the API (usually `1`). Without it every user shares one rate limit. |
| `UPLOAD_DIR` | no | Photo folder, used when `BLOB_READ_WRITE_TOKEN` is not set. Defaults to `uploads`; the Docker image uses `/data/uploads`. |
| `BLOB_READ_WRITE_TOKEN` | no | Stores photos in Vercel Blob. Vercel injects this automatically once Blob storage is enabled for the project — you don't set it by hand. Without it, a Vercel deployment keeps photos in the database. |
| `PORT` | no | Defaults to `4001`. Unused on Vercel. |

In production the API **refuses to start** if `JWT_SECRET` or `MONGODB_URI` is missing, or if the secret is a known placeholder or shorter than 32 characters.

### Option A: Docker Compose (API and database on one machine)

```bash
export JWT_SECRET=$(openssl rand -hex 32)
export CORS_ORIGINS=https://console.example.com
docker compose up --build -d
```

This starts MongoDB and the API on port 4001, with volumes for the database and the photos.

### Option B: the image on a container platform

```bash
docker build -f backend/Dockerfile -t saanpaw-api .     # run from the repository root
```

Run the image with the variables above, mount a volume at `/data/uploads`, and point the platform's health check at `/api/v1/health` (it returns 503 while the database is unreachable).

### Option C: plain Node

```bash
npm ci
npm run build --workspace backend
NODE_ENV=production JWT_SECRET=... MONGODB_URI=... node backend/dist/server.js
```

### Option D: Vercel (serverless)

Vercel functions have no persistent disk, so photos need Vercel Blob instead of `UPLOAD_DIR`, and MongoDB needs a reachable-from-anywhere database (a local `mongodb://localhost` will not work) — this repo is already set up for both: `backend/api/index.ts` wraps the Express app as a serverless function, and `backend/vercel.json` rewrites everything under `/api/*` to it (Vercel's zero-config bracket catch-all routing, e.g. `api/[...path].ts`, did not route nested paths in testing — an explicit rewrite to a plain-named function is what actually works). `backend/src/config/db.ts` caches the MongoDB connection across invocations and `backend/src/services/storage.service.ts` switches to Vercel Blob automatically once `BLOB_READ_WRITE_TOKEN` is present.

1. **Database**: create a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster. Under Network Access, allow `0.0.0.0/0` (Vercel functions have no fixed IP). Under Database Access, create a user. Copy the connection string (Atlas → Connect → Drivers) — that's your `MONGODB_URI`.
2. **Import the project into Vercel**: [vercel.com/new](https://vercel.com/new) → import this GitHub repo. Vercel will offer to create a project — during setup, set:
   - **Root Directory**: `backend`
   - **Framework Preset**: Other
   - It detects the monorepo automatically and installs from the repo root.
3. **Environment variables** (Project Settings → Environment Variables):
   - `NODE_ENV=production`
   - `MONGODB_URI` — from step 1
   - `JWT_SECRET` — output of `openssl rand -hex 32`
   - `CORS_ORIGINS` — the console's Vercel URL, e.g. `https://saanpaw-console.vercel.app` (add it after step 5, then redeploy)
   - `TRUST_PROXY=1`
4. **Photo storage (optional)**: photos work out of the box — without Blob they are stored in your MongoDB database (fine for a few hundred photos on a free Atlas cluster). For object storage instead, go to the project's Storage tab → Create Database → Blob, which adds `BLOB_READ_WRITE_TOKEN` automatically.
5. Deploy. Vercel gives you a URL like `https://saanpaw-api.vercel.app`. The API lives under `https://saanpaw-api.vercel.app/api/v1/...`.

### Create the first admin

There are no accounts on a fresh database. Do **not** run `npm run seed` in production (it refuses to). Create a developer login instead, using the same environment as the running API:

```bash
# in a container
docker compose exec -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='a long passphrase' api \
  node backend/dist/scripts/create-admin.js

# or on a host with the repository
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long passphrase' npm run create-admin:prod --workspace backend

# for Vercel: run it locally, pointed at the same Atlas database (Vercel has no shell access)
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long passphrase' MONGODB_URI='<your Atlas URI>' \
  npm run create-admin:prod --workspace backend
```

The password must be at least 12 characters. Running it again for the same email resets the password.

Shelters and pet owners register from the mobile app. New shelters wait as *pending* until a developer approves them in the console, which issues the shelter's login (shown once).

### After deploying

- `GET /api/v1/health` returns `{"status":"ok","database":true}`.
- Sign-in allows 20 failed attempts per address per 15 minutes; the rest of the API allows 120 requests a minute.
- The API stops cleanly on `SIGTERM`, so rolling deploys do not drop requests.
- Back up the MongoDB database **and** the photos volume. Photos are referenced by the database and are not recoverable from it.

---

## 2. The developer console

It is a static site. Point it at your API when you build it:

```bash
cd web
cp .env.example .env.production      # then edit
# VITE_API_BASE_URL=https://api.example.com/api/v1
npm run build                        # output in web/dist
```

Upload `web/dist` to any static host. Add the site's address to the API's `CORS_ORIGINS`.

- **On a domain root** (`https://console.example.com/`): nothing else to set.
- **Under a subpath** (`https://example.com/console/`): also set `VITE_BASE_PATH=/console/` before building.
- Routing uses the URL hash, so the host needs no rewrite rules.

**On Vercel**: import the repo as a second Vercel project (or add it during the same import as the API) with **Root Directory** `web` and framework **Vite** (auto-detected — build command and output directory need no changes). Set `VITE_API_BASE_URL` to `https://<your-api-project>.vercel.app/api/v1` as an environment variable, then deploy. Once you have this URL, add it to the API project's `CORS_ORIGINS` and redeploy the API.

---

## 3. The mobile app

### Store builds (iOS and Android)

Uses [EAS Build](https://docs.expo.dev/build/introduction/). You need an Expo account.

1. Edit `mobile/eas.json` and set `EXPO_PUBLIC_API_URL` to your API (`https://api.example.com/api/v1`) in the `preview` and `production` profiles. It must be `https`.
2. From `mobile/`:

   ```bash
   npx eas-cli login
   npx eas-cli build:configure           # first time only: links the project to your account
   npx eas-cli build --profile preview --platform android    # installable APK for testers
   npx eas-cli build --profile production --platform all     # store builds
   npx eas-cli submit --platform all                         # upload to the stores
   ```

3. iOS builds need an Apple Developer account; Android store uploads need a Google Play developer account. EAS can create the signing credentials for you.

The identifiers are `ph.sjdm.saanpaw` on both platforms (`mobile/app.json`). Change them before publishing if your organization needs different ones.

On phones the sign-in token is kept in the OS keychain or keystore, not in plain storage.

### Web export (optional)

```bash
cd mobile
EXPO_PUBLIC_API_URL=https://api.example.com/api/v1 npx expo export -p web
node scripts/fix-web-base.mjs        # makes asset paths relative so it works at any subpath
```

Upload `mobile/dist` to a static host and add its address to `CORS_ORIGINS`.

### Local development on a phone

Leave `EXPO_PUBLIC_API_URL` as `localhost`. When the app is opened from a phone, it automatically aims at the computer running Metro. Your firewall must allow inbound connections on the API port (4001), and the phone must be on the same network.

---

## Demo mode (GitHub Pages)

The Pages workflow (`.github/workflows/deploy-pages.yml`) builds both apps with `EXPO_PUBLIC_DEMO_MODE=1` and `VITE_DEMO_MODE=1`. In demo mode there is no server: sign-in checks the demo accounts in the app itself and everything runs on built-in sample data that resets on refresh. **Never set these flags for a real deployment**, because they bypass the API and its authentication.

---

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and push to `main`: typecheck, build and test the backend, and build the Docker image.

---

## Before you go live

Known limits of this version:

- **Photos are stored on the API's disk** by default, in the database on Vercel, or in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (see [Option D](#option-d-vercel-serverless)). Disk storage is fine for one server; for several servers, or for durability off Vercel, move uploads to object storage (S3, Cloudinary) behind the same `/api/v1/uploads` endpoint.
- **Image matching is a placeholder.** Match scores come from a colour, size and distance heuristic, not a trained model.
- **Push notifications are not delivered yet.** Alerts appear in the app's notification list; nothing is pushed to the lock screen.
- **Nothing removes orphaned photos** when a report is deleted.
