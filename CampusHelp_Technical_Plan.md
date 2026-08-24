# CampusHelp — Technical Implementation Plan (IIT Kharagpur)

A campus super-app built with Python, designed to scale across ~20 halls and 10,000+ students.

---

## 0. Overall Architecture & Tech Stack

Since you want everything in Python, here's a stack that keeps things consistent and scalable:

| Layer | Technology | Why |
|---|---|---|
| Backend framework | **FastAPI** | Async, fast, auto-generates OpenAPI docs, great for a student-scale project that may grow |
| Database (primary) | **PostgreSQL** | Relational integrity for users/halls/rooms; supports JSONB, full-text search, PostGIS for maps |
| Search / matching | **Elasticsearch** or **PostgreSQL full-text + pg_trgm** | For lost & found fuzzy matching, notes search |
| Caching / queues | **Redis** | Session cache, rate limiting, Celery broker |
| Background jobs | **Celery + Redis** | Hackathon API polling, notification dispatch, appointment reminders |
| Real-time chat | **WebSockets (FastAPI native) + Redis Pub/Sub** | Roommate chat, society channels |
| Auth | **JWT + institute email OTP verification** | Restrict to @kgpian.iitkgp.ac.in emails |
| File storage | **S3-compatible (MinIO self-hosted or AWS S3)** | Lost & found photos, marketplace images, ID proofs |
| Maps | **Google Maps JavaScript API + Geocoding API** | Location search, emergency pinning |
| ML/matching | **scikit-learn, sentence-transformers, FAISS** | Roommate matching, lost & found image/text matching |
| Frontend | **React Native (mobile) or Flutter** + **React (web admin panel)** | Not Python, but you'll need a client — mention if you want a Python-only alternative (Streamlit is NOT recommended for production, only prototyping) |
| Notifications | **Firebase Cloud Messaging (FCM)** | Push notifications for matches, flags, alerts |
| Deployment | **Docker + Docker Compose**, later **Kubernetes** if scaling beyond one server | Each service (API, workers, DB) containerized |
| Monitoring | **Prometheus + Grafana**, **Sentry** for error tracking | Needed once real users hit it |

**Suggested repo structure:**
```
campushelp/
├── app/
│   ├── core/            # config, security, db session
│   ├── models/          # SQLAlchemy models
│   ├── schemas/          # Pydantic schemas
│   ├── api/
│   │   ├── lost_found/
│   │   ├── roommate/
│   │   ├── maintenance/
│   │   ├── reviews/
│   │   ├── emergency/
│   │   ├── locator/
│   │   ├── hackathons/
│   │   ├── societies/
│   │   ├── news/
│   │   ├── courses/
│   │   ├── notes/
│   │   ├── events/
│   │   ├── marketplace/
│   │   └── hospital/
│   ├── workers/          # Celery tasks
│   └── ml/               # matching models, embeddings
├── tests/
├── docker-compose.yml
└── alembic/              # DB migrations
```

Build this **feature-by-feature as separate FastAPI routers**, sharing one `users` and `auth` module. This lets you deploy incrementally and even split into microservices later if load demands it.

---

## 1. Lost & Found (Matching-based)

**Goal:** When someone reports something lost, auto-match it against found-item reports (and vice versa).

