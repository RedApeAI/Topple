CREATE TABLE IF NOT EXISTS waitlist_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'website',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  welcome_sent_at TIMESTAMPTZ,
  welcome_processing_at TIMESTAMPTZ
);

ALTER TABLE waitlist_subscribers
  ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;

ALTER TABLE waitlist_subscribers
  ADD COLUMN IF NOT EXISTS welcome_processing_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS waitlist_subscribers_created_at_idx
  ON waitlist_subscribers (created_at DESC);

CREATE TABLE IF NOT EXISTS waitlist_notification_batches (
  batch_number BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);
