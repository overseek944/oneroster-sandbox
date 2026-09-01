# 3. Synthetic data with deliberate defects

**Status:** accepted

## Context

Test fixtures written by an engineering team tend to be tidy: every student has
an email, every grade level parses as an integer, every co-taught section names
exactly one teacher of record. Real district feeds are not like that, and the
gap is where integrations fail.

## Decision

The generator produces defects on purpose, and the test suite asserts that they
are present. If a change makes the data tidier, the tests fail.

That includes one case that looks like a bug and is not: a minority of co-taught
sections flag **both** teachers as primary. The specification says one is the
teacher of record. Real feeds disagree with themselves often enough that a
consumer needs a deterministic fallback and needs to surface the ambiguity
rather than pick silently.

## Consequences

A consumer that passes against this sandbox has handled the cases that actually
occur. A consumer that only passes against tidy fixtures will fail here, which
is the point.

Generation is seeded and deterministic, so a consumer's diff engine can be
tested by generating, mutating and asserting on the delta.