**Steps:**
1. Design DB schema: `items(id, user_id, type[lost/found], title, description, category, image_url, location, created_at, status)`
2. Build upload endpoint — accepts text description + optional photo.
3. **Text matching:** Generate sentence embeddings for title+description using `sentence-transformers` (e.g., `all-MiniLM-L6-v2`, lightweight enough for CPU inference). Store embeddings in a **FAISS** index (or `pgvector` extension in Postgres — simpler ops since you're already on Postgres).
4. **Image matching (optional but strong):** Use a pretrained CNN (e.g., `CLIP` via `open_clip` or `ResNet` embeddings) to generate image feature vectors; compare cosine similarity against existing found-item images.
5. On new "lost" report → run similarity search against all "found" items (and vice versa) → if similarity > threshold (tune empirically, e.g. 0.75 cosine), auto-notify both parties via FCM push + in-app match card.
6. If no immediate match, keep the item in the index; run a **daily Celery batch job** that re-checks unmatched items against new ones (catches items reported in either order).
7. Add category filters (electronics, ID cards, bottles, etc.) to reduce false positive matches before running embedding similarity — cheap prefilter.
8. Manual "confirm match" step — never auto-resolve; show both users a proposed match, let them confirm via chat before exchanging contact info.

**Algorithms/Tech:** Sentence-transformers embeddings, FAISS/pgvector for ANN search, CLIP for image similarity, cosine similarity threshold matching.

---

## 2. Roommate Matching

**Goal:** Match roommates by compatibility, not identity attributes like religion/caste (explicitly excluded — good call, also required for fairness).

**Steps:**
1. Build a **compatibility questionnaire** at signup: sleep schedule, noise tolerance, gaming/music volume habits, cleanliness, introvert/extrovert scale, guest frequency, study habits, smoking/non-smoking, AC/fan preference, wake-up time, etc. Use **Likert scales (1–5)** for each, not free text — easier to vectorize.
2. Store answers as a **feature vector** per user.
3. **Matching algorithm options:**
   - **Simple:** weighted Euclidean/cosine distance between feature vectors — rank potential roommates by lowest distance (most similar preferences).
   - **Better:** Use the **Gale-Shapley stable matching algorithm** — since roommate matching is a two-sided matching problem (each student ranks preferences, ideally mutual satisfaction, no student "poached" into a worse match than a stable alternative). This is the textbook-correct algorithm for this exact problem.
   - Combine both: use vector similarity to generate each student's *preference ranking* automatically, then run Gale-Shapley (or its roommate-matching variant, since Gale-Shapley is technically for two distinct groups — for same-group roommate pairing use the **Stable Roommates Problem algorithm**, Irving's algorithm, which handles single-population pairing).
4. Build an **in-app chat system** (WebSocket-based) so matched/prospective roommates can talk before confirming, instead of a blind auto-assignment.
5. Allow re-matching requests each semester (preferences change).
6. **Bias safeguard:** explicitly exclude religion, caste, region, language as matching fields at the schema level — don't just avoid using them in the algorithm, don't collect them here at all, so there's no possibility of misuse later.

**Algorithms/Tech:** Feature vectorization, cosine/Euclidean similarity, Irving's Stable Roommates algorithm (`networkx` has some matching utilities; you may need to implement Irving's algorithm manually — it's a well-documented O(n²) algorithm), WebSockets for chat.

---

## 3. Hall-wise Maintenance Reporting

**Goal:** Students report issues (food, cleanliness, repairs) per hall; authorities track and resolve.

**Steps:**
1. Schema: `complaints(id, user_id, hall_id, category[food/cleanliness/repair/other], description, photo_url, status[open/in_progress/resolved], upvotes, created_at)`
2. Allow **upvoting** duplicate complaints instead of creating clutter — if 50 people upvote "mess food quality bad," that signals priority better than 50 duplicate tickets.
3. Category-based routing: auto-tag complaints to the right authority (mess committee, hall warden, estate office) based on category.
4. Build a **status pipeline**: Open → Acknowledged → In Progress → Resolved, with timestamps at each stage (SLA tracking).
5. Dashboard for hall authorities (simple admin panel) showing open complaints sorted by upvotes/age.
6. **Escalation logic:** Celery scheduled job — if a complaint stays "Open" beyond X days (configurable per category), auto-escalate (notify next authority level, e.g. warden → hall management committee).
7. Public transparency: show complaint status to all hall residents (not necessarily complainant identity) so people can see accountability.

**Algorithms/Tech:** Simple state machine for status, upvote-based priority ranking, Celery for SLA escalation jobs.

---

## 4. Anonymous Department Reviews

**Goal:** Seniors review departments/courses anonymously for juniors.

**Steps:**
1. Schema: `dept_reviews(id, dept_id, review_text, rating, created_at)` — **deliberately no `user_id` foreign key stored in plaintext linked to identity in the same table.**
2. **True anonymity design:** store a **one-way hashed token** (e.g., `user_id + salt` hashed via SHA-256) instead of the raw user ID, so you can still prevent spam/duplicate reviews (rate-limit per hashed token) without being able to reverse it to identify the reviewer.
3. Add a **moderation queue**: run submitted text through a basic **profanity/hate-speech filter** (e.g., `better-profanity` Python package or a small fine-tuned classifier) before publishing, since anonymity increases abuse risk.
4. Allow "helpful/not helpful" voting on reviews (helps surface quality reviews without needing identity).
5. Aggregate rating displayed per department (avg rating, review count).

