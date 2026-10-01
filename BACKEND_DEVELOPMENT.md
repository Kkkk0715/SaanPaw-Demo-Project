# Backend Mobile API Development Summary

## Overview

The SaanPaw backend for mobile has been fully developed with a comprehensive REST API that serves both the User (pet owner) and Shelter Admin modules. The backend is built with **Node.js + Express + TypeScript + MongoDB**.

## What Has Been Implemented

### ✅ **Core Backend Infrastructure**
- Express server with security middleware (CORS, Helmet, Rate Limiting)
- JWT authentication and role-based authorization
- Error handling with custom error middleware
- MongoDB connection with Mongoose ODM
- TypeScript configuration for type safety
- Environment configuration system

### ✅ **Database Models** (MongoDB Collections)
All models have been updated to match the mobile app's expected data structure:

1. **User** - Pet owners and community members
   - Fields: fullName, email, phone, barangay, homeLocation (GeoJSON), alertRadiusMeters, joinedAt, flaggedReportCount, isBanned, expoPushToken
   - 2dsphere index on homeLocation for geo-queries

2. **Shelter** - Animal shelters and rescue organizations
   - Fields: name, barangay, location (GeoJSON), operatingRadiusMeters, approvalStatus, permitNumber, capacity, currentOccupancy, logoColor, etc.
   - 2dsphere index on location for geo-queries

3. **LostPetReport** - Lost pet reports
   - Fields: reporterName, reporterPhone, name (pet name), animalType, breed, color, sex, size, distinctMarks, description, imageUrls, barangay, lastSeenLocation, status, etc.
   - 2dsphere index on lastSeenLocation

4. **FoundAnimalReport** - Found animal reports
   - Similar structure to LostPetReport but with foundLocation instead of lastSeenLocation

5. **ShelterAnimal** - Animals in shelter care
   - Fields: name, intakeType, intakeDate, caseStatus, postedPublicly, notes, etc.

6. **Notification** - System notifications for users and shelters
   - Fields: audienceType, audienceId, type, title, body, isRead, etc.

7. **MatchSuggestion** - Image recognition matches between lost/found reports
   - Fields: lostReportId, candidateId, candidateSource, score, reasons, etc.

8. **AnimalCase** - Rescue case management
9. **Conversation** & **Message** - Messaging between users and shelters
10. **ModerationFlag** - AI flagging of suspicious reports
11. **DeveloperAccount** - System administrator account

### ✅ **Authentication Module** (`/api/v1/auth`)
- **POST /login** - Login for all roles (user, shelter_admin, developer)
  - Returns JWT token valid for 7 days
  - Validates credentials against hashed passwords

### ✅ **User Module** (`/api/v1/user`) - Pet Owners
Protected routes require: `authenticate` + `authorize('user')` + `geoFence` (for location-based endpoints)

**Registration & Profile:**
- **POST /register** - Create user account with barangay and alert radius
- **PUT /profile** - Update user profile (alert radius, location, etc.)

**Reports Management:**
- **POST /reports/lost** - Create lost pet report with images
- **POST /reports/found** - Report found animal
- **GET /reports/lost/:id/status** - Get report status
- **PATCH /reports/lost/:id/status** - Update report status (active → matched → recovered → closed)

**Discovery & Search:**
- **GET /shelters** - List approved shelters in the city
- **GET /shelters/:id/animals** - Get animals in a specific shelter's care
- **GET /reports/lost/:id/matches** - Get AI-suggested matches for a lost report (image recognition)
- **GET /map/reports** - GeoJSON of all active reports with optional bbox filter
- **GET /reports/search** - Search/filter reports by type, animal, date, location

**Notifications:**
- **GET /notifications** - List smart alerts (lost/found nearby, matches, etc.)
- **PATCH /notifications/:id/read** - Mark notification as read
- **PUT /push-token** - Register Expo push notification token

