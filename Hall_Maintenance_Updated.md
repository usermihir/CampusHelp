# Hall-wise Maintenance Reporting — Implementation Guide (Supabase)

Stack: FastAPI + Supabase (Postgres + Auth + Storage + Realtime) + Celery/Redis for SLA escalation + FCM for notifications.

---

## 1. Goals

- Any student can report an issue (food, cleanliness, repair, other) tagged to their hall.
- Duplicate reports merge into one ticket instead of cluttering the queue.
- Tickets route automatically to the right authority (warden, mess committee, estate office, cleanliness staff) based on category.
- Every hall's authorities use **one shared admin panel**, not 20 separate systems — access is scoped by role via Row Level Security.
- Tickets that sit unresolved past a category-specific time limit (SLA) auto-escalate to the next authority level.
- Full audit trail — every status change is timestamped and attributable.

---

## 2. High-Level Workflow

```
Student submits issue (category, hall auto-tagged, optional photo)
        │
        ▼
Duplicate check ──► merges into existing open ticket if a close match exists,
                     otherwise creates a new ticket
        │
        ▼
Routed to hall queue ──► category determines which authority role sees it
                          (mess committee / estate office / cleanliness / warden)
        │
        ▼
Admin panel review ──► authority acknowledges, updates status, works the ticket
        │
        ▼
SLA breached? ──► No: stays in normal queue until resolved
             ──► Yes: escalates to next authority level (e.g. chief warden),
                       loops back into the review stage with elevated priority
        │
        ▼
Resolution ──►
        ├─ General issue (food/cleanliness) ──► worker/authority resolves directly
        │                                      └─► student(s) notified, ticket closed
        │
        └─ Personal issue (room/electrical/etc.) ──► worker marks "pending_confirmation"
                                                   └─► student notified
                                                        ├─ Confirm ──► resolved
                                                        └─ Reject ──► reopened/in_progress
```

---

## 3. Low-Level Workflow (per stage)

### 3.1 Submission
1. Student opens "Report an issue" → selects category (`food`, `cleanliness`, `repair`, `electrical`, `plumbing`, `other`) → hall is auto-filled from their profile (no manual entry, removes a source of misrouted tickets) → writes description → optionally attaches a photo.
2. Photo uploads directly to **Supabase Storage**; the returned URL is stored on the ticket row, not the file itself.
3. Backend validates: description non-empty, category is one of the known enum values, rate-limits submissions per student (Redis, e.g. max 10/day) to curb spam.

### 3.2 Duplicate detection
1. Before creating a new row, query existing **open** tickets in the same `hall_id` + `category`, submitted within a recent window (e.g. last 14 days).
2. Run a **text similarity check** between the new description and each candidate's description. Two viable approaches, pick based on effort budget:
   - **Simple (recommended for v1):** `pg_trgm` trigram similarity directly in Postgres (`similarity(description, :new_description) > 0.4`) — no ML infrastructure needed, fast, good enough for short complaint text like "mess food is bad today" vs "food quality poor in mess."
   - **Stronger (optional upgrade):** sentence-transformer embeddings + cosine similarity, same pattern as the lost & found matching pipeline — more robust to paraphrasing, but adds inference cost for a feature where a simpler method is usually sufficient.
3. If a close match is found: increment that ticket's `upvote_count`, link the new submission as a supporting report (don't create a duplicate ticket), notify the student their issue is already tracked.
4. If no match: create a new ticket, `status = open`, `sla_deadline` computed from category (Section 3.4).

### 3.3 Routing
1. Category maps to a role via a fixed lookup (`food → mess`, `cleanliness → cleanliness`, `repair/electrical/plumbing → estate`, `other → warden`).
2. No manual assignment step needed — routing is deterministic from category + hall, computed at insert time and stored directly on the ticket (`assigned_role` column) so admin panel queries are a simple filter, not a join-time computation.

### 3.4 SLA assignment
1. Each category has a configurable max-resolution time (e.g. food = 48h, electrical = 24h, cleanliness = 72h) — store this in a small `sla_policies` config table, not hardcoded, so hall administration can tune it later without a code change.
2. On ticket creation: `sla_deadline = created_at + sla_policies[category].max_hours`.

### 3.5 Admin panel review
1. Authority logs in → sees only tickets where their `hall_authorities` row matches the ticket's `hall_id` and (`category_scope` is null or contains the ticket's category) — enforced by Row Level Security, not just frontend filtering (Section 5).
2. Default queue sort: **open tickets, oldest first, upvote count as tiebreaker** — surfaces both the most urgent (age) and most impactful (upvotes) issues first.
3. Status transitions are a strict state machine: `open → acknowledged → in_progress → resolved` (or `rejected` with a reason, for invalid/duplicate/out-of-scope reports). Each transition is logged with `changed_by`, `from_status`, `to_status`, `timestamp` into a separate history table — never overwrite, always append, so you have a full audit trail.

