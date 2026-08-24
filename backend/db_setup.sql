-- Enable pg_trgm extension for text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create users table (Mock for now to satisfy foreign key constraints)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    hall_id UUID,                        -- populated at first login / profile setup; FK added after halls table exists
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OTP Table
CREATE TABLE IF NOT EXISTS email_verification_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enums
CREATE TYPE item_type AS ENUM ('lost', 'found');
CREATE TYPE item_status AS ENUM ('active', 'matched', 'expired', 'resolved');

-- Items table
CREATE TABLE IF NOT EXISTS items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    type            item_type NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT NOT NULL,              -- electronics, id_card, bottle, bag, etc.
    image_url       TEXT,                        -- stored even though v1 doesn't embed it
    location        TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    status          item_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram index for fuzzy text matching on title + description
CREATE INDEX IF NOT EXISTS idx_items_text_trgm
    ON items USING GIN ((title || ' ' || coalesce(description, '')) gin_trgm_ops);

-- Fast filtering by the fields every query will filter on
CREATE INDEX IF NOT EXISTS idx_items_type_status_category ON items (type, status, category);
CREATE INDEX IF NOT EXISTS idx_items_expires_at ON items (expires_at) WHERE status = 'active';

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lost_item_id UUID NOT NULL REFERENCES items(id),
    found_item_id UUID NOT NULL REFERENCES items(id),
    similarity_score DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    UNIQUE (lost_item_id, found_item_id)
);

-- Roommate Matching

CREATE TABLE IF NOT EXISTS roommate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sleep_schedule DOUBLE PRECISION NOT NULL,
    wake_up_time DOUBLE PRECISION NOT NULL,
    ac_fan_preference DOUBLE PRECISION NOT NULL,
    self_cleanliness DOUBLE PRECISION NOT NULL,
    self_noise_level DOUBLE PRECISION NOT NULL,
    self_guest_frequency DOUBLE PRECISION NOT NULL,
    self_talkativeness DOUBLE PRECISION NOT NULL,
    pref_cleanliness DOUBLE PRECISION NOT NULL,
    pref_noise_level DOUBLE PRECISION NOT NULL,
    pref_guest_frequency DOUBLE PRECISION NOT NULL,
    pref_talkativeness DOUBLE PRECISION NOT NULL,
    smoking DOUBLE PRECISION NOT NULL DEFAULT 0,
    requires_non_smoking_roommate DOUBLE PRECISION NOT NULL DEFAULT 0,
    free_text_notes TEXT,
    available DOUBLE PRECISION NOT NULL DEFAULT 1,
    feature_vector vector(11),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roommate_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    compatibility_score DOUBLE PRECISION NOT NULL,
    llm_summary TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campus Navigation (Buildings)

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    short_name VARCHAR(50),
    aliases TEXT[],
    category VARCHAR(50),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location GEOGRAPHY(POINT, 4326),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buildings_name_trgm ON buildings USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_buildings_location ON buildings USING GIST (location);

-- =============================================================
-- Hall-wise Maintenance Reporting
-- =============================================================

-- Halls table
CREATE TABLE IF NOT EXISTS halls (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);

-- Seed all IIT Kharagpur halls
INSERT INTO halls (name) VALUES
    ('Atal Bihari Vajpayee Hall of Residence'),
    ('Azad Hall of Residence'),
    ('B R Ambedkar Hall of Residence'),
    ('Bidhan Chandra Roy Hall of Residence'),
    ('Gokhale Hall of Residence'),
    ('Homi J Bhabha Hall of Residence'),
    ('Jagadish Chandra Bose Hall of Residence'),
    ('Lala Lajpat Rai Hall of Residence'),
    ('Lalbahadur Sastry Hall of Residence'),
    ('Madan Mohan Malviya Hall of Residence'),
    ('Megnad Saha Hall of Residence'),
    ('Mother Teresa Hall of Residence'),
    ('Nehru Hall of Residence'),
    ('Patel Hall of Residence'),
    ('Radha Krishnan Hall of Residence'),
    ('Rajendra Prasad Hall of Residence'),
    ('Rani Laxmibai Hall of Residence'),
    ('Sarojini Naidu and Indira Gandhi Hall of Residence'),
    ('Savitribai Phule Hall of Residence (Block 1)'),
    ('Savitribai Phule Hall of Residence (Block 2)'),
    ('Sir Ashutosh Mukherjee Hall of Residence'),
    ('Sister Nivedita Hall of Residence'),
    ('Vidyasagar Hall of Residence'),
    ('Vikram Sarabhai Residential Complex – 1'),
    ('Vikram Sarabhai Residential Complex – 2'),
    ('Zakir Hussain Hall of Residence')
ON CONFLICT (name) DO NOTHING;