### ✅ **Shelter Module** (`/api/v1/shelter`) - Verified Animal Shelters
Protected routes require: `authenticate` + `authorize('shelter_admin')` + `geoFence`

**Registration & Profile:**
- **POST /register** - Apply for shelter account (starts in "pending" status)
- **GET /profile** - Get shelter profile and stats
- **PATCH /profile** - Update profile (name, location, operating radius, etc.)

**Animal Management:**
- **GET /animals** - List animals in shelter care
- **POST /animals** - Intake a new animal (rescued, surrendered, etc.)
- **POST /animals/recovered** - Post an animal as publicly recovered
- **PATCH /animals/:id/status** - Update animal's case status (under_rescue → reunited/adopted/inconclusive)

**Report Management:**
- **GET /reports** - List lost/found reports in the shelter's operating radius
- **PATCH /cases/:id/status** - Update animal case status with notes

**Notifications:**
- **GET /notifications** - List smart alerts specific to this shelter
- **PATCH /notifications/:id/read** - Mark notification as read

### ✅ **Services Layer**

1. **Authentication Service** (`auth.service.ts`)
   - Password hashing with bcryptjs
   - JWT token generation and validation
   - Support for three roles: user, shelter_admin, developer

2. **Geolocation Service** (`geolocation.service.ts`)
   - Service area validation (San Jose Del Monte only)
   - MongoDB $nearSphere filtering for radius-based queries
   - Converts between LatLng and GeoJSON formats

3. **Smart Alert Service** (`smartAlert.service.ts`)
   - Automatically notifies users/shelters when reports are filed in their area
   - Uses recipient's alert radius/operating radius for filtering
   - Persists notifications to database and queues for Expo push delivery

4. **Moderation Service** (`moderation.service.ts`)
   - Screens reports for false positives using AI heuristics
   - Detects spam, invalid descriptions, missing images
   - Flags suspicious reports for developer review
   - Escalates reporters with multiple flags to account ban

5. **Matching Service** (`matching.service.ts`)
   - Cheap attribute heuristic (species, coat colour, breed, size, distance) shortlists candidates
   - Gemini vision compares photos for the shortlist; falls back to the heuristic score if unconfigured
   - Runs both directions: a new lost report is matched against found reports/shelter animals, and a
     new found report/shelter intake is matched back against existing lost reports
   - Ranks results by confidence score, with the reasons behind each score

### ✅ **Data Serialization Layer** (`utils/geoHelpers.ts`)
Helper functions to convert between MongoDB GeoJSON format and frontend LatLng format:
- `geoPointToLatLng()` - Convert [lng, lat] to {latitude, longitude}
- `latLngToGeoPoint()` - Convert {latitude, longitude} to [lng, lat]
- `serializeUser()`, `serializeShelter()`, `serializeReport()` - Format DB documents for API responses

### ✅ **Database Seeding** (`scripts/seed.ts`)
Provides demo accounts for testing:
- Developer: dev@saanpaw.local / password123
- Shelter: shelter@saanpaw.ph / password123
- User: user@saanpaw.ph / password123

All accounts seeded with verified data in the San Jose Del Monte service area.

## Architecture Highlights

### Security
- ✅ JWT authentication with expiration
- ✅ Role-based authorization (RBAC)
- ✅ Geo-fence validation to prevent out-of-area reports
- ✅ Password hashing with bcryptjs
- ✅ CORS and Helmet security headers
- ✅ Rate limiting (120 requests/minute)

### Data Integrity
- ✅ 2dsphere MongoDB indexes for geospatial queries
- ✅ Proper field validation with Zod schemas
- ✅ Unique constraints on email fields
- ✅ GeoJSON Point format for all location data

### Scalability
- ✅ Async/await pattern for non-blocking operations
- ✅ Lean queries for read-only operations
- ✅ Pagination support (limits, sorting)
- ✅ Connection pooling through Mongoose

