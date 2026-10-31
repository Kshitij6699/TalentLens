-- One-time reset. Run in pgAdmin with talentlens_demo selected after taking a backup.
-- Deletes local HackerRank and Chakra assessment history only; employee and HR records are untouched.
BEGIN;
TRUNCATE TABLE chakra_interviews, hackerrank_exams RESTART IDENTITY;
COMMIT;

SELECT 'hackerrank_exams' AS table_name, COUNT(*) AS remaining_rows FROM hackerrank_exams
UNION ALL
SELECT 'chakra_interviews' AS table_name, COUNT(*) AS remaining_rows FROM chakra_interviews;