### 3.6 SLA monitoring & escalation
1. A **Celery Beat scheduled task** runs periodically (e.g. every 30 minutes) and queries: `status != resolved AND sla_deadline < now() AND escalation_level = 0`.
2. For each match: increment `escalation_level`, reassign visibility to the next authority tier (e.g. chief warden / hall management committee), send a push notification to that tier, and log the escalation event.
3. Escalated tickets appear in a **separate "Escalated" view** for the higher authority, not buried in their normal queue — this was the key admin panel requirement from the diagram earlier.
4. If a ticket escalates again past a second deadline (optional second-tier SLA), repeat with `escalation_level = 2` routing to an even higher authority (e.g. institute-level student affairs office) — same pattern, just another config row.

### 3.7 Resolution & Student Confirmation
Resolution behavior depends on whether the issue is a general issue or a personal issue.

**General issues** (e.g. food quality, common-area cleanliness):
1. Worker/authority completes the work and marks the ticket `resolved`, optionally attaching a resolution note/photo.
2. All students who reported or upvoted the ticket get notified (FCM push).
3. No student confirmation is required because these issues are shared/general issues.

**Personal issues** (e.g. room fan/light, room cleanliness, plumbing inside a student's room):
1. Worker completes the work and clicks `Mark as Resolved`.
2. The ticket does **not** immediately become `resolved`; it changes to `pending_confirmation`.
3. The affected student receives an FCM notification that the worker has marked the issue as resolved.
4. The student checks the issue and chooses:
   - `Confirm Resolution` → ticket becomes `resolved`.
   - `Issue Not Fixed` → ticket becomes `reopened` (or `in_progress`) and returns to the maintenance queue.
5. The confirmation/rejection action is stored in the audit trail with the student, timestamp, and optional note.
6. Track worker resolution/dispute statistics, such as resolved tickets versus tickets subsequently rejected/reopened.
7. OTP is **not required**. The student independently verifies whether the issue is actually fixed.
8. Ticket remains visible after resolution in read-only mode for transparency.

### 3.8 Institute-level aggregate view (optional, separate role)
A `institute_admin` role (student affairs / SRIC office) can query across all `hall_id`s — e.g. average resolution time per hall, open ticket count per category, escalation frequency — for oversight. This is just a `GROUP BY hall_id` on the same tables, gated by a separate RLS policy; no separate data pipeline needed.

---

## 4. Database Schema (Supabase / Postgres)

```sql
create table halls (
    id uuid primary key default gen_random_uuid(),
    name text not null
);

create table sla_policies (
    category text primary key,        -- 'food' | 'cleanliness' | 'repair' | 'electrical' | 'plumbing' | 'other'
    max_hours int not null,
    assigned_role text not null       -- 'mess' | 'cleanliness' | 'estate' | 'warden'
);

create table hall_authorities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    hall_id uuid references halls(id),
    role text not null,               -- 'warden' | 'mess' | 'estate' | 'cleanliness' | 'chief_warden' | 'institute_admin'
    category_scope text[]             -- null = all categories in their role's default scope
);

create table complaints (
    id uuid primary key default gen_random_uuid(),
    hall_id uuid references halls(id) not null,
    reporter_id uuid references auth.users(id) not null,
    category text not null,
    description text not null,
    photo_url text,
    assigned_role text not null,      -- computed at insert from sla_policies
    status text not null default 'open',   -- open | acknowledged | in_progress | pending_confirmation | resolved | reopened | rejected
    upvote_count int not null default 1,
    escalation_level int not null default 0,
    sla_deadline timestamptz not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    resolution_note text,
    resolved_by uuid references auth.users(id),
    resolution_submitted_at timestamptz,
    student_confirmation_at timestamptz,
    student_confirmation_note text
);

-- Students who upvoted/reported the same underlying issue (dedup linkage)
create table complaint_supporters (
    complaint_id uuid references complaints(id) on delete cascade,
    user_id uuid references auth.users(id),
    created_at timestamptz default now(),
    primary key (complaint_id, user_id)
);

-- Full audit trail — append-only, never updated
create table complaint_status_history (
    id uuid primary key default gen_random_uuid(),
    complaint_id uuid references complaints(id) on delete cascade,
    changed_by uuid references auth.users(id),
    from_status text,
    to_status text not null,
    note text,
    created_at timestamptz default now()
);

-- Enable pg_trgm for duplicate-detection similarity search
create extension if not exists pg_trgm;
create index on complaints using gin (description gin_trgm_ops);
```

---

## 5. Row Level Security

```sql
alter table complaints enable row level security;
alter table complaint_status_history enable row level security;
alter table hall_authorities enable row level security;

-- Students can see their own submitted/supported complaints, plus all resolved
-- complaints in their hall (transparency), but not other students' open tickets.
create policy "student visibility" on complaints
    for select using (
        reporter_id = auth.uid()
        or status = 'resolved'
        or exists (select 1 from complaint_supporters cs where cs.complaint_id = complaints.id and cs.user_id = auth.uid())
    );

-- Any authenticated student can insert a complaint for their own hall
create policy "student submit" on complaints
    for insert with check (reporter_id = auth.uid());

-- Authorities see complaints matching their hall + category scope
create policy "authority visibility" on complaints
    for select using (
        exists (
            select 1 from hall_authorities ha
            where ha.user_id = auth.uid()
              and ha.hall_id = complaints.hall_id
              and (ha.category_scope is null or complaints.category = any(ha.category_scope))
        )
    );

-- Authorities can update status only within their scope
create policy "authority update" on complaints
    for update using (
        exists (
            select 1 from hall_authorities ha
            where ha.user_id = auth.uid()
              and ha.hall_id = complaints.hall_id
              and (ha.category_scope is null or complaints.category = any(ha.category_scope))
        )
    );

-- Institute admins see everything (separate aggregate role)
create policy "institute admin visibility" on complaints
    for select using (
        exists (select 1 from hall_authorities ha where ha.user_id = auth.uid() and ha.role = 'institute_admin')
    );
```

This is the piece that actually makes "one shared admin panel for 20 halls" safe — the frontend doesn't need to hide anything; Postgres refuses the query at the row level if the user isn't authorized for that hall/category.

---

## 6. Key Algorithms & Concepts

| Concept | Where it's used | Approach |
|---|---|---|
| **Duplicate detection** | Submission | `pg_trgm` trigram similarity (v1) or sentence-transformer embeddings + cosine similarity (upgrade) |
| **Priority ranking** | Admin queue sort | Composite sort: status age (ascending) + upvote count (descending) as tiebreaker |
| **State machine** | Status transitions | Fixed enum transitions. General: `open → acknowledged → in_progress → resolved/rejected`. Personal: `open → acknowledged → in_progress → pending_confirmation → resolved/reopened`, enforced server-side, not just UI-level |
| **Deterministic routing** | Ticket creation | Category → role lookup table (`sla_policies.assigned_role`), no manual assignment |
| **SLA/escalation** | Background job | Celery Beat periodic query (`sla_deadline < now() AND status != resolved`), tiered escalation levels |
| **Multi-tenant access control** | Every read/write | Postgres Row Level Security keyed on `hall_authorities` role + scope — this *is* the multi-hall admin panel mechanism, not a separate system |
| **Audit trail** | Compliance/accountability | Append-only `complaint_status_history`, never mutate past records |

---

## 7. API Endpoint Summary

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/complaints` | Submit a new issue (runs duplicate check server-side before insert) |
| `GET` | `/complaints/me` | Student's own submitted/supported complaints |
| `GET` | `/complaints/hall-queue` | Authority's scoped queue (RLS-filtered automatically) |
| `GET` | `/complaints/escalated` | Higher-authority escalation inbox |
| `PATCH` | `/complaints/{id}/status` | Update status (validates against allowed state transitions) |
| `GET` | `/complaints/{id}/history` | Full audit trail for a ticket |
| `GET` | `/admin/analytics/hall/{hall_id}` | Aggregate stats for institute-level oversight |
| `GET` | `/admin/sla-policies` / `PATCH` | View/update per-category SLA thresholds (chief warden or institute admin only) |

---

## 8. Tech Summary

| Component | Tool |
|---|---|
| Database + Auth + Storage | Supabase (Postgres + Auth + Storage) |
| Duplicate detection | `pg_trgm` (Postgres extension), optional `sentence-transformers` upgrade |
| Multi-hall access control | Postgres Row Level Security keyed on `hall_authorities` |
| SLA escalation scheduling | Celery + Redis (periodic task, e.g. every 30 min) |
| Notifications | Firebase Cloud Messaging (FCM) |
| Audit logging | Append-only `complaint_status_history` table |

---

## 9. Edge Cases Worth Deciding Early
- **Personal issue confirmation:** worker resolution changes the ticket to `pending_confirmation`; the affected student explicitly confirms or rejects after checking the issue.
- **Student absent when work is completed:** the student can inspect the room later and then confirm/reject from the notification/ticket.
- **False/premature worker resolution:** a student can reject the resolution and reopen the ticket. Keep the original resolution event in the append-only history.
- **Repeated worker disputes:** calculate per-worker rejection/reopen rate and surface unusually high rates to hall administration.
- **No OTP:** OTP is intentionally excluded from v1 because it verifies handover/permission rather than whether the maintenance work was actually completed.

- **Rejected tickets:** if an authority marks a report invalid/spam/duplicate-not-caught-by-the-similarity-check, log a rejection reason — this data is useful later for tuning the `pg_trgm` similarity threshold if too many near-duplicates are slipping through as separate tickets.
- **Photo-less reports:** don't require a photo — some issues (noise, food taste) aren't photographable; keep it optional everywhere.
- **Hall transfer / role changes:** if a warden changes halls mid-year, update `hall_authorities` rather than creating a new user — RLS re-evaluates on every query, so access updates immediately without any data migration.
- **Second-tier escalation:** decide upfront whether you want a two-level escalation (warden → chief warden → institute admin) or just one — the schema (`escalation_level int`) supports either, but the `sla_policies` config and Celery job logic should be built for tiers from the start rather than retrofitted.