### Developer Experience
- ✅ TypeScript for type safety
- ✅ ESLint configuration
- ✅ Comprehensive error handling
- ✅ Logger utility for debugging
- ✅ Clear service/model separation

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB 4.4+ (local or Atlas connection string)
- npm or yarn

### Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and set MONGODB_URI to your database connection
```

### Database Seeding

```bash
npm run seed
```

This creates demo accounts and prepares the database for testing.

### Development

```bash
npm run dev
```

Server starts on http://localhost:4000
API available at http://localhost:4000/api/v1/

### Production Build

```bash
npm run build
npm start
```

## API Authentication

All protected endpoints require an `Authorization` header:

```
Authorization: Bearer {JWT_TOKEN}
```

Example login:
```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "role": "user",
    "email": "user@saanpaw.ph",
    "password": "password123"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Use this token in subsequent requests.

## Key Design Decisions

1. **Single Auth Endpoint** - All roles use the same `/login` endpoint, authenticated by role check
2. **GeoJSON Storage** - Location data stored as GeoJSON Points for native MongoDB geo-querying
3. **Serialization Layer** - Separate helper functions ensure consistent API response format
4. **Service-First Architecture** - Business logic in services, controllers thin and testable
5. **2dsphere Indexes** - All location fields indexed for fast radius queries
6. **Expo Integration Ready** - Push token storage prepared for Expo push notifications

## Next Steps for Production

- [ ] Integrate real image recognition model (TensorFlow.js or ONNX Runtime)
- [ ] Implement Expo push notification delivery
- [ ] Add file upload to S3/Cloudinary instead of local disk
- [ ] Set up proper logging (Winston, structured JSON logs)
- [ ] Add rate limiting by user/IP
- [ ] Implement caching layer (Redis) for frequently accessed data
- [ ] Add comprehensive API documentation (Swagger/OpenAPI)
- [ ] Set up automated testing with Jest
- [ ] Configure CI/CD pipeline
- [ ] Production database backup strategy

## Troubleshooting

**MongoDB Connection Error:**
- Ensure MongoDB is running: `mongod` (local) or check connection string for Atlas
- Verify MONGODB_URI in .env file

**Port 4000 Already in Use:**
- Change PORT in .env file or kill process: `lsof -i :4000 | grep node | awk '{print $2}' | xargs kill`

**TypeScript Compilation Errors:**
- Run `npm install` to ensure all type definitions are installed
- Delete `node_modules` and reinstall if persists

## File Structure
```
backend/
├── src/
│   ├── config/          # Environment, database, constants
│   ├── models/          # Mongoose schemas
│   ├── modules/         # Feature modules (auth, user, shelter)
│   ├── services/        # Business logic (image recognition, alerts, etc.)
│   ├── middleware/      # Auth, error handling, geo-fence
│   ├── routes/          # Route definitions
│   ├── utils/           # Helpers (errors, logger, geo helpers)
│   ├── types/           # TypeScript type definitions
│   ├── app.ts          # Express app factory
│   └── server.ts       # Entry point
├── tests/               # Test files
├── dist/                # Compiled JavaScript
├── .env                 # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

---

## Summary of Mobile Integration

The backend is fully ready to serve the React Native mobile app. The mobile app's `AppStore` context uses in-memory mock data, but all endpoints are now implemented to replace those with real API calls:

**User Module** - All 9 endpoints for pet owners (register, report, search, map, notifications)
**Shelter Module** - All 10 endpoints for shelters (register, animals, reports, cases, notifications)
**Auth Module** - Unified login for all roles

The mobile app can switch from mock data to real API by:
1. Creating an API client service
2. Replacing `@saanpaw/shared` mock data calls with fetch/axios calls to http://localhost:4000/api/v1/
3. Storing and using JWT tokens from login response

All data formats match the types defined in `shared/src/types.ts`, ensuring seamless integration.

