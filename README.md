# ArieAI Fitness Log

Multi-user fitness logging app with:
- Google + email/password authentication
- One daily log per user/date (editable)
- Optional photo uploads (0..many)
- Calories eaten + exercise calories burned (manual entries)
- Maintenance calorie estimate via Mifflin-St Jeor
- Goal selector: bulk, lean bulk, dirty bulk, maintenance, cut, super cut
- Audit trail for create/update/delete actions
- Starter trend charts for weight and calories

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

3. Run the app:

```bash
npm run dev
```

## Firebase Requirements

Enable Authentication providers:
- Google
- Email/Password

Create Firestore + Storage and add rules for user-isolated access.

### Suggested Firestore structure

- `users/{uid}/profile/main`
	- `sex`, `age`, `defaultWeightUnit`, `updatedAt`
- `users/{uid}/dailyLogs/{yyyy-mm-dd}`
	- all daily log columns: weight, calories, exercises, photos, goal, maintenance, etc.
- `users/{uid}/auditTrail/{auditId}`
	- `action` (`create|update|delete`), `logDate`, `timestamp`, `before`, `after`

## Notes

- Height is fixed at 6'2" (188 cm) per current requirement.
- Activity level is both user-selectable and auto-suggested from recent exercise history.
- Photos are optional and validated client-side up to 20MB each.
