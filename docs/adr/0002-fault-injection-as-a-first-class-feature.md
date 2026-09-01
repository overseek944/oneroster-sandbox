# 2. Fault injection as a first-class feature

**Status:** accepted

## Context

A OneRoster provider that only ever behaves correctly is of limited use for
testing. Every expensive rostering incident comes from the provider doing
something unexpected: a truncated export, a stamped timestamp, a sharing change,
an endpoint returning 200 with nothing in it.

Consumers are usually written against the happy path, and their validation
gates, if they have any, are never exercised until the night they matter.

## Decision

Faults are configured per consumer, stored in the database, and applied on every
request that consumer makes. Each fault in the catalogue names the consumer-side
gate it is designed to trip.

## Consequences

The sandbox can demonstrate a consumer's resilience rather than assert it, which
is the difference between a claim and a proof in front of a client.

Responses carry an `X-Injected-Faults` header and the access log records which
faults were live for each request, so behaviour can be explained after the fact
rather than reconstructed.

The cost is that fault handling is threaded through the read path. It is
confined to one function, `applyFaults`, plus a scope clause for dropped
schools, which is a small price for the capability.
