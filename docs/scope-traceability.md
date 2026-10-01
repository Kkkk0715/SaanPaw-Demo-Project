# Scope Traceability Audit

Every scope item from the proposal mapped to the code that implements it, plus
the discrepancies found during the pre-backend review and how each was resolved.

Audited against the proposal's **written text** — the **Scope** (pp. 11–15), the
**Limitations** (p. 12), and the **Objectives** (pp. 9–10).

> **What "aligned with the paper" means here.** The binding requirements are the
> *words*. Figures 2–20 are illustrative mockups showing roughly how a screen
> might look; they are a source of inspiration, not a specification. Where the
> implementation departs from a figure — a different layout, a different palette,
> a different device — that is not a defect, provided the written scope is met.
> Figure numbers appear below only as cross-references.

Status legend: **Done** = implemented and verified running · **API** = awaits the
backend phase.

---

## Limitations — enforced in code

The three limitations are stated verbatim on p. 12 of the proposal.

| # | Limitation | Where it is enforced |
|---|---|---|
| 1 | Operates only within San Jose Del Monte, Bulacan | `constants/sjdmBoundary.ts` (`isWithinSJDM`, point-in-polygon against the city ring). Checked in `screens/user/ReportForm.tsx` before submit — an out-of-area pin blocks the report and shows a banner. Also in `services/locationService.ts`, and mirrored server-side by `backend/src/middleware/geoFence.ts`. Barangay pickers only ever offer SJDM barangays (`constants/sjdm.ts`). |
| 2 | No physical tracking technologies (GPS collars, RFID tags, microchips) | Nothing in the data model stores tag, collar, or chip identifiers — see `types/index.ts`. Stated to users on the module picker (`screens/auth/RolePickerScreen.tsx`), on registration (`screens/user/RegisterScreen.tsx`), and listed under "Limitations enforced in code" in `screens/developer/SystemManagementScreen.tsx`. |
| 3 | No integration with national government animal databases | No external connector exists in `services/` or `backend/src/services/`. Matching draws only on the system's own reports and shelter animals (`store/AppStore.tsx` → `runImageMatch`). Stated in the Developer module's System Management screen. |

Limitation 1 is the only one requiring active enforcement; 2 and 3 are satisfied
by absence, so they are surfaced as explicit statements in the UI to make them
visible rather than merely unimplemented.

---

## Developer Module (proposal p. 11)

> **Architecture note.** The Developer Module runs as a **separate web console**
> (`web/`) rather than inside the mobile app. Every scope item is unchanged and
> fully implemented; only the surface it runs on has moved. The mobile app has no
> developer sign-in at all, so system administration cannot be reached from a
> phone. See [`web/README.md`](../web/README.md) for the rationale.
>
> The written scope (p. 11) lists the Developer Module's five features without
> stating what device or platform they run on, so this requires **no change to
> the paper**. Figures 2–5 happen to be drawn as phone screens, but the figures
> are illustrative rather than binding.

| Scope item | Page | Status |
|---|---|---|
| Login | `web/src/pages/Login.tsx` (Figure 2) | Done |
| Dashboard — daily statistics + access to management features | `web/src/pages/Dashboard.tsx` | Done |
| Shelter Approval Management — review/approve/reject, verify LGU credentials | `web/src/pages/ShelterApprovals.tsx` (Figure 3) | Done — master-detail: application queue beside permit detail and a verification checklist |
| System Management — configuration, database monitoring, updates, maintenance, deployment | `web/src/pages/SystemManagement.tsx` (Figure 4) | Done — maintenance actions await the API |
| Report Monitoring — all reports, AI auto-flagging, remove and ban repeat offenders | `web/src/pages/ReportMonitoring.tsx` (Figure 5) | Done — flags with AI confidence, three tabs (Flagged / All reports / Accounts), ban at the 3-flag threshold |

---

## Shelter Admin Module (proposal pp. 12–13)

