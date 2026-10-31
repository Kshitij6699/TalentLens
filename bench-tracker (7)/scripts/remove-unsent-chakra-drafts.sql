-- Optional cleanup: removes only stale Chakra drafts that were never confirmed as sent.
-- This does not remove confirmed invitations or assessment results.
DELETE FROM chakra_interviews
WHERE status = 'Invite Prepared'
  AND invited_at IS NULL;

SELECT COUNT(*) AS remaining_unconfirmed_drafts
FROM chakra_interviews
WHERE status = 'Invite Prepared'
  AND invited_at IS NULL;
