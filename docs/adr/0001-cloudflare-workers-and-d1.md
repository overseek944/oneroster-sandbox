# 1. Cloudflare Workers and D1

**Status:** accepted

## Context

The sandbox needs to be permanently available, cheap enough to leave running,
and fast to deploy. It serves a read-mostly dataset of a few tens of thousands
of rows with a query pattern that is entirely conventional.

## Decision

Cloudflare Workers for the runtime and D1 (SQLite) for storage.

## Consequences

Deploys take seconds and cost nothing at this scale. Cron triggers, which the
consuming platform needs, are available in the same account.

The constraints are real and worth naming. D1 is SQLite, so there are no arrays
and no JSON operators worth relying on; array-valued fields are stored as JSON
text, which is acceptable because nothing filters on their contents. There is a
statement size limit, which is why the seed batches rows and why demographics,
which carries a JSON payload per row, uses a smaller batch than the rest.

Persistence is reached only through `src/db/repository.ts`. Moving to Postgres
would mean reimplementing that one module, not rewriting the service.
