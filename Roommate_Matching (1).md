# Roommate Matching — Implementation Guide (Supabase)

Stack: FastAPI + Supabase (Postgres + `pgvector` + Auth + Realtime) + Celery/Redis + an LLM for match explanations.

**Key design decision:** there is no mutual "both sides confirm" handshake. The algorithm's job is to *suggest* good candidates. The student makes the actual decision themselves — possibly through conversations outside the app entirely — and self-reports by clicking a single **"Roommate found"** button, which removes them from the matching pool. No linkage to *who* they roomed with is recorded (traded off deliberately for simplicity — see the note in Section 6).

---

## 1. Pipeline Overview

```
Questionnaire (single-capture + dual-capture + hard-filter flags)
        │
        ▼
Hard filter check ──► eliminates categorically incompatible pairs
        │
        ▼
pgvector shortlist ──► fast top-K candidate retrieval per student
        │
        ▼
Irving's Stable Roommates algorithm ──► ranks/pairs the shortlist
        │
        ▼
Match review screen ──► student sets importance weights, sees
                         re-ranked suggestions + RAG compatibility summaries
        │
        ▼
Student decides independently (in-app chat optional, or offline)
        │
        ▼
"Roommate found" button ──► self-report toggle, removes from pool
```

---

## 2. Database Schema (Supabase / Postgres)

```sql
-- Enable pgvector once per project (Supabase SQL editor)
create extension if not exists vector;

create table roommate_profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade unique,
    hall_id uuid references halls(id),
    academic_year text,                -- e.g. '2026-27', scopes matching per cycle

    -- SINGLE-CAPTURE fields (similarity model — one value, ask once)
    sleep_schedule int,                -- 1 = very early, 5 = very late
    wake_up_time int,                  -- 1 = very early, 5 = very late
    ac_fan_preference int,             -- 1 = fan only, 5 = AC always

    -- DUAL-CAPTURE fields: self-trait
    self_cleanliness int,
    self_noise_level int,
    self_guest_frequency int,
    self_talkativeness int,

    -- DUAL-CAPTURE fields: desired-in-roommate
    pref_cleanliness int,
    pref_noise_level int,
    pref_guest_frequency int,
    pref_talkativeness int,

    -- HARD FILTER fields (booleans checked before any scoring)
    smoking boolean default false,
    requires_non_smoking_roommate boolean default false,
    -- add more dealbreaker pairs here as needed, same self/requirement pattern

    free_text_notes text,              -- optional, feeds the RAG summary as extra context
    available boolean default true,    -- flips to false via the "Roommate found" button
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Cached suggestion results per student, refreshed on demand or by a scheduled job.
-- This is NOT a mutual-match table — it's one row per (viewer, candidate) pair,
-- purely to avoid recomputing the full pipeline on every page load.
create table roommate_suggestions (
    id uuid primary key default gen_random_uuid(),
    viewer_user_id uuid references auth.users(id) on delete cascade,
    candidate_user_id uuid references auth.users(id) on delete cascade,
    academic_year text,
    compatibility_score float,         -- lower = more compatible (weighted distance)
    llm_summary text,                  -- generated compatibility explanation
    generated_at timestamptz default now(),
    unique (viewer_user_id, candidate_user_id, academic_year)
);

-- Optional: generic direct messaging between two students, not tied to a "match" object.
-- A chat thread is just keyed by the pair of user ids (smaller id first, by convention,
-- to avoid duplicate threads for (A,B) vs (B,A)).
create table roommate_chat_threads (
    id uuid primary key default gen_random_uuid(),
    user_a uuid references auth.users(id),
    user_b uuid references auth.users(id),
    created_at timestamptz default now(),
    unique (user_a, user_b)
);

create table roommate_chat_messages (
    id uuid primary key default gen_random_uuid(),
    thread_id uuid references roommate_chat_threads(id) on delete cascade,
    sender_id uuid references auth.users(id),
    message text,
    created_at timestamptz default now()
);
```

**Row Level Security (enable on every table above):**
```sql
alter table roommate_profiles enable row level security;
alter table roommate_suggestions enable row level security;
alter table roommate_chat_threads enable row level security;
alter table roommate_chat_messages enable row level security;

-- A student can read/write only their own profile
create policy "own profile" on roommate_profiles
    for all using (auth.uid() = user_id);

-- A student can only see suggestions generated for them
create policy "own suggestions" on roommate_suggestions
    for select using (auth.uid() = viewer_user_id);

-- A student can only see/participate in threads they're part of
create policy "own threads" on roommate_chat_threads
    for all using (auth.uid() = user_a or auth.uid() = user_b);

create policy "own thread messages" on roommate_chat_messages
    for all using (
        exists (
            select 1 from roommate_chat_threads t
            where t.id = thread_id
            and (t.user_a = auth.uid() or t.user_b = auth.uid())
        )
    );
```

This is important precisely because there's no mutual-match record anymore — RLS is now the *only* thing preventing one student from reading another's raw profile data or someone else's chat thread, so get this right before shipping anything.

---

## 3. Step-by-Step Algorithm Implementation

### Step 1 — Hard filter check

