"""
Quick script to exercise the HackerRank for Work v3 API and see exactly
what each call returns, before wiring it into the real backend.

Flow it tests:
  1. List tests            -> confirm the test_id for each difficulty level
  2. Add + invite candidate -> send them the right test for their level
  3. Poll candidate status  -> see the raw status field until the report is ready
  4. (optional) Pull the score report once it's ready

Auth: HackerRank for Work supports either
  - Bearer token (generate one under Company Admin > Settings > Integrations/API)
  - HTTP Basic (username + API key)
This script uses Bearer; swap the HEADERS line if your account only has Basic.

NOTE: field/endpoint names below are compiled from HackerRank's public
knowledge-base articles and third-party API directories, not a live call
against your account (the interactive Swagger console needs your login +
JS to render). Sanity-check field names with one curl/Postman call against
your own token before trusting this wholesale.
"""

import time
from datetime import datetime

import requests

BASE_URL = "https://www.hackerrank.com/x/api/v3"
BASE_URL_V2 = "https://www.hackerrank.com/x/api/v2"
API_TOKEN = "f847d2c07c2c0fccf7bab772cac98dff17c67ba4ddd83fcb89db1b9ffb533d72"

HEADERS = {
    "Authorization": f"Bearer f847d2c07c2c0fccf7bab772cac98dff17c67ba4ddd83fcb89db1b9ffb533d72",
    "Content-Type": "application/json",
}

# Map your app's difficulty levels to the HackerRank test_id created for each.
# HackerRank tests don't have a built-in "difficulty" param on invite - the
# usual pattern is one separate Test per level, created in the HR for Work UI,
# and your app just picks the right test_id.
TEST_ID_BY_LEVEL = {
    "easy": "2399921"
    # "intermediate": "REPLACE_WITH_INTERMEDIATE_TEST_ID",
    # "hard": "REPLACE_WITH_HARD_TEST_ID",
}

# Documented "stable" values for the `status` field on a candidate record.
# HackerRank may also return transient values (2-6, other negatives) during
# evaluation/integrity checks/report generation - don't build logic on those.
STATUS_MAP = {
    -1: "Invited",
    0: "In progress",
    1: "Completed - report not ready yet",
    5: "Submission received - evaluation in progress",
    7: "Report ready",
}


def list_tests():
    r = requests.get(f"{BASE_URL}/tests", headers=HEADERS)
    r.raise_for_status()
    data = r.json()
    print("Tests:", data)
    return data


def invite_candidate(level: str, email: str, full_name: str):
    test_id = TEST_ID_BY_LEVEL[level]

    # Step 1: add the candidate to the test
    r = requests.post(
        f"{BASE_URL}/tests/{test_id}/candidates",
        headers=HEADERS,
        json={"email": email, "full_name": full_name},
    )
    if not r.ok:
        print(f"Candidate creation failed ({r.status_code}): {r.text}")
    r.raise_for_status()
    candidate = r.json()
    print("Add candidate response:", candidate)
    candidate_id = candidate["id"]

    # The candidate-creation response contains the unique test link.
    print("Candidate test link:", candidate["test_link"])

    # Use the same bulk-invite operation as the HackerRank UI.
    invite_response = requests.post(
        f"{BASE_URL_V2}/tests/{test_id}/candidates/bulk",
        headers=HEADERS,
        json={
            "candidates": [{"name": full_name, "email": email}],
            "check_attempted_emails": False,
            "check_invited_emails": False,
            "checkbox": True,
            "endtime": None,
            "id": test_id,
            "timezone": "Asia/Kolkata",
            "options": {
                "time": True,
                "link": True,
                "creds": True,
                "copy": False,
                "new_invite_mail_template": True,
                "timezone": "Asia/Kolkata",
            },
            "starttime": datetime.now().astimezone().isoformat(timespec="seconds"),
            "subject": "Your HackerRank assessment invitation",
            "message": "Please complete the HackerRank assessment using the invitation link.",
            "tags": "",
        },
    )
    if not invite_response.ok:
        print(f"Invitation failed ({invite_response.status_code}): {invite_response.text}")
    invite_response.raise_for_status()
    invite_result = invite_response.json()
    print("Invitation response:", invite_result)

    if invite_result.get("invalid_emails_count", 0) > 0:
        raise RuntimeError("HackerRank rejected one or more candidate email addresses.")

    return test_id, candidate_id


def poll_status(test_id: str, candidate_id: str, interval_sec: int = 30, max_tries: int = 20):
    for attempt in range(max_tries):
        r = requests.get(
            f"{BASE_URL}/tests/{test_id}/candidates/{candidate_id}",
            headers=HEADERS,
        )
        r.raise_for_status()
        data = r.json()
        status_code = data.get("status")
        print(f"[{attempt}] status={status_code} ({STATUS_MAP.get(status_code, 'transient/unknown')})")

        if status_code == 7:
            return data  # report ready
        time.sleep(interval_sec)

    print("Report wasn't ready within the polling window - try again later.")
    return None


def get_report_pdf(test_id: str, candidate_id: str, out_path: str = "candidate_report.pdf"):
    r = requests.get(
        f"{BASE_URL}/tests/{test_id}/candidates/{candidate_id}/pdf",
        headers=HEADERS,
    )
    r.raise_for_status()
    with open(out_path, "wb") as f:
        f.write(r.content)
    print(f"Saved report to {out_path}")


if __name__ == "__main__":
    list_tests()
    test_id, candidate_id = invite_candidate("easy", "kshitijmankar@kpmg.com", "Kshitij Mankar Testing")
    result = poll_status(test_id, candidate_id)
    if result:
        get_report_pdf(test_id, candidate_id)
