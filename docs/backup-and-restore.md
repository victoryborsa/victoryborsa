# Sevgio backups and restore guide

Written for Victory. No technical background needed. Keep a printed or saved copy somewhere other than the website.

Your reservations, guests, listings, photos, payments and settings all live in **one database** on Render. If that database is lost or damaged, this guide gets it back.

---

## 1. What protects you today

Render keeps two kinds of backups of a **paid** database ([Render's backup guide](https://render.com/docs/postgresql-backups)):

| Kind | What it is | How far back |
|---|---|---|
| **Point-in-time recovery** | Render can rebuild the database exactly as it was at any minute you choose | Last **3 days** on Render's Hobby workspace, last **7 days** on Pro or higher |
| **Exports** (logical backups) | A download of the whole database you start yourself | Each export is kept **7 days** by Render. Download it to keep it longer |

A **free** Render database has neither. If yours is free, upgrade it to a paid plan before anything else.

**What I still need from you:** open render.com → click your Sevgio database → **Recovery** and tell me what it shows (or send a screenshot), plus the plan name on the database's page. Then I can fill in the exact numbers here.

---

## 2. Before any database change: take an export (2 minutes)

Do this every time I say "back up first", and before any big import.

1. Go to **render.com** and sign in.
2. Click your Sevgio **database** (not the website service).
3. Click **Recovery** in the left menu.
4. Click **Create export**. Wait until it shows as finished (a few minutes for a small database).
5. Click **Download** and save the file (it ends in `.dir.tar.gz`) somewhere safe, such as Google Drive in a folder called "Sevgio backups". Name it with the date, for example `sevgio-2026-10-07.dir.tar.gz`.
6. Tell me "backup done" and I'll continue.

Render keeps the export for 7 days. Your downloaded copy is yours for as long as you keep it.

---

## 3. If something goes wrong: get the data back

### A. A mistake in the last few days (most common)

Examples: a bad import, a reservation deleted by mistake, a change that broke the data.

Try the built-in tools first, because they don't touch anything else:
- Bad CSV import → **Host → Finance → Import history → Undo**.
- Wrong double-booking decision → **Double bookings → Reopen**.

If that doesn't fix it, use point-in-time recovery:

1. Write down the **date and time just before** the mistake (Pittsburgh time). Render asks for it.
2. render.com → your database → **Recovery** → under **Point-in-Time Recovery** click **Restore Database**.
3. Name it like `sevgio-restored-oct7`. Enter the date and time from step 1. It can't be within the last 10 minutes.
4. Choose to copy the existing settings. Click **Start Recovery**.
5. Wait until the new database says **Available**. Your live site keeps running on the old database meanwhile, and nothing is lost yet.
6. **Stop here and message me.** I'll check the restored copy has the right reservations before anything switches over.
7. To switch: open the Sevgio **website service** → **Environment** → change `DATABASE_URL` to the new database's **Internal Database URL** → **Save, rebuild and deploy**. The site restarts on the restored data in about 5 minutes.

Anything booked between the restore time and now (from the website, or a calendar link) will be missing from the restored copy. Calendar links fill themselves back in on the next refresh. Check direct bookings and payments from that window by hand (Stripe and your email have a record of each one).

### B. The database is gone or won't start

1. Check **status.render.com**. If Render itself is down, wait; your data is safe on their side.
2. Otherwise, do the point-in-time recovery above, choosing a time a few minutes before the problem.
3. If point-in-time recovery isn't available, restore your newest downloaded export. Message me and I'll do this part, since it needs a command line.

### C. Restore from a downloaded export (I do this part)

For the technical helper: unpack the archive, then `pg_restore --no-owner --no-acl -d "$NEW_DATABASE_URL" <unpacked-directory>` into a fresh Render database, run `npm run migrate`, then point `DATABASE_URL` at it as in step 7 above.

---

## 4. How much could be lost, and how fast it comes back

| | Today (Render point-in-time recovery) | Goal in the upgrade plan |
|---|---|---|
| Data lost at worst | A few minutes | 5 minutes or less |
| Time to get back online | About 1 hour (restore + check + switch) | 2 hours or less |
| How far back | 3 or 7 days (depends on plan) | 7–14 days, plus nightly copies kept for months |

---

## 5. What the upgrade adds later (each needs your OK, some cost money)

- **Nightly copy to a separate account** (Backblaze B2 or Amazon S3), locked so it can't be deleted for a set time, kept 14 daily, 8 weekly and 12 monthly copies. This protects you even if the Render account itself has a problem. Needs a Backblaze or Amazon account (a few dollars a month).
- **Monthly restore test**, run automatically, with the result shown on the System Health page.
- **"Last backup" check** on System Health: green under 24 hours, yellow 24–48 hours, red over 48 hours.

---

## 6. Database changes have an undo too

Every database change from now on comes with a matching undo file (`sevgio/migrations/down/`). That's for emergencies only, after taking an export as in section 2. I run it, not you.
