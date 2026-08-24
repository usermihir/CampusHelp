# Feature: Lost & Found (Matching-Based)

## Goal
When a user reports a **lost** item, automatically find candidate matches among **found** item reports (and vice versa), surface them as a proposed match, and let both users confirm via chat before any contact info is exchanged.

This is the **v1, non-ML, production-ready design** — text-only matching using Postgres `pg_trgm`, no embeddings, no image matching. Both are deferred (see "Deferred to v2" at the end) but the schema and service boundaries are built so they slot in later without a rewrite.

---

## 1. Database Schema

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE item_type AS ENUM ('lost', 'found');
CREATE TYPE item_status AS ENUM ('active', 'matched', 'expired', 'resolved');

CREATE TABLE items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    type            item_type NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT NOT NULL,              -- electronics, id_card, bottle, bag, etc.
    image_url       TEXT,                        -- stored even though v1 doesn't embed it
    location         TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    status          item_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram index for fuzzy text matching on title + description
CREATE INDEX idx_items_text_trgm
    ON items USING GIN ((title || ' ' || coalesce(description, '')) gin_trgm_ops);

-- Fast filtering by the fields every query will filter on
CREATE INDEX idx_items_type_status_category ON items (type, status, category);
CREATE INDEX idx_items_expires_at ON items (expires_at) WHERE status = 'active';
```

```sql
CREATE TABLE matches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lost_item_id    UUID NOT NULL REFERENCES items(id),
    found_item_id   UUID NOT NULL REFERENCES items(id),
    similarity_score REAL NOT NULL,
    status          TEXT NOT NULL DEFAULT 'proposed', -- proposed / confirmed / rejected
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at    TIMESTAMPTZ,
    UNIQUE (lost_item_id, found_item_id)
);
```

**Design notes**
- `expires_at` is a stored column (not computed at query time) so the expiry job is a single indexed range scan, not a full-table function call.
- `matched`/`expired`/`resolved` are distinct from `active` so every matching query can filter with one clause: `WHERE status = 'active'`.
- Found items can be given a longer `expires_at` window at insert time (e.g. 60 days) if the business decides lost/found windows should differ — same column, different default.

---

## 2. Upload / Report Endpoint

`POST /items`

**Accepts:** `type` (lost/found), `title`, `description`, `category`, optional `image` (multipart), `location`/`lat`/`lng`.

**Flow:**
1. Validate input (title required, category must be from a fixed enum/dropdown — not free text, this is what makes the prefilter reliable).
2. If image present, upload to blob storage (S3), store the URL. No processing on it yet.
3. Insert row into `items` with `status = active`, `expires_at = now() + 30 days`.
4. Enqueue an async matching job (`find_candidates(item_id)`) — **do not run matching synchronously in the request/response path.** Return `201 Created` immediately with the item; matching happens in the background and results arrive via push/in-app notification.

Keeping matching off the request thread means a slow query or downstream notification failure never degrades the upload endpoint's latency or reliability.

---

## 3. Category Prefilter

Category is a **closed dropdown list** (electronics, id_card, bottle, bag, keys, wallet, other), not inferred from text. This is deliberate:
- It's free — no computation, just a `WHERE category = ?` on an indexed column.
- It eliminates the large majority of irrelevant candidates before any text comparison runs.
- It avoids the failure mode of an ML/keyword classifier mis-tagging "HP bag" as electronics because of the brand name.

Every matching query starts here.

---

## 4. Text Matching — `pg_trgm` Similarity

**Why trigram over TF-IDF/embeddings for v1** (from prior discussion): item titles are short (2–4 words) and dominated by typos/shorthand (`"miltom"`, `"hp bagg"`, `idcard: mihr`) rather than semantic paraphrase. Trigram similarity directly targets that failure mode with zero extra infrastructure — no corpus statistics, no model server, no vector index to maintain. Postgres does it natively.

```sql
-- Given a new lost item, find found-item candidates in the same category
SELECT
    id,
    title,
    description,
    similarity(title || ' ' || coalesce(description, ''), :query_text) AS score
FROM items
WHERE type = 'found'
  AND status = 'active'
  AND category = :category
  AND (title || ' ' || coalesce(description, '')) % :query_text  -- uses the trigram index
ORDER BY score DESC
LIMIT 5;
```

- `%` is the `pg_trgm` similarity operator; it uses the GIN index, so this stays fast even at scale.
- `pg_trgm.similarity_threshold` (session or global GUC) can be set to a floor (e.g. `0.3`) so the `%` operator itself discards obvious non-candidates before ranking.

**Decision threshold:** empirically tune, start around `score > 0.4–0.5` for trigram (note: trigram scores are not directly comparable to cosine-similarity thresholds from embedding-based approaches — re-tune from real data, don't reuse the `0.75` figure from an embeddings design).

---

## 5. Matching Flow (Step by Step)

```
1. New item saved (status = active)
2. Async job: find_candidates(item_id)
   a. Look up item's category
   b. Query opposite-type items: same category, status=active, trigram % operator
   c. Take top-N candidates above the similarity floor
