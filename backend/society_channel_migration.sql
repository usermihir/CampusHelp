-- =============================================================
-- Society Channel Feature — Migration
-- Run this in Supabase SQL Editor (safe to re-run, uses IF NOT EXISTS)
-- =============================================================

-- ── Societies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS societies (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    logo_url    TEXT,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Society Admins ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS society_admins (
    society_id  BIGINT NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    user_id     UUID   NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    granted_by  UUID   REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (society_id, user_id)
);

-- ── Society Members ─────────────────────────────────────────────
-- Explicit society membership (admin-added after recruitment)
CREATE TABLE IF NOT EXISTS society_members (
    society_id  BIGINT NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    user_id     UUID   NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    added_by    UUID   REFERENCES users(id),
    joined_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (society_id, user_id)
);

-- ── Channels ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
    id          BIGSERIAL PRIMARY KEY,
    society_id  BIGINT  NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    description TEXT,
    is_private  BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_by  UUID    NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Unique channel name per society (case-insensitive)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_channel_name_per_society'
    ) THEN
        CREATE UNIQUE INDEX uq_channel_name_per_society
            ON channels (society_id, lower(name));
    END IF;
END $$;

-- ── Channel Members ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_members (
    channel_id  BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id     UUID   NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    role        TEXT   NOT NULL DEFAULT 'member',
    joined_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (channel_id, user_id),
    CONSTRAINT chk_channel_member_role CHECK (role IN ('member', 'admin'))
);

-- ── Messages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id          BIGSERIAL PRIMARY KEY,
    channel_id  BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id   UUID   NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    content     TEXT   NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ,
    CONSTRAINT chk_message_content CHECK (
        length(trim(content)) > 0 AND length(content) <= 5000
    )
);

-- ── Indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_channels_society
    ON channels(society_id);

CREATE INDEX IF NOT EXISTS idx_channels_active
    ON channels(society_id) WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_channel_members_user
    ON channel_members(user_id);

CREATE INDEX IF NOT EXISTS idx_channel_members_chan
    ON channel_members(channel_id);

CREATE INDEX IF NOT EXISTS idx_society_members_user
    ON society_members(user_id);

CREATE INDEX IF NOT EXISTS idx_society_admins_user
    ON society_admins(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_channel
    ON messages(channel_id, created_at DESC);
