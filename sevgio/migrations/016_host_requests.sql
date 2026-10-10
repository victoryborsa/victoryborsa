-- People who chose "List my home" when signing up wait here until an admin approves them as hosts.
ALTER TABLE users ADD COLUMN host_requested_at timestamptz;
