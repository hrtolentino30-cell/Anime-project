# Facebook sync isolation

The `facebook-discovery` workflow runs every ten minutes and fetches Animotvslash independently. It stores durable candidates in `facebook_discovery_candidates`, then reconciles candidates into the Facebook queue.

The website scanner and worker own `sync_queue`; Facebook discovery owns its candidate and upload queues. Website backlog and retries no longer prevent Facebook detection. Facebook upload retries and Meta publication state no longer block website ingestion.

A Facebook candidate waits safely when the canonical `episodes` row is not available yet. When the website row arrives, the candidate trigger hands off metadata and creates the upload job. The old website-wide Facebook enqueue trigger is removed.

The discovery endpoint accepts only GitHub OIDC tokens from this repository and workflow. Uploading remains on the leased Facebook queue and proxy, with no duplicate active episode job.