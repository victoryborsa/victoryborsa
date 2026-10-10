// Runs a real calendar sync from an .ics file, as the scheduled job does after downloading a calendar link.
// Usage: DATABASE_URL=... node --experimental-strip-types tests/e2e/feed-sync.ts <feed id> <ics file>
import fs from "node:fs";
import { parseIcs } from "../../lib/ical.ts";
import { channelOf } from "../../lib/channels.ts";
import { applyFeedEvents } from "../../lib/channel-res.ts";
import { one, pool } from "../../lib/db.ts";
import { todayLocal } from "../../lib/dates.ts";

const [feedId, file] = process.argv.slice(2);
const f = (await one<{ id: string; property_id: string; name: string; url: string }>("SELECT id, property_id, name, url FROM ical_feeds WHERE id = $1", [feedId]))!;
const r = await applyFeedEvents(f, channelOf(f.name, f.url).key, parseIcs(fs.readFileSync(file, "utf8")), todayLocal());
console.log(JSON.stringify(r));
await pool.end();