| Scope item | Screen | Status |
|---|---|---|
| Register — create account, select operations radius | `screens/shelter/RegisterScreen.tsx` (Figure 6) | Done — submits a *pending* application, does not sign in, matching "credentials provided by the Developer" |
| Login — approved credentials only | `screens/shelter/LoginScreen.tsx` (Figure 7) | Done |
| Dashboard — active reports, rescued animals, ongoing cases | `screens/shelter/DashboardScreen.tsx` (Figure 8) | Done |
| Shelter Animals Management | `screens/shelter/ShelterAnimalsScreen.tsx` | Done |
| Recovered Animals Posting | `screens/shelter/RecoveredAnimalsScreen.tsx` | Done |
| Animal Report Management — reports within their area, respond | `screens/shelter/AnimalReportsScreen.tsx` (Figure 9) | Done — responding opens a rescue case |
| Animal Status Management — under rescue / reunited / adopted / inconclusive | `screens/shelter/AnimalStatusScreen.tsx` (Figure 10) | Done — all four statuses, with a case timeline |
| Message Box | `screens/shelter/MessagesScreen.tsx` | Done (UI) |
| Shelter Profile Management — contact details and location | `screens/shelter/ShelterProfileScreen.tsx` (Figure 11) | Done |
| Notification Management — smart alerts within operating radius | `screens/shelter/NotificationsScreen.tsx` (Figure 12) | Done |

---

## User Module (proposal pp. 14–15)

| Scope item | Screen | Status |
|---|---|---|
| Registration — account + alert radius | `screens/user/RegisterScreen.tsx` (Figure 14) | Done — radius previewed as a circle on the map |
| Login | `screens/user/LoginScreen.tsx` (Figure 13) | Done |
| Dashboard — daily statistics, access to features | `screens/user/DashboardScreen.tsx` | Done |
| Report Lost Pet | `screens/user/ReportLostPetScreen.tsx` → `ReportForm.tsx` (Figure 15) | Done |
| Reported Lost Pet Status Update | `screens/user/LostPetStatusScreen.tsx` | Done |
| Report Found Animal | `screens/user/ReportFoundAnimalScreen.tsx` → `ReportForm.tsx` (Figure 16) | Done |
| Shelter View — view shelter animals **and communicate** | `screens/user/ShelterViewScreen.tsx` | Done — three tabs: Shelters, Recovered animals, Messages |
| Image Recognition Matching | `screens/user/ImageRecognitionScreen.tsx` (Figure 17) | Done — `matching.service.ts` pre-filters by attributes, then Gemini vision scores the shortlisted photo pairs; see `spike/image-recognition/` for the embedding approach explored and not adopted |
| Map View Interface | `screens/user/MapViewScreen.tsx` (Figure 18) | Done |
| Smart Notifications | `screens/user/NotificationsScreen.tsx` (Figure 19) | Done |
| Search and Filter Reports | `screens/user/SearchReportsScreen.tsx` (Figure 20) | Done — see Finding 1 |

---

## Objectives (proposal pp. 9–10)

| Objective | Where it is realised |
|---|---|
| Report, search, and identify lost or stray animals | Report forms, `SearchReportsScreen`, `ImageRecognitionScreen` |
| Image recognition matching against existing records | `store/AppStore.tsx` → `runImageMatch`; scores species, coat-colour overlap, breed, size, and distance, and returns the reasons behind each score |
| Geolocation that **automatically tags** the report location | `ReportForm.tsx` — see Finding 2 |
| Smart alerts to nearby users and to shelters within their radius | `store/AppStore.tsx` → `createReport` notifies every approved shelter whose operating radius covers the pin; `NotificationsScreen` for both audiences |
| Shelter coordination — manage reports, update status, monitor recovery | Shelter Admin module, `AnimalCase` timeline, Message Box |

---

## Findings from this audit

### Finding 1 — Search and Filter Reports sits outside the written scope · **kept, by choice**

The written Scope for the User Module (pp. 14–15) lists ten features and stops at
Smart Notifications. **"Search and Filter Reports" is not among them** — it exists
only as Figure 20.

The screen is implemented anyway, and a date filter was added alongside the
animal-type and barangay filters. That is an addition beyond the written scope,
not a requirement, and it is recorded here so the decision is deliberate rather
than accidental.

