# TalentLens × HackerRank / Chakra Assessment Workflow

## Included

- Minimal candidate modal: HackerRank and Chakra appear as the two assessment sections directly; no extra Skip/HackerRank/Chakra/Both chooser is shown. Recruiters use the action within the provider they need.
- PostgreSQL `chakra_interviews` attempt history, including invitation state, score/recommendation, report URL, completion time and raw provider response. The table is created idempotently at server startup.
- The current HackerRank integration remains server-side and uses the real API; no generated/simulated scores are used in this workflow.
- Chakra invites use the official shareable interviewer link copied from the Chakra UI. TalentLens prepares an email draft and records `Invite Prepared`; after the recruiter sends it, the recruiter must click `Mark Invited`. That avoids recording a send that the application cannot verify.
- Chakra API result sync is gated until an exact endpoint and authentication format are supplied by HackerRank. A CSV import using the official Chakra candidate-report export is available as a real-data fallback.

## Chakra account and interviewer setup

1. Ensure the organization has an active Chakra account. HackerRank's current support article says to contact `chakra-support@hackerrank.com` to enable Chakra: https://support.hackerrank.com/articles/8472393759-ashby-chakra-integration-user-guide
2. In Chakra, create/review the interviewer. For this TalentLens workflow, configure it to evaluate both Python/SQL coding and data-engineering scenarios (pipeline design, incremental processing, data quality, reliability, performance and trade-offs).
3. Go to **My Interviewers → select the interviewer → Invite candidates** and copy the shareable interview link. HackerRank documents both sending invites and directly sharing this link: https://support.hackerrank.com/articles/5542727476
4. Set `CHAKRA_INTERVIEW_NAME`, `CHAKRA_INTERVIEWER_ID` (the actual ID if known), and `CHAKRA_INTERVIEW_URL` in the project-root `.env`. The invitation URL must be HTTPS. Restart `npm run dev`. Keep `.env` private and never paste tokens into chat.

## Real Chakra result synchronization

HackerRank's July 2026 release notes confirm APIs are available to retrieve Chakra interview reports and candidate data, but the publicly accessible help article does not publish the exact endpoint/authentication contract: https://support.hackerrank.com/articles/8142080826-july-2026-release-notes

For direct API sync, request Chakra API documentation and access details from HackerRank Support. Then set these root `.env` values exactly as provided by the vendor:

- `CHAKRA_API_RESULTS_URL_TEMPLATE`: full HTTPS URL for the documented candidate/report endpoint. Optional placeholders: `{interviewerId}` and `{email}`.
- `CHAKRA_API_TOKEN`: provider-approved credential.
- `CHAKRA_API_AUTH_HEADER`: exact header name from vendor documentation.
- `CHAKRA_API_AUTH_PREFIX`: exact prefix, if required (e.g. only if the vendor documentation says to use one). Leave blank if no prefix is used.

The server only sends this token to an HTTPS `hackerrank.com` host. Response parsing supports common email/status/score/recommendation/report URL fields; if the returned shape differs from those aliases, synchronization returns a clear error and does not fabricate a result. The API response must include the exact candidate email for matching.

Do not set arbitrary URL paths based on examples from unrelated HackerRank endpoints. If HackerRank provides a specific Chakra endpoint and response schema, adapt the mapper to that contract before enabling API sync.

### CSV fallback (supported now)

1. In Chakra, open **My Interviewers → your interviewer → Candidates → Export CSV**. Chakra's official guide documents report CSV export and completion status/report fields: https://support.hackerrank.com/articles/6818900787
2. Open the candidate profile in TalentLens and create the Chakra invitation record.
3. Use **Import CSV** in the Chakra history row and select the official export. TalentLens matches the exact candidate email and only saves status/score/recommendation/date/report URL values actually present in that exported row.
4. If the CSV field names differ from recognized names, the import will report that rather than guessing or creating a score.

## Database and startup

The PostgreSQL initializer creates `chakra_interviews` if it is missing. No old HackerRank attempt is deleted or converted. Assessment attempts are stored separately by provider. Back up `server.ts`, `src/db/index.ts`, `src/db/schema.ts`, `src/types.ts` and `src/components/EmployeeDetailModal.tsx` before applying any patch ZIP.

## Security / operational notes

- `.env` is intentionally not part of this patch. Keep credentials out of ZIPs and Git.
- Only admins/managers can prepare invitations or update/sync results.
- A `mailto:` draft is not a delivery confirmation; the attempt starts as `Invite Prepared` until the recruiter confirms it.
- Direct API sync stays disabled until every required endpoint/auth setting is configured. CSV import uses genuine exported provider data, never random scores.


## HackerRank test dropdown and experience bands

The HackerRank dropdown is filtered by the candidate's years-of-experience band and progression state. It shows only the next permitted difficulty for that band (Beginner → Intermediate → Advanced) and does not limit options based on the employee's current profile-level Python/SQL rating.

Use consistent published test names or tags, for example:

- `TalentLens | Data Engineer | 0-3 YOE | Beginner`
- `TalentLens | Data Engineer | 0-3 YOE | Intermediate`
- `TalentLens | Data Engineer | 0-3 YOE | Advanced`
- `TalentLens | Data Engineer | 3-6 YOE | Beginner`
- `TalentLens | Data Engineer | 3-6 YOE | Intermediate`
- `TalentLens | Data Engineer | 3-6 YOE | Advanced`
- `TalentLens | Data Engineer | 6-10 YOE | Beginner`
- `TalentLens | Data Engineer | 6-10 YOE | Intermediate`
- `TalentLens | Data Engineer | 6-10 YOE | Advanced`

Each test may contain Python and SQL questions as agreed. The app identifies the experience band and difficulty from the name, tags, description, or relevant HackerRank metadata. Tests without both a recognizable band and difficulty stay out of the dropdown rather than being assigned arbitrarily. Band boundaries: 0–3 includes 3.0; 3–6 is above 3.0 through 6.0; 6–10 is above 6.0 through 10.0. Employees above 10 YOE are outside these three bands.


## Sequential assessment policy (v5)

1. Start with Beginner for the candidate's YOE band.
2. Intermediate is available only after a real HackerRank pass on Beginner; Advanced is available only after a real pass on Intermediate.
3. At each level, one retry is allowed after a confirmed failure. Two confirmed failures at the same level block progression and show a manager-escalation message.
4. Chakra invitation preparation is unavailable until Beginner, Intermediate and Advanced have all passed in sequence. API routes enforce this server-side; hiding/disabling buttons alone is not the security boundary.
5. Results without a trustworthy pass/fail outcome stay pending/review-required and cannot unlock the next level. Assessment details show only metrics returned by the real HackerRank result payload, and the official report link when available.
6. Employee Directory's `Latest HackerRank Result` column shows the latest actual HackerRank pass/fail result and no longer switches to Chakra just because a Chakra record is newer.
7. Progress metadata and recorded outcomes live in the existing `hackerrank_exams.raw_response` field, so this workflow change requires no new PostgreSQL columns or migration.
