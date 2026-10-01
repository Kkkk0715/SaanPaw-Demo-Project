# SaanPaw Backend

Node.js + Express + TypeScript API over MongoDB (Mongoose).

## Layout

```
src/
  config/        env loading, DB connection, service-area boundary, constants
  middleware/    authenticate, authorize(role), geoFence, validate(zod), error handler
  models/        Mongoose schemas (see docs/erd.md)
  modules/
    auth/        shared login / token issuance for all three roles
    developer/   Developer Module endpoints
    shelter/     Shelter Admin Module endpoints
    user/        User Module endpoints
  services/      matching, gemini, smartAlert, geolocation, moderation
  routes/        route table mount (/api/v1/...)
  scripts/       seed.ts
  utils/         ApiError, asyncHandler, logger
  app.ts         express app assembly
  server.ts      bootstrap (connect DB, listen)
```

## Endpoint map

| Prefix | Module | Guard |
|--------|--------|-------|
| `/api/v1/auth` | Auth | public |
| `/api/v1/developer` | Developer | `authenticate` + `authorize('developer')` |
| `/api/v1/shelter` | Shelter Admin | `authenticate` + `authorize('shelter_admin')` |
| `/api/v1/user` | User | `authenticate` + `authorize('user')` |

Any request body carrying coordinates additionally passes `geoFence`, which rejects
points outside San Jose Del Monte, Bulacan (Limitation #1).

## Run

```bash
cp .env.example .env
npm install
npm run dev
```
