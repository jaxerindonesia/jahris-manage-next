# Attendance auto-checkout

The existing scheduler must call GET /api/cron/attendance-auto-checkout with
Authorization: Bearer <CRON_SECRET>. Keep the secret in server configuration.
This endpoint does not install or start a scheduler. vercel.json only configures
Vercel; VPS deployments need their existing scheduler configured separately.

Before executing on production, call the same URL with ?dryRun=true using the
same authorization. This performs no attendance updates.

Response counters:

- checked: open check-ins selected for inspection.
- eligible: completed schedules eligible for checkout.
- updated: actual updates (always zero in dryRun).
- legacyEligible: eligible records without a saved schedule, using current
  tenant attendance configuration as a fallback.
- skippedMissingSchedule: no usable schedule; requires administrator review.
- skippedNotDue: legacy schedule has not ended yet.

Saved scheduledEndAt takes precedence. Legacy records with no scheduleSource
or workShiftId use officeEndTime from their own tenant's attendance configuration,
on the Jakarta date of check-in. This is a fallback, not a reconstruction of
historical settings. Review legacyEligible before applying if office hours changed.
Missing/invalid configuration and ambiguous legacy overnight schedules are skipped.
Manual checkout, absent records, and future scheduled ends are not changed.
Existing notes are preserved; automatic checkout adds its own note.

Use the existing end-of-day schedule (23:59 Asia/Jakarta, equivalent to 16:59 UTC).
The endpoint itself processes ended schedules whenever called; it does not enforce
the end-of-day clock. Calling it earlier can close an employee still working after
their scheduled end. Overnight shifts ending after the run are handled on a later run.
Repeated calls skip completed records; missed runs catch up older open records.

Check server scheduler logs and application logs for
CRON ATTENDANCE AUTO CHECKOUT. HTTP 401 indicates a missing/mismatched secret;
HTTP 500 requires checking the application error log and database migrations.
No request in application logs requires investigation of the scheduler/URL/network.
If an old server crontab still references scripts/call-cron.mjs, replace that entry:
that script was removed and is not part of the deployment.