Run this first, before any scoring, to prune the candidate pool cheaply:

```python
def passes_hard_filters(a: dict, b: dict) -> bool:
    if a["smoking"] and b["requires_non_smoking_roommate"]:
        return False
    if b["smoking"] and a["requires_non_smoking_roommate"]:
        return False
    # add further dealbreaker checks here as you add fields
    return True
```

### Step 2 — Compatibility scoring (hard filters already passed)

Single-capture fields score by similarity; dual-capture fields score by **cross-compatibility** — does A's self-trait satisfy B's stated preference, and vice versa, averaged.

```python
SINGLE_CAPTURE_WEIGHTS = {
    "sleep_schedule": 1.5,
    "wake_up_time": 1.2,
    "ac_fan_preference": 1.0,
}

DUAL_CAPTURE_FIELDS = ["cleanliness", "noise_level", "guest_frequency", "talkativeness"]
DUAL_CAPTURE_WEIGHTS = {
    "cleanliness": 1.5,
    "noise_level": 2.0,
    "guest_frequency": 1.0,
    "talkativeness": 1.0,
}

def compatibility_score(a: dict, b: dict, importance_overrides: dict = None) -> float:
    """Lower score = more compatible. importance_overrides lets a student
    boost specific fields at review time (Step 4 below) without changing
    the underlying algorithm run."""
    weights_single = {**SINGLE_CAPTURE_WEIGHTS, **(importance_overrides or {})}
    weights_dual = {**DUAL_CAPTURE_WEIGHTS, **(importance_overrides or {})}

    total = 0.0

    for field, weight in weights_single.items():
        diff = (a[field] - b[field]) ** 2
        total += weight * diff

    for field in DUAL_CAPTURE_FIELDS:
        weight = weights_dual.get(field, 1.0)
        # does A's self-trait satisfy B's preference, and vice versa
        a_to_b = (a[f"self_{field}"] - b[f"pref_{field}"]) ** 2
        b_to_a = (b[f"self_{field}"] - a[f"pref_{field}"]) ** 2
        total += weight * ((a_to_b + b_to_a) / 2)

    return total ** 0.5
```

### Step 3 — pgvector shortlist (fast prefilter before the expensive part)

Even with a purely numeric scoring function, storing a normalized feature vector in `pgvector` lets you shortlist cheaply via SQL instead of pulling every hall-mate's row into Python and scoring in a loop — this matters once a hall has hundreds of active profiles.

```sql
alter table roommate_profiles add column feature_vector vector(11);
-- populate feature_vector as the 11 numeric fields normalized to 0-1,
-- recomputed whenever a profile is updated (trigger or app-side on save)

create index on roommate_profiles using ivfflat (feature_vector vector_cosine_ops);
```

```sql
select user_id, feature_vector <=> :query_vector as distance
from roommate_profiles
where hall_id = :hall_id
  and academic_year = :year
  and available = true
  and user_id != :self_id
order by distance
limit 20;
```

This is a rough prefilter only (cosine distance on a simple feature vector, not the true weighted/cross-compatibility score) — it's meant to cut the candidate set down to ~20 before running the precise `compatibility_score` function from Step 2 on just those 20, not to replace it.

### Step 4 — Build ranked preference lists

For each student, sort their Step 3 shortlist by `compatibility_score` (Step 2) ascending. This ranked list is what Irving's algorithm consumes.

### Step 5 — Stable Roommates pairing (Irving's algorithm)

```python
from matching.games import StableRoommates

# preferences: {student_id: [ranked candidate_ids, best first]}
preferences = build_preference_lists(hall_id, academic_year)  # from Step 4

game = StableRoommates.create_from_dictionary(preferences)
solution = game.solve()   # {student_id: matched_student_id, ...}
```

Use `pip install matching` rather than hand-implementing Irving's algorithm — it's a well-tested reference implementation, and Irving's algorithm has enough subtlety (proposal rounds, rejection, rotation elimination) that a from-scratch version is a real bug risk.

**Important shift from the earlier design:** since there's no mutual confirm step anymore, `solution` isn't "the final pairing" in an enforced sense — it's just the algorithm's *top suggestion* per student. Store the full ranked shortlist (not just the single best pair) into `roommate_suggestions`, so students see several options, not one forced pairing.

**No-stable-solution edge case:** if `game.solve()` can't fully pair some students, fall those students back to a simple greedy "lowest compatibility_score remaining" ranking — since you're only ever presenting *suggestions*, not enforcing a stable pairing, this fallback is low-risk here (it wasn't in the old mutual-confirm design, where an unstable assignment was more consequential).

### Step 6 — Generate the RAG compatibility summary

For each suggested pair, retrieve both profiles' relevant fields (including `free_text_notes`) and generate a natural-language explanation:

```python
def build_match_prompt(a: dict, b: dict) -> str:
    return f"""You are summarizing why two students might be compatible
roommates, based on their questionnaire answers. Be concise (3-4 sentences),
balanced, and mention both alignment points and any differences worth knowing.

Student A — sleep: {a['sleep_schedule']}, noise tolerance: {a['self_noise_level']},
wants roommate noise level: {a['pref_noise_level']}, ...
Student B — sleep: {b['sleep_schedule']}, noise tolerance: {b['self_noise_level']},
wants roommate noise level: {b['pref_noise_level']}, ...

Notes from A: {a.get('free_text_notes', '')}
Notes from B: {b.get('free_text_notes', '')}
"""
```

Store the result in `roommate_suggestions.llm_summary`. This is the "generation" half of the RAG pipeline — retrieval already happened in Steps 3-4; the LLM's only job is turning structured data into something readable.

### Step 7 — Importance weighting at review time

When a student views their suggestions, let them mark 2-3 fields as "matters most to me" and **re-run only Step 2's scoring function** (cheap — it's just re-scoring the already-shortlisted ~20 candidates, not re-running pgvector or Irving's algorithm) with `importance_overrides` passed in. Re-sort the displayed list by the adjusted score. This changes what the student *sees*, not the underlying suggestion pool.

### Step 8 — Self-report: "Roommate found"

```python
@router.post("/roommate/found")
async def mark_roommate_found(user=Depends(get_current_user)):
    supabase.table("roommate_profiles") \
        .update({"available": False, "updated_at": "now()"}) \
        .eq("user_id", user.id) \
        .execute()
    # optional: also clear/expire this user's cached rows in roommate_suggestions
    # so they stop appearing as a candidate in others' next refresh
    return {"status": "ok"}
```

This is a self-report toggle only — no linkage to *who* they roomed with is captured. That's a deliberate tradeoff: it's the fastest to build, but it means you have no ground-truth data later on which suggested matches actually succeeded. If you want that signal down the line, the smallest addition is an optional "who did you room with" field on this same endpoint — worth keeping in mind as a fast-follow, not a blocker for v1.

### Step 9 — Re-suggestion cadence

Run Steps 1-6 as a **Celery scheduled task**, scoped by `hall_id` + `academic_year`, refreshing `roommate_suggestions` for all `available = true` students — e.g. nightly, or on-demand when a student opens the matching screen and their cached suggestions are stale (`generated_at` older than N days). Students who mark themselves unavailable are automatically excluded from future candidate pools since Step 3's query already filters `available = true`.

---

## 4. Optional Direct Chat

Since there's no mutual-match object, chat threads are keyed by the pair of user IDs directly, not by a match ID:

```python
@router.post("/roommate/chat/start")
async def start_chat(candidate_id: uuid, user=Depends(get_current_user)):
    user_a, user_b = sorted([str(user.id), str(candidate_id)])
    result = supabase.table("roommate_chat_threads") \
        .upsert({"user_a": user_a, "user_b": user_b}, on_conflict="user_a,user_b") \
        .execute()
    return result.data[0]
```

Use **Supabase Realtime** to subscribe to new rows in `roommate_chat_messages` filtered by `thread_id` — this replaces hand-rolled WebSocket/Redis Pub/Sub infrastructure, since Supabase broadcasts Postgres changes natively.

---

## 5. API Endpoint Summary

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/roommate/profile` | Submit/update questionnaire (single + dual capture + hard filters) |
| `GET` | `/roommate/profile/me` | Fetch own profile |
| `GET` | `/roommate/suggestions/me` | Get cached ranked suggestions + RAG summaries |
| `POST` | `/roommate/suggestions/refresh` | Force a re-run of Steps 1-6 for the current student (rate-limited) |
| `POST` | `/roommate/suggestions/reweight` | Apply importance overrides, re-sort cached shortlist (Step 7) |
| `POST` | `/roommate/found` | Self-report toggle — sets `available = false` |
| `POST` | `/roommate/chat/start` | Get-or-create a chat thread with a candidate |
| `GET` | `/roommate/chat/{thread_id}/messages` | Fetch chat history (also subscribe via Supabase Realtime) |
| `POST` | `/roommate/chat/{thread_id}/messages` | Send a chat message |

---

## 6. Tech Summary

| Component | Tool |
|---|---|
| Hard filters | Plain Python boolean checks, run before scoring |
| Compatibility scoring | Weighted Euclidean distance with single/dual-capture split (custom, shown above) |
| Candidate shortlist / ANN prefilter | Supabase `pgvector`, `ivfflat` index, cosine distance |
| Stable pairing / ranking | `matching` Python package — `StableRoommates` (Irving's algorithm) |
| Match explanation (RAG generation step) | LLM call over retrieved profile pair + free-text notes |
| Suggestion caching | `roommate_suggestions` table, refreshed via Celery Beat or on-demand |
| Self-report removal | Single boolean flip, no confirmation handshake |
| Direct chat (optional) | Supabase Realtime on `roommate_chat_messages` |
| Auth / access control | Supabase Auth + Row Level Security (critical now — no mutual-match record to fall back on) |

---

## 7. Bias Safeguard (re-stated)

Religion, caste, region/state, and language are not fields in the schema at all — not collected, not scored, not inferable from `free_text_notes` being fed to the LLM without deliberate intent. If `free_text_notes` is ever used in the RAG prompt, keep the prompt scoped to lifestyle/habits so the LLM doesn't incidentally surface or weigh in on identity information a student happened to mention.