3. For each candidate above the confirmed threshold:
   a. Insert row into `matches` (status = proposed)
   b. Push notification (FCM) to both users: "Possible match found"
   c. Surface an in-app match card with both items' text + photos side by side
4. If no candidate clears the threshold:
   a. Item stays status = active, already indexed — nothing further to do now
   b. Picked up automatically by the daily batch recheck (step 6)
```

- `find_candidates` is a standalone service function, not inlined in the endpoint handler — this is what lets image matching or embeddings be added later as an additional signal without touching the API contract.
- Matching is symmetric: the same function runs when a **found** item is reported, searching against `lost` items. One function, called from both directions with `type` flipped.

---

## 6. Daily Batch Recheck (Celery)

Catches the case where item A (lost) was reported before item B (found) existed, so A never got a match at insert time.

```python
@celery_app.task
def daily_recheck_unmatched():
    unmatched = Item.query.filter_by(status='active').all()
    for item in unmatched:
        find_candidates(item.id)   # same function as the real-time path
```

- Runs nightly via Celery beat (or `pg_cron` if you want to avoid standing up a second scheduler for something this simple — see note in section 7).
- Re-uses `find_candidates` exactly — no duplicated matching logic between real-time and batch paths.
- Naturally idempotent: `matches` has a `UNIQUE (lost_item_id, found_item_id)` constraint, so re-running against an already-proposed pair is a no-op (`ON CONFLICT DO NOTHING`).

---

## 7. Expiry (30-Day Auto-Removal)

Discussed and agreed: **soft-delete via status, not a hard `DELETE`.**

```sql
-- Runs daily via pg_cron or Celery beat
UPDATE items
SET status = 'expired'
WHERE status = 'active'
  AND expires_at < now();
```

- Expired items are automatically excluded from matching because every matching query already filters `status = 'active'`.
- Hard-delete expired rows in a **separate, later** pass (e.g. 90 days after expiry) once you're confident nothing needs the history — keeps recovery possible and lets you analyze unclaimed-item rates.
- Send a warning notification at day 25 with a one-tap "extend 30 days" action (`UPDATE items SET expires_at = now() + interval '30 days' WHERE id = ...`) rather than letting reports silently vanish.
- Found items may warrant a longer window than lost items (someone is often physically holding the object) — same mechanism, different default `expires_at` at insert time per `type`.
- If this is the only scheduled job in the system so far, `pg_cron` avoids standing up Celery purely for this; if Celery is already running for the daily recheck (section 6), just add this as a second task in the same beat schedule rather than introducing a second scheduler.

---

## 8. Manual Confirmation (Never Auto-Resolve)

A `matches` row above threshold is a **proposal**, not a resolution.

1. Both users see a match card: item photo (if any), title, description, location, similarity is *not* shown as a raw number to users — shown as "possible match" with the shared distinguishing details highlighted (e.g. matched category + key overlapping words) for trust/explainability.
2. An in-app chat thread opens between the two users, scoped to that match.
3. Either user can confirm or reject:
   - **Confirm (both sides):** `matches.status = confirmed`, contact info exchange unlocked, both items flip to `status = matched` and drop out of future matching queries.
   - **Reject (either side):** `matches.status = rejected`, items stay `active`, remain eligible for other candidates (a rejected pair should not resurface — enforce via the same `UNIQUE` constraint / an exclusion check in `find_candidates`).
4. Never expose raw contact details until both sides confirm — this is the trust boundary that makes the imperfect trigram matching safe to run automatically in the first place. False positives cost a dismissed notification, not a privacy leak.

---

## 9. Explainability Note

Because this is a pure string-similarity match (not a black-box embedding score), the app can *show why* two items matched — e.g. highlight the overlapping words/category between the two listings on the match card. This is a genuine advantage over embeddings for user trust, and costs nothing extra to compute since the matched terms are already available from the query.

---

## Deferred to v2 (Explicitly Out of Scope for This Build)

| Feature | Why deferred | What's already in place for it |
|---|---|---|
| Sentence embeddings (`sentence-transformers` + `pgvector`) | Titles are short/typo-heavy; trigram targets that failure mode more directly and cheaply. Revisit once real match/no-match data shows trigram's actual miss rate. | `find_candidates` is a swappable service function; embeddings would be an additional ranking signal after the category prefilter, same pipeline shape. |
| Image matching (CLIP/ResNet + cosine similarity) | Real infra cost (model serving, vector store, second pipeline) not justified until text-only match rate is measured. | `image_url` is stored and displayed on match cards today; original photos are retained so no re-upload is needed later. |
| TF-IDF weighting | Solves "which words matter," not "words are misspelled" — the latter is the actual observed failure mode; a hardcoded stopword list gets most of the same benefit for free if precision issues show up. | N/A — not part of the pipeline. |

---

## Summary: End-to-End Flow

```
User submits lost item
   → saved (status=active, expires_at=+30d)
   → async job: category prefilter → pg_trgm similarity search vs active found items
        → above threshold  → propose match → notify both → in-app chat → manual confirm → status=matched
        → below threshold  → stays active → picked up by nightly batch recheck
Nightly:
   → batch recheck re-runs find_candidates on all active unmatched items
   → expiry job flips active items past expires_at to status=expired (soft delete)
```
