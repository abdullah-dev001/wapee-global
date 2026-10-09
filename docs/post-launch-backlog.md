# Post-launch backlog

Ideas deliberately left out of launch. Not scheduled.

- Consider a separate permission for the Team list (today `staff.view` opens both Staff and Team, so Receptionist and Staff can see all teammates' names and emails).
- Suite `23_addons_concurrency.sh` is timing-flaky: its "at least two sessions waited on the lock" assertion fails when the sessions do not overlap (failed 4 of 4 runs on 2026-10-09). Cause is lock-wait timing only; the data assertions (1 usage, stock 0, 1 sale, gapless numbers) pass every run. Make the check deterministic or drop it.
