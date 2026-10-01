# Data Flow Diagrams (Figures 27-29)

## Figure 27 - DFD Level 0 (Context Diagram)

```mermaid
flowchart LR
    USR[User]
    SA[Shelter Admin]
    DEV[Developer]
    PUSH[Expo Push Service]
    SYS(("0\nSaanPaw System"))

    USR -->|lost/found reports, images, location, searches| SYS
    SYS -->|match suggestions, notifications, map data| USR
    SA -->|shelter registration, animal records, status updates, messages| SYS
    SYS -->|area reports, smart alerts, dashboards| SA
    DEV -->|approvals, moderation actions, system config| SYS
    SYS -->|pending shelters, flagged reports, statistics| DEV
    SYS -->|push payloads| PUSH
    PUSH -->|delivery receipts| SYS
```

## Figure 28 - DFD Level 1

```mermaid
flowchart TD
    USR[User]
    SA[Shelter Admin]
    DEV[Developer]

    P1(("1\nAuthentication &\nAccount Mgmt"))
    P2(("2\nReport\nManagement"))
    P3(("3\nImage Recognition\nMatching"))
    P4(("4\nGeolocation &\nGeo-fence"))
    P5(("5\nSmart Alert\nDispatch"))
    P6(("6\nShelter\nCoordination"))
    P7(("7\nModeration &\nApproval"))

    D1[(D1 users / shelters /\ndeveloperAccounts)]
    D2[(D2 lostPetReports /\nfoundAnimalReports)]
    D3[(D3 matchSuggestions)]
    D4[(D4 animalCases /\nshelterAnimals)]
    D5[(D5 notifications)]
    D6[(D6 conversations /\nmessages)]
    D7[(D7 moderationFlags)]

    USR --> P1 --> D1
    SA --> P1
    DEV --> P1
    USR -->|report + images + coords| P2
    P2 --> P4
    P4 -->|valid SJDM coords| P2
    P2 --> D2
    P2 --> P3
    P3 --> D3
    P3 -->|candidate matches| USR
    P2 --> P5
    P5 --> D5
    P5 -->|alerts within radius| USR
    P5 -->|alerts within radius| SA
    SA --> P6
    P6 --> D4
    P6 --> D6
    USR --> P6
    DEV --> P7
    P7 --> D1
    P7 --> D7
    P2 --> P7
```

## Figure 29 - DFD Level 2 (explodes Process 3 - Image Recognition Matching)

> This diagrams the self-hosted embedding/cosine-similarity pipeline explored in
> `spike/image-recognition/`. It was not adopted - the implemented Process 3 is
> `matching.service.ts`: an attribute heuristic (3.1-3.3 below, unchanged) shortlists
> candidates, then Gemini vision scores the shortlisted photo pairs directly (replacing
> 3.2's embedding extraction and 3.4's cosine step) in both match directions, lost-to-found
> and found/intake-back-to-lost. `D3 imageSignatures` below does not exist; matches persist
> to `matchSuggestions` (`D3` in the Level 1 diagram above).

```mermaid
flowchart TD
    P2[From 2: Report Management\n(new report + image)]
    USR[User]

    P31(("3.1\nPreprocess Image\n(resize, normalize)"))
    P32(("3.2\nExtract Feature\nEmbedding"))
    P33(("3.3\nQuery Candidate Pool\n(opposite type, in radius, active)"))
    P34(("3.4\nScore Similarity\n(cosine)"))
    P35(("3.5\nRank & Return\nTop-N Matches"))

    D2[(lostPetReports /\nfoundAnimalReports)]
    D3[(imageSignatures)]

    P2 --> P31 --> P32
    P32 --> D3
    P32 --> P33
    D2 --> P33
    D3 --> P33
    P33 --> P34 --> P35
    P35 -->|ranked matches + scores| USR
    P35 -->|persist match links| D2
```