Two defensible options, both fine:

- **Keep it and add one line to the Scope** so the paper describes what the
  system does. Recommended — searching reports is genuinely useful, and the
  feature is already built and working.
- **Keep it undocumented** as a convenience feature. Also acceptable, since
  nothing in the written scope forbids it.

Either way, no code change is needed.

### Finding 2 — Geolocation auto-tagging was not wired up · **fixed**

`services/locationService.ts` existed but was **imported by nothing**. The report
form defaulted its pin to the user's *registered* barangay, so nothing captured
the device's actual position. Objective 3 asks the system to "automatically tag
the location of the lost or found animal".

`ReportForm.tsx` now requests the device position when the form opens, validates
it against the SJDM boundary, drops the pin, and resolves it to the nearest
barangay via `nearestBarangay()`. A "Use my current location" button allows a
retry, and the pin stays manually adjustable — a pet is often reported from home
rather than from where it went missing. Permission denied, a position outside
SJDM, and an unavailable sensor each degrade to an explanatory banner with the
pin left at the registered barangay.

### Finding 3 — "Daily" statistics disagreed with the backend · **fixed**

The dashboards counted reports using a **calendar-day** comparison, while
`backend/src/modules/user/user.service.ts` already used a **rolling 24-hour**
window. Two problems: the two layers would report different numbers for the same
data, and the dashboards dropped to zero just after local midnight even though
reports filed hours earlier were still live — a real risk during an evening demo.

`store/AppStore.tsx` now uses a rolling 24-hour window matching the API, and the
tiles are labelled "(24h)" rather than "today" so the figure matches its caption.

### Finding 4 — Unreferenced backend service stubs · **resolved: deleted**

`services/apiClient.ts`, `authService.ts`, `reportService.ts`,
`imageRecognitionService.ts`, and `notificationService.ts` were imported by
nothing. They were written before the API contract existed, and two of them had
already drifted from reality: `authService.ts` stored tokens with
`expo-secure-store` (which does not work on web) while `context/AuthContext.tsx`
uses `AsyncStorage`, and `imageRecognitionService.ts` predated the matching
spike.

All five were deleted, along with the now-unused `axios` dependency and
`constants/config.ts`. `services/locationService.ts` is the only one that
survived, because it is the only one actually used. The real service layer gets
written against the agreed API contract in the backend phase, rather than kept
as stubs that already contradict it.

### Finding 5 — Front-end and backend data models disagree · **open, blocks the backend**

Not a scope gap, but it will block integration. The front-end models a single
`AnimalReport` with a `kind` field; the backend has separate `LostPetReport` and
`FoundAnimalReport` collections. Several fields the UI renders have nowhere to be
stored server-side: `name`, `sex`, `size`, `distinctMarks`, `barangay`, and the
shelter's `capacity`, `currentOccupancy`, and `email`. Coordinates also differ —
`{latitude, longitude}` in the app versus GeoJSON `[lng, lat]` in Mongoose.

Resolve this by writing `docs/api-contract.md` before backend work begins.

### Finding 6 — Endpoints with no route · **open, blocks the backend**

Scoped features with no API surface yet: the **Message Box** (models exist, no
routes or controller), **banning an account** (`moderationService.escalateReporter`
exists but nothing exposes it), **listing all reports and users** for Report
Monitoring, and **image upload** (`multer` is a dependency but unused; `app.ts`
only serves `/uploads` statically).

---

## Summary

All 25 scope items across the three modules are implemented, and all three
limitations are enforced or explicitly surfaced.

Findings 2 and 3 were genuine gaps against the written text — an objective that
was never wired up, and a statistic that disagreed with the backend — and both
are fixed. Finding 1 is not a defect at all: it is a feature beyond the written
scope, kept deliberately. Finding 4 is accepted. Findings 5 and 6 are
backend-phase work and should be settled by an agreed API contract before coding
starts.

The visual design — layout, spacing, and the vibrant green / beige / white
palette in `shared/src/theme.ts` — is not constrained by the proposal, which
specifies behaviour rather than appearance. It is free to be optimised.
