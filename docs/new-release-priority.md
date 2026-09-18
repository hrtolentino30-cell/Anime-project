# New release priority fix (2026-09-18)

Root cause: scanner discoveries and series episode backfills both used priority 10, pending jobs could not be promoted, and both writers shared one fingerprint. A new Slime S4 E23 discovery waited behind hundreds of imports.

Database rules:
- Index-discovered episodes not yet ingested: priority 0, newest discovery first.
- Index updates to existing episodes: priority 20.
- Index anime metadata: priority 30.
- Series/catalog episode imports: priority 40.
- Periodic maintenance keeps its lower priorities.
- Active job upserts preserve identity, attempts and available_at while allowing priority promotion.
- Index fingerprints and catalog fingerprints are stored separately.
- Claims remain atomic, skip locked rows, and keep the three-job batch cap for the free runtime.

Scanner version 11 explicitly sends discovery_origin=index. Existing worker imports omit this marker and are treated as catalog work. Do not remove the marker or deploy an older scanner without it.

Regression tests: db/tests/new-release-priority.sql runs entirely inside a rolled-back transaction and verifies classification, promotion, retry backoff preservation, independent fingerprints, active-job deduplication, and urgent claim ordering.

Live verification:
- Scanner automatically promoted Slime S4 E23 to priority 0, without a title-specific rule.
- Catalog worker completed its first attempt with no error.
- Episode 79a172ec-6837-4b5a-9879-3f65e4d4ce25 entered the Facebook queue at 2026-09-18 15:33:46 UTC.
- The cloud Facebook worker claimed it automatically. Check the current queue for upload/publication status.

This corrects queue starvation. Upstream outages, unavailable media, Facebook processing and service limits can still delay a job.