-- Add FK from users → halls (now that halls exists)
-- IF NOT EXISTS is not valid for ADD CONSTRAINT; use a DO block instead
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_hall'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT fk_users_hall
            FOREIGN KEY (hall_id) REFERENCES halls(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Per-category SLA config (tunable by admin without code change)
CREATE TABLE IF NOT EXISTS sla_policies (
    category      TEXT PRIMARY KEY,   -- 'food' | 'cleanliness' | 'repair' | 'electrical' | 'plumbing' | 'other'
    max_hours     INT  NOT NULL,
    assigned_role TEXT NOT NULL       -- 'mess' | 'cleanliness' | 'estate' | 'warden'
);

-- Seed default SLA policies
INSERT INTO sla_policies (category, max_hours, assigned_role) VALUES
    ('food',        48,  'mess'),
    ('cleanliness', 72,  'cleanliness'),
    ('repair',      72,  'estate'),
    ('electrical',  24,  'estate'),
    ('plumbing',    48,  'estate'),
    ('other',       96,  'warden')
ON CONFLICT (category) DO NOTHING;

-- Centralized RBAC table (replaces hall_authorities)
CREATE TABLE IF NOT EXISTS user_roles (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role           TEXT NOT NULL,        -- 'STUDENT', 'HALL_ADMIN', 'ELECTRICIAN', 'SUPER_ADMIN'
    hall_id        UUID REFERENCES halls(id) ON DELETE CASCADE,
    department_id  UUID,
    category_scope TEXT[]                -- NULL = all categories in their role's default scope
);

-- Main complaints table
CREATE TABLE IF NOT EXISTS complaints (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hall_id                    UUID NOT NULL REFERENCES halls(id),
    reporter_id                UUID NOT NULL REFERENCES users(id),
    category                   TEXT NOT NULL,
    description                TEXT NOT NULL,
    photo_url                  TEXT,
    assigned_role              TEXT NOT NULL,        -- computed at insert from sla_policies
    status                     TEXT NOT NULL DEFAULT 'open',
    -- status enum: open | acknowledged | in_progress | pending_confirmation | resolved | reopened | rejected
    upvote_count               INT  NOT NULL DEFAULT 1,
    escalation_level           INT  NOT NULL DEFAULT 0,
    sla_deadline               TIMESTAMPTZ NOT NULL,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolution_note            TEXT,
    resolved_by                UUID REFERENCES users(id),
    resolution_submitted_at    TIMESTAMPTZ,
    student_confirmation_at    TIMESTAMPTZ,
    student_confirmation_note  TEXT
);

-- Trigram index on descriptions for similarity-based duplicate detection
CREATE INDEX IF NOT EXISTS idx_complaints_desc_trgm
    ON complaints USING GIN (description gin_trgm_ops);

-- Fast queue queries
CREATE INDEX IF NOT EXISTS idx_complaints_hall_status
    ON complaints (hall_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_complaints_sla
    ON complaints (sla_deadline) WHERE status NOT IN ('resolved', 'rejected');

-- Complaint supporters (students whose reports were merged into an existing ticket)
CREATE TABLE IF NOT EXISTS complaint_supporters (
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (complaint_id, user_id)
);

-- Append-only audit trail — every status change logged here
CREATE TABLE IF NOT EXISTS complaint_status_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    changed_by   UUID REFERENCES users(id),
    from_status  TEXT,
    to_status    TEXT NOT NULL,
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- Row Level Security
-- =============================================================

ALTER TABLE complaints                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_status_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hall_authorities           ENABLE ROW LEVEL SECURITY;

-- Students see their own tickets + all resolved tickets + any tickets they supported
DROP POLICY IF EXISTS student_visibility ON complaints;
CREATE POLICY student_visibility ON complaints
    FOR SELECT USING (
        reporter_id = auth.uid()
        OR status = 'resolved'
        OR EXISTS (
            SELECT 1 FROM complaint_supporters cs
            WHERE cs.complaint_id = complaints.id AND cs.user_id = auth.uid()
        )
    );

-- Any authenticated student can submit a complaint (for their hall)
DROP POLICY IF EXISTS student_submit ON complaints;
CREATE POLICY student_submit ON complaints
    FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- Authorities see complaints matching their hall + category scope
DROP POLICY IF EXISTS authority_visibility ON complaints;
CREATE POLICY authority_visibility ON complaints
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM hall_authorities ha
            WHERE ha.user_id = auth.uid()
              AND ha.hall_id = complaints.hall_id
              AND (ha.category_scope IS NULL OR complaints.category = ANY(ha.category_scope))
        )
    );

-- Authorities can update status within their scope
DROP POLICY IF EXISTS authority_update ON complaints;
CREATE POLICY authority_update ON complaints
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM hall_authorities ha
            WHERE ha.user_id = auth.uid()
              AND ha.hall_id = complaints.hall_id
              AND (ha.category_scope IS NULL OR complaints.category = ANY(ha.category_scope))
        )
    );

-- Institute admins see everything
DROP POLICY IF EXISTS institute_admin_visibility ON complaints;
CREATE POLICY institute_admin_visibility ON complaints
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM hall_authorities ha
            WHERE ha.user_id = auth.uid() AND ha.role = 'institute_admin'
        )
    );
