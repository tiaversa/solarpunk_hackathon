# API Contracts

All keys are **camelCase** (Prisma default, no extra mapping needed).
The frontend never calls `fetch()` directly — every endpoint has a matching
function in `/lib/api-client.ts`. This indirection is what makes the offline
support in Step 10 a drop-in change.

If a shape changes, update this file in the same commit as the code.

---

## Auth / session

### `GET /api/session`
Returns the current logged-in user (or 401 if no session).
```json
{
  "user": {
    "id": "uuid",
    "email": "string",
    "city": "string | null",
    "interests": ["string"],
    "preferredDuration": "short | medium | long | null"
  }
}
```

---

## Progress

### `GET /api/progress`
All `Progress` rows for the current user.
```json
[
  {
    "topic": "cooking",
    "currentLevel": 3,
    "completedLevels": [1, 2]
  }
]
```

### `POST /api/progress`
Start tracking a new topic. Idempotent — if a row already exists, return it.

**Request**
```json
{ "topic": "cooking" }
```

**Response**
```json
{ "topic": "cooking", "currentLevel": 1, "completedLevels": [] }
```

---

## Mission generation & lifecycle

### `GET /api/mission?topic=X&level=N`
Returns the 3 mission options for `(user, topic, level)`. If an active
`AiGeneration` row exists for that triple, it is reused (no Claude call).

```json
{
  "aiGenerationId": "uuid",
  "options": [
    { "title": "string", "brief": "string", "tip": "string", "duration": "short | medium | long" },
    { "title": "string", "brief": "string", "tip": "string", "duration": "short | medium | long" },
    { "title": "string", "brief": "string", "tip": "string", "duration": "short | medium | long" }
  ]
}
```

### `POST /api/mission/choose`
Pick one of the 3 options. Upserts the active `MissionChoice` row.

**Request**
```json
{
  "topic": "cooking",
  "level": 1,
  "aiGenerationId": "uuid",
  "chosenIndex": 0
}
```

**Response**
```json
{ "missionChoiceId": "uuid", "status": "active" }
```

### `POST /api/mission/complete`
Mark the active mission complete, advance `Progress.currentLevel`, optionally
attach a note and photo.

**Request**
```json
{
  "topic": "cooking",
  "level": 1,
  "aiGenerationId": "uuid",
  "chosenIndex": 0,
  "note": "string (optional)",
  "photoBase64": "string (optional, data: URI or raw base64)"
}
```

**Response**
```json
{
  "progress": {
    "topic": "cooking",
    "currentLevel": 2,
    "completedLevels": [1]
  }
}
```

### `POST /api/mission/regenerate`
Throw away the current 3 options for `(topic, level)` and ask Claude for a
new set. Marks the old `AiGeneration` as `regenerated` and any active
`MissionChoice` as `abandoned`.

**Request**
```json
{ "topic": "cooking", "level": 1 }
```

**Response**
```json
{
  "aiGenerationId": "uuid",
  "options": [
    { "title": "string", "brief": "string", "tip": "string", "duration": "short | medium | long" }
  ]
}
```

---

## Topic management

### `POST /api/topic/reset`
Reset progress on a topic to level 1, `completedLevels = []`. Completion
history is preserved.

**Request**
```json
{ "topic": "cooking" }
```

**Response**
```json
{
  "progress": {
    "topic": "cooking",
    "currentLevel": 1,
    "completedLevels": []
  }
}
```

---

## User preferences

### `PATCH /api/user/preferences`
Update interests and/or preferred mission duration.

**Request** (all fields optional)
```json
{
  "interests": ["foraging", "fermentation"],
  "preferredDuration": "medium"
}
```

**Response**
```json
{
  "user": {
    "id": "uuid",
    "email": "string",
    "city": "string | null",
    "interests": ["string"],
    "preferredDuration": "short | medium | long | null"
  }
}
```

---

## History (Step 11)

### `GET /api/history`
Every completed mission for the current user, newest first, with the
chosen mission's title and brief materialised from the originating
`AiGeneration.parsedOptions`.

**Response**
```json
{
  "items": [
    {
      "id": "uuid",
      "topic": "cooking | gardening | … (TopicId)",
      "level": 1,
      "title": "string | null",
      "brief": "string | null",
      "duration": "short | medium | long | null",
      "note": "string | null",
      "photoUrl": "string | null",
      "completedAt": "ISO-8601 string"
    }
  ],
  "totalsByTopic": { "cooking": 3, "gardening": 1 }
}
```
