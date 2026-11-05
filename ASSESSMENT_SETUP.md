# TalentLens assessment workflow — configuration

## Stable test ID mapping (names are display-only)

Edit `config/hackerrank-test-catalog.json` after creating and publishing each HackerRank test. Put the exact HackerRank test ID in `testId`. Do not use the test title as the key: a test may be renamed without changing the mapping.

The catalog has 12 slots:
- For candidates with 0–5 years: B1, B2, B3 (Beginner) and I1, I2, I3 (Intermediate).
- For candidates with more than 5 and up to 10 years: B1, B2, B3 and I1, I2, I3.

Each code must map to one distinct test ID per band. The app ignores empty `testId` placeholders. Only mapped, published tests from the candidate's experience band appear in the optional dropdown; the recruiter chooses which test to trigger. The UI displays the current test name from HackerRank, but level and band come from this stable ID map.

The Chakra invite remains locked until all six codes for the candidate's band are mapped and have a confirmed real Passed outcome. A missing/ambiguous result is not treated as a pass. Two confirmed failures of the same test produce an escalation and block another invite for that test.

## Start from clean assessment history

1. Stop the app.
2. Back up `talentlens_demo` in pgAdmin.
3. In pgAdmin, open Query Tool with `talentlens_demo` selected, run `scripts/reset-assessment-history.sql`, and verify both counts are zero.
4. This clears local `hackerrank_exams` and `chakra_interviews` rows only. It does not delete employees, mentors, attendance, mock interviews, users, or cancel invitations already sent in HackerRank/Chakra.
5. Restart the app after the reset.

## Apply the patch on Windows

Extract this ZIP into your `bench-tracker (7)` project root and replace only matching files. Keep the existing `.env` file private and unchanged. Then run:

```powershell
npm run lint
npm run build
npm run dev
```

`DATABASE_URL` must point to your local PostgreSQL database. Keep `HACKERRANK_API_KEY` in `.env`; do not put secrets in the catalog file or source control.

### Catalog entry example

A single mapping looks like this:

```json
{
  "testId": "123456",
  "experienceBand": "0-5",
  "level": "Beginner",
  "code": "B1"
}
```

Replace `123456` with the actual ID assigned to the published HackerRank test (copy the stable test ID, not the title). Use the same code and band from the template row. Each code is unique within a band; do not copy one ID into multiple rows. Leave test names out of this mapping.
