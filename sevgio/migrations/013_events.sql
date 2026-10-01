-- Pittsburgh events for the public Events page: synced from Ticketmaster, from calendar (.ics) links, or added by an admin.
CREATE TABLE event_feeds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  url             text NOT NULL,
  category        text NOT NULL DEFAULT 'Other',
  last_synced_at  timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL CHECK (source IN ('ticketmaster', 'feed', 'manual')),
  source_id   text NOT NULL DEFAULT '',
  feed_id     uuid REFERENCES event_feeds(id) ON DELETE CASCADE,
  title       text NOT NULL,
  local_date  date NOT NULL,
  end_date    date,
  local_time  text NOT NULL DEFAULT '',          -- "19:00" in Pittsburgh time, or '' for all-day / time to be announced
  venue       text NOT NULL DEFAULT '',
  category    text NOT NULL DEFAULT 'Other',
  team        text,                              -- steelers | pirates | penguins
  image_url   text NOT NULL DEFAULT '',
  url         text NOT NULL DEFAULT '',
  featured    boolean NOT NULL DEFAULT false,
  free        boolean NOT NULL DEFAULT false,
  hidden      boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX events_source_idx ON events (source, source_id) WHERE source <> 'manual';
CREATE INDEX events_date_idx ON events (local_date);
