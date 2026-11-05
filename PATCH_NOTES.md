# TalentLens v12 — Chakra API-first results and completed-only CSV fallback

## Changes

- Renamed the primary Chakra result action to **Fetch result (API)** and visually emphasized it ahead of the CSV fallback.
- Clarified that result retrieval happens server-to-server using the shared credentials configured on the TalentLens server. Recruiters do not need individual Chakra/HackerRank accounts to sync results.
- Added a concise warning in the Chakra panel when API result synchronization is not configured.
- Kept CSV import visible but faded and unclickable until the interview is in a completed state (or has a valid completion timestamp).
- Added the same completion check on the backend. Calling the CSV import endpoint directly before interview completion returns HTTP 409; the browser UI cannot bypass the rule.
- No database schema change, reset, or `.env` replacement is required.

## Files

- `server.ts`
- `src/components/EmployeeDetailModal.tsx`

## Apply on Windows

1. Stop TalentLens with `Ctrl+C`.
2. Back up `server.ts` and `src/components/EmployeeDetailModal.tsx`.
3. Extract the ZIP and copy the two files into the matching locations in the project root. Do not overwrite `.env` or `node_modules`.
4. Confirm these server-side settings are configured with the exact endpoint and auth format supplied by HackerRank:
   - `CHAKRA_API_RESULTS_URL_TEMPLATE`
   - `CHAKRA_API_TOKEN`
   - `CHAKRA_API_AUTH_HEADER`
   - `CHAKRA_API_AUTH_PREFIX` (only if the vendor requires one)
   - `CHAKRA_INTERVIEWER_ID` if the URL template uses `{interviewerId}`
5. Restart with `npm run dev`.

## How to use

- Click **Fetch result (API)** to retrieve the report through TalentLens' backend. Recruiters only need access to TalentLens; the API credential stays on the server.
- If API sync updates the status to `Completed`, the CSV fallback becomes clickable.
- If the interview is still `Invited` or `In Progress`, CSV import remains disabled. Run Fetch result (API) again after the candidate completes the interview.
- CSV import remains a fallback, not the normal results workflow.

## Important API note

HackerRank's public help says Chakra APIs can retrieve reports and candidate data, but doesn't publish the exact endpoint/authentication shape on the help page. Do not guess these values. Obtain the official endpoint and auth contract from HackerRank support/API documentation and place the values in the server's private `.env`. This allows all TalentLens users to retrieve results without their own HackerRank account.

## Validation

- `npm run lint` passed (`tsc --noEmit`).
- ZIP integrity check passed.
- `npm run build` could not complete in this Linux validation environment because the supplied `node_modules` is missing the platform-specific `@rollup/rollup-linux-x64-gnu` optional dependency. Run `npm run build` on the Windows development machine.
- No live Chakra API call was possible in this environment, so API sync must be verified after configuring vendor-provided endpoint/auth settings.