**Algorithms/Tech:** One-way hashing for pseudo-anonymity, profanity/toxicity classifier (can use HuggingFace's `unitary/toxic-bert` for a stronger filter), rate limiting via Redis.

---

## 5. Emergency Reporting with Location

**Goal:** Report urgent issues (water leaks, electrical hazards, safety) with precise location, routed to authorities immediately.

**Steps:**
1. Schema: `emergencies(id, user_id, category[electrical/water/fire/safety/medical], description, lat, lng, photo_url, status, created_at)`
2. Use device GPS (from mobile app) to auto-capture `lat/lng`; also let user drop/adjust a pin on **Google Maps SDK** for accuracy.
3. **Priority classification:** simple rule-based severity scoring (e.g., "fire" or "medical" = critical, auto-calls emergency contacts; "water leak" = high but not critical) — no need for ML here, rule-based is more reliable and auditable for safety-critical routing.
4. On submission, immediately push notification (FCM) to relevant on-duty staff (hall security, electrician on-call, medical response) based on category + hall.
5. Build an **SLA timer**: if unacknowledged within X minutes for critical categories, auto-escalate to next contact (warden, chief warden, security head) — same escalation pattern as maintenance but with much shorter timers.
6. Store a resolution log for accountability/audit trail.

**Algorithms/Tech:** Google Maps Geocoding + Places API, rule-based severity classification, Celery time-based escalation, FCM push.

---

## 6. Campus Location Finder (Rooms/Departments)

**Goal:** Help new students find rooms/labs/departments (Nalanda, CIC, JCB, EE, CSE, etc.) on a map.

**Steps:**
1. Build a **static geo-database**: `locations(id, name, building, floor, room_no, lat, lng, category[classroom/lab/office/hostel], aliases[])` — this needs manual data collection (survey each building once) or crowdsourced correction over time.
2. Use **PostGIS** (Postgres spatial extension) for efficient geo-queries ("nearest classroom," "all rooms in CIC").
3. Search implementation: full-text search on room name/aliases (since students search casually — "EE seminar hall," "room 105 CSE") using Postgres `pg_trgm` for fuzzy matching on typos.
4. Render results on **Google Maps embedded view** with a pin + walking directions (Google Directions API).
5. Allow crowdsourced correction: "Report wrong location" button, reviewed by admins before applying, since your initial dataset will have gaps.
6. Optional: indoor floor-plan overlays for common buildings (CIC, departments) if you want to go further — static images with click-to-navigate, not true indoor GPS (which is out of scope/expensive).

**Algorithms/Tech:** PostGIS spatial queries, pg_trgm fuzzy text search, Google Maps + Directions API.

---

## 7. Hackathons Aggregator

**Goal:** Pull hackathons across India from external APIs/sources.

**Steps:**
1. Identify sources: **Devfolio API**, **Unstop (Dare2Compete) API/scraping**, **MLH (Major League Hacking) API**, **Devpost** listings.
2. Since not all of these have clean public APIs, you'll likely need a mix of API calls + **web scraping** (`BeautifulSoup`/`Scrapy` + `requests`) for sources without APIs — check each platform's ToS before scraping.
3. Build a **Celery periodic task** (e.g., every 6 hours) that fetches/scrapes new listings, normalizes into a common schema: `hackathons(id, title, source, url, start_date, end_date, mode[online/offline], location, prize_pool, tags[])`.
4. **Deduplication:** since the same hackathon may appear on multiple platforms, use fuzzy title+date matching (`fuzzywuzzy`/`rapidfuzz`) to avoid duplicate listings.
5. Add filters (online/offline, tech stack tags, prize range) and a "remind me" feature (push notification X days before registration deadline).
6. Cache aggregated results in Redis to avoid hitting source APIs repeatedly for every user request.

**Algorithms/Tech:** `requests`/`BeautifulSoup`/`Scrapy` for scraping, Celery Beat for scheduled polling, `rapidfuzz` for deduplication, Redis caching.

---

## 8. Society Channels

**Goal:** Each society gets its own dedicated channel instead of drowning in WhatsApp groups.

**Steps:**
1. Schema: `societies(id, name, description, category)`, `channel_messages(id, society_id, user_id, message, attachment_url, created_at)`, `society_members(user_id, society_id, role[admin/member])`
2. Real-time messaging via **WebSockets** (FastAPI supports this natively) — each society channel is a WebSocket room; use **Redis Pub/Sub** to broadcast messages across multiple backend server instances (needed once you scale beyond one server).
3. Add **read receipts / unread counters** per user per channel (store `last_read_at` per membership row).
4. Role-based permissions: society admins can pin announcements, others can only post in open channels (or read-only announcement channels + separate discussion channel, similar to Discord's model).
5. Push notifications for pinned/important announcements only (not every message) to avoid recreating the WhatsApp noise problem you're trying to solve.
6. Search within channel history (Postgres full-text search on `channel_messages.message`).

**Algorithms/Tech:** WebSockets + Redis Pub/Sub for horizontal scaling, Postgres full-text search.

---

## 9. Info/Updates Section (Campus News)

**Goal:** Central feed for current IIT KGP news.

**Steps:**
1. Schema: `news(id, title, content, source[official/student/scraped], image_url, published_at, category)`
2. Two content sources:
   - **Manual/admin posting** for official notices (student council, administration accounts with verified posting rights)
   - **Aggregated scraping** from IIT KGP's official website/notice board pages, if publicly accessible (check robots.txt/ToS)
3. Celery periodic job to poll official sources for new notices, similar pattern to the hackathons feature.
4. Category tagging (academic/administrative/cultural/sports) for filtering.
5. Push notifications for high-priority categories (exam schedule changes, emergency notices).

**Algorithms/Tech:** Web scraping (`BeautifulSoup`), Celery Beat scheduling, category classification (rule-based keyword tagging is sufficient here — no need for ML).

---

## 10. Course & Professor Reviews

**Goal:** Registration-time decision support — grading pattern, difficulty, attendance strictness.

**Steps:**
1. Schema: `courses(id, code, name, department)`, `course_reviews(id, course_id, professor_name, semester_taken, rating, grading_notes, difficulty[1-5], attendance_strictness[1-5], review_text, hashed_user_token, created_at)`
2. Same **pseudo-anonymity pattern** as department reviews (hashed token, not raw user ID) — reviews are sensitive since they critique professors directly.
3. Aggregate stats per course+professor combination: avg rating, avg difficulty, distribution chart.
4. Allow filtering by semester (grading patterns can change professor to professor, semester to semester).
5. Moderation queue with profanity/defamation filter — this is higher-risk than dept reviews since it names individual professors, so consider requiring reviews to focus on structural aspects (grading, workload) rather than personal remarks; a moderation step reviewed by a small student panel could add legitimacy.
6. Tie into course registration flow — surface this data right when students are picking electives (peak utility moment).

**Algorithms/Tech:** Same anonymization approach as feature 4, aggregation queries, moderation filter (toxic-bert or similar).

---

## 11. Notes/PYQ Exchange

**Goal:** Searchable, course-tagged repository of notes and previous year questions.

**Steps:**
1. Schema: `resources(id, course_id, uploader_id, type[notes/pyq/assignment], title, file_url, semester, upvotes, created_at)`
2. File upload to S3/MinIO, with file-type validation (PDF/images only, size limits).
3. Search by course code + full-text search on titles/extracted content.
4. **OCR text extraction** (Tesseract via `pytesseract`) on uploaded scanned notes/PYQs so content becomes searchable, not just filenames — meaningful upgrade over a flat file dump.
5. Upvote/quality ranking so the best notes surface first per course.
6. Duplicate detection: hash uploaded files (MD5/SHA256) to avoid the same PYQ being uploaded 50 times across batches.

**Algorithms/Tech:** S3/MinIO storage, `pytesseract` OCR, Postgres full-text search, file hashing for dedup.

---

## 12. Event Calendar Aggregator

**Goal:** One central calendar for Spring Fest, Kshitij, dept fests, socials, guest lectures.

**Steps:**
1. Schema: `events(id, title, organizer, category, start_time, end_time, location, description, poster_url, source)`
2. Allow **verified organizers (societies, fests, dept committees)** to post directly through their society channel accounts (ties into feature 8 — reuse the same account/role system).
3. Build a calendar view (month/week/list) — this is mostly frontend, but backend needs efficient date-range queries (`events WHERE start_time BETWEEN X AND Y`, indexed on `start_time`).
4. "Add to my calendar" — generate `.ics` files (Python `icalendar` package) so students can sync to Google Calendar/phone calendar.
5. Reminder notifications (Celery scheduled, X hours before event start) for events the user has bookmarked.
6. Optional: auto-scrape society Instagram/social handles for event posters as a fallback for societies that don't post directly (lower priority, higher effort — treat as stretch goal).

**Algorithms/Tech:** Indexed date-range queries, `icalendar` for `.ics` export, Celery scheduled reminders.

---

## 13. Buy/Sell/Rent Marketplace

**Goal:** Replace the WhatsApp-group-based secondhand marketplace.

**Steps:**
1. Schema: `listings(id, seller_id, title, description, category, price, condition, images[], status[available/sold/reserved], created_at)`
2. Category taxonomy: books, electronics, furniture, cycles, appliances, etc.
3. Search + filters: category, price range, condition; full-text search on title/description.
4. **In-app chat** for buyer-seller negotiation (reuse the WebSocket chat infrastructure from feature 2/8 — don't rebuild chat three times, build one chat module and reuse it across roommate matching, societies, and marketplace).
5. Mark-as-sold flow, with optional "sold to" confirmation for basic trust tracking.
6. **Trust/rating system**: after a transaction, both parties rate each other (1-5 stars) — surfaces reliable sellers over time, similar to OLX/Facebook Marketplace patterns.
7. Report/flag listing feature for scams or prohibited items.

**Algorithms/Tech:** Full-text + faceted search (Postgres or Elasticsearch if listing volume grows large), shared WebSocket chat module, simple rating aggregation.

---

## 14. BC Roy Hospital — Appointments & Reviews

**Goal:** Reduce queue wait times via slot-based appointment booking; track no-shows; anonymous doctor reviews.

**Steps:**
1. Schema: `appointments(id, user_id, doctor_id, slot_time, status[booked/completed/no_show/cancelled], created_at)`, `doctors(id, name, specialization, available_slots)`, `no_show_flags(user_id, count, last_flagged_at)`
2. **Slot-based booking system**: doctors/admin define available time slots per day; students book into a slot (prevents overlapping bookings via a DB unique constraint on `doctor_id + slot_time`).
3. **Queue-position estimation**: even with slots, walk-ins happen — show an estimated live queue position/wait time using a simple formula (avg consultation time × people ahead) rather than trying to build a complex real-time queue simulator initially.
4. **No-show handling:**
   - If a student doesn't check in within a grace window (e.g., 10 min past slot time), auto-mark `no_show`
   - Increment their `no_show_flags.count`
   - On next booking attempt, if `count` exceeds a threshold (e.g., 2 in a semester), show a mandatory reason prompt before allowing rebooking — this is a soft accountability measure, not a punitive ban, since medical access shouldn't be blocked
   - Reminder notifications (SMS/push) 30 min before appointment to reduce accidental no-shows in the first place — this alone will cut a lot of no-shows before you even need the flagging system
5. **Anonymous doctor reviews**: same hashed-token anonymity pattern as features 4 and 10, restricted to users who actually had a completed appointment with that doctor (prevents fake reviews — check `appointments.status == completed` before allowing a review).
6. Admin dashboard for hospital staff to manage slots, view no-show stats, and flagged patterns (e.g., a doctor consistently overbooked → signals need for more slots).

**Algorithms/Tech:** DB unique constraints for slot booking, Celery for reminder + auto-no-show marking, same anonymization pattern as feature 4/10.

---

## Cross-cutting Concerns (apply to all features)

- **Auth:** Single sign-on via institute email OTP — build once, use everywhere.
- **Rate limiting:** Redis-based, prevents spam across lost&found reports, reviews, marketplace listings.
- **Notification system:** Build one unified notification service (FCM) that every feature pushes into, rather than each feature reinventing push logic.
- **Chat module:** Build ONE reusable WebSocket chat component (roommate matching, societies, marketplace all need it — don't triplicate this).
- **Anonymity pattern:** Reuse the same hashed-token approach for feature 4, 10, and 14 — write it once as a utility function.
- **Admin/moderation panel:** One dashboard covering maintenance escalation, emergency response, review moderation, marketplace flags — build role-based access so different authorities (hall wardens, hospital staff, society heads) see only their relevant queue.

---

## Suggested Build Order (for a solo/small team, incremental delivery)

1. **Auth + user profiles** (foundation for everything)
2. **Lost & Found** (self-contained, high visible value, good ML showcase)
3. **Hall-wise Maintenance** (straightforward CRUD + status pipeline, builds admin panel pattern)
4. **Campus Location Finder** (mostly data entry + map integration, no complex backend logic)
5. **Notes/PYQ Exchange** (reuses S3 upload pattern from #2)
6. **Course & Professor Reviews** + **Department Reviews** (reuse anonymization pattern together)
7. **Marketplace** (introduces chat module — build it here, reuse everywhere after)
8. **Society Channels** + **Event Calendar** (reuse chat + build on society/role system)
9. **Roommate Matching** (most algorithmically complex — do this once your matching/embedding pipeline is proven from Lost & Found)
10. **Hackathons + Info/Updates** (scraping/aggregation pattern, can be built in parallel by another team member)
11. **Emergency Section** (safety-critical, needs careful testing before launch)
12. **BC Roy Hospital** (most complex due to no-show logic + real hospital coordination — needs actual buy-in from hospital admin, do this last)

This order front-loads features that prove your core patterns (auth, chat, anonymization, ML matching) so later features are faster to build on top.
