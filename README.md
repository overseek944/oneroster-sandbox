# OneRoster Sandbox

A conformant **OneRoster 1.1 / 1.2 provider** that serves realistic synthetic
school district data, and misbehaves on demand.

Live: <https://oneroster-sandbox.pretoni.com>
Console: <https://oneroster-sandbox.pretoni.com/console>

## Why this exists

Anyone building a rostering integration for US K-12 has the same problem: there
is nowhere to test against. Districts will not hand a prospective vendor a live
feed, and the tidy fixtures teams write themselves are missing everything that
actually breaks a sync in September.

So this serves a district that behaves like a real one, and gives you a switch
for each way a real feed goes wrong.

## What makes the data realistic

The point is not volume, it is pathology. A generated district contains:

| | |
|---|---|
| 12 schools | 7 elementary, 3 middle, 2 high, under one district org |
| 5,482 students, 266 staff | across 962 classes and 22,306 enrolments |
| **1,882 students with no email address** | elementary, by policy. If email is your primary key you have designed K-5 out of your product |
| Grade levels as **strings** | `PK`, `KG`, `01`–`12`, `UG`. Parse them as integers and kindergarten disappears |
| Mixed-grade sections | `grades` is an array in the spec for a reason |
| 78 co-taught sections | one teacher flagged `primary`, one not |
| Ambiguous teacher of record | a deliberate minority of sections flag **both** teachers primary, because real feeds do |
| 120 homerooms | `classType: homeroom`, present in every feed and not instructional |
| Ghost sections | "DO NOT USE", "Study Hall", no students, sometimes no teacher |
| 582 ended enrolments | mid-year transfers. The enrolment ends; it is not deleted |
| Duplicate enrolments | same user, same class, two rows |
| Two term structures at once | high schools on semesters with grading periods inside, everyone else on trimesters |

Generation is seeded, so a given seed always produces byte-identical data. That
matters for testing a consumer's diff engine, which is only meaningful against a
reproducible baseline.

## Fault injection

Each fault corresponds to a failure a real provider produces, and to a
validation gate a consumer ought to have. Toggle them per consumer in the
console; they apply immediately.

| Fault | What it simulates | The consumer gate it tests |
|---|---|---|
| Truncated export | An export that ran while the SIS was mid-transaction | Row count collapse |
| Stamp every `dateLastModified` | A provider that touches every row nightly | All rows changed |
| Drop schools | An administrator changing the share | Org disappearance |
| Duplicate rows | A half-completed join upstream | Deduplication on ingest |
| Fail selected endpoints | One collection down, others fine | Partial availability |
| Frozen feed | An upstream export job failing quietly | Nothing changed for N runs |
| Unstable pagination | Concurrent writes during pagination | Reconcile against a count |
| Empty payload (HTTP 200) | A rotated credential returning success | Alert on absence, not only error |
| Latency | A large district | Resumable fetch |

A truncated export and a genuine mass withdrawal are **indistinguishable in the
data**. That is the whole argument for halting rather than guessing, and this is
where you can prove your sync does.

## API

Auth is OAuth 2.0 client credentials.

```bash
BASE=https://oneroster-sandbox.pretoni.com

TOKEN=$(curl -s -X POST "$BASE/oauth/token" \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=client_credentials | jq -r .access_token)

curl -s "$BASE/ims/oneroster/v1p1/schools?limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

**REST** at `/ims/oneroster/v1p1` and `/ims/oneroster/v1p2`:

- Collections: `orgs`, `schools`, `academicSessions`, `terms`, `gradingPeriods`,
  `courses`, `classes`, `users`, `students`, `teachers`, `enrollments`,
  `demographics`
- Nested: `/schools/{id}/classes`, `/schools/{id}/students`,
  `/classes/{id}/students`, `/classes/{id}/teachers`, `/courses/{id}/classes`,
  `/users/{id}/classes`, and others
- Query: `limit`, `offset`, `sort`, `orderBy`, `fields`, and `filter`
- Returns `X-Total-Count` and RFC 5988 `Link` headers

Note that the response key follows the **collection**, not the route:
`GET /schools` returns `{"orgs": [...]}`.

The filter grammar is implemented properly, not approximated:

```
?filter=role='teacher'
?filter=dateLastModified>'2026-09-01T00:00:00.000Z'
?filter=role='student' AND familyName~'Garcia'
```

Fields are checked against an allow-list and values are always bound, so a
filter cannot reach past its collection or into SQL. A filter mixing `AND` with
`OR` is rejected rather than guessed at, because the specification defines no
precedence.

**CSV** at `/csv`:

- `/csv/manifest.csv` declares which files are present and whether the payload
  is `bulk` or `delta`
- `/csv/users.csv`, `/csv/enrollments.csv`, and the rest
- `?since=<ISO timestamp>` turns any file into a delta

## Console

`/console` manages consumers, their share, and their faults. It needs the admin
key. Creating a consumer returns a client id and secret; the secret is hashed on
write and shown exactly once.

## Architecture

```
Cloudflare Worker (Hono)
├── /oauth/token        OAuth 2.0 client credentials, HMAC-signed bearer tokens
├── /ims/oneroster/*    REST binding, one read path for every collection
├── /csv/*              CSV bulk and delta binding
├── /admin/*            consumers, shares, faults, access log
└── /console            operator UI
        │
        └── D1 (SQLite)  seeded from a deterministic generator
```

See [docs/adr](docs/adr) for the decisions and why they were made.

## Development

```bash
npm install
npm run typecheck
npm test                    # unit tests: generator pathology, filter parser
npm run dev                 # local worker at :8787

npx tsx scripts/seed.ts     # regenerate the district as SQL
npm run deploy
```

Secrets (`TOKEN_SIGNING_KEY`, `ADMIN_KEY`) live in `.dev.vars` locally and in
`wrangler secret` in production. Neither is in the repository.

## A note on the free tier

These services run on Cloudflare's free plan, which caps D1 at **100,000 row
writes per day**. One full roster sync of the demonstration district writes
roughly 90,000 rows (29,115 staged, 29,115 sync records, and the operational
tables), so a second full sync on the same day exhausts the quota and writes
begin to fail with a clear D1 error.

Reads are unaffected: the applied roster, the dashboards and the APIs keep
working. It is a quota, not a defect, and the fix is either the $5/month Workers
Paid plan or waiting for the reset at midnight UTC.

Worth knowing before demonstrating this to anyone: run a full sync the day
before, not five minutes before.

## Status and honest limits

- The REST and CSV bindings, the filter grammar, pagination and the error
  envelope are implemented to the specification. **This is not a certified
  implementation**; 1EdTech conformance certification applies to a specific
  product at a specific version and has not been sought for this one.
- The Gradebook and Resources service profiles are not implemented. Rostering
  is, which is what the overwhelming majority of integrations use.
- The data is synthetic. No real student data has ever been near it.
