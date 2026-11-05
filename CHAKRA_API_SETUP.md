# Chakra API setup for TalentLens

TalentLens retrieves Chakra report data server-to-server. Each recruiter signs into TalentLens only; the Chakra API token is stored on the backend and must never be placed in frontend code, sent from the browser, or committed to Git.

Required server `.env` values, supplied by HackerRank's official API documentation/support:

```dotenv
CHAKRA_API_RESULTS_URL_TEMPLATE=<official HTTPS results endpoint; optionally includes {interviewerId} and/or {email}>
CHAKRA_API_TOKEN=<server-side API credential>
CHAKRA_API_AUTH_HEADER=<exact auth header name>
CHAKRA_API_AUTH_PREFIX=<exact auth prefix if required; otherwise leave blank>
CHAKRA_INTERVIEWER_ID=<actual interviewer ID if URL template uses {interviewerId}>
```

Restart the server after editing `.env`. The `/api/chakra/config` endpoint exposes only whether configuration is present, never the credential itself.

Use **Fetch result (API)** as the primary result path. **Import result CSV** is only a fallback once the local record shows a completed interview (or a valid `completedAt` timestamp). The backend independently enforces this restriction and returns HTTP 409 if a CSV is submitted earlier.

HackerRank's public help confirms that Chakra API access exists for retrieving interview reports/candidate data, and that reports are for completed interviews. The public help page does not specify the endpoint and auth contract. Obtain those exact values from HackerRank before enabling sync; don't create a URL based on guesswork.

Official references:
- https://support.hackerrank.com/articles/8142080826-july-2026-release-notes
- https://support.hackerrank.com/articles/6818900787
- https://support.hackerrank.com/articles/2067417637-api-overview
