const { fmtLocal, escapeHtml } = require('./util');

// Customer emails about a booking: booked, moved, cancelled and the day-before reminder.
// Each has a plain-text and an HTML version, and booked/moved/reminder carry an .ics file
// so the cleaning can be added to the customer's calendar in one tap.

const LONG = { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' };
const money = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

function priceRows(job) {
  const lines = job.price_breakdown && job.price_breakdown.lines;
  if (lines && lines.length) {
    const rows = lines.map((l) => [
      String(l.label).replace(/ — (included|\$\d+)$/, ''),
      l.kind === 'included' ? 'Included' : `${l.amount < 0 ? '−' : ''}${money(Math.abs(l.amount))}`,
    ]);
    if (job.price != null) rows.push(['Total', money(job.price)]);
    return rows;
  }
  return job.price != null ? [['Price', money(job.price)]] : [];
}

// "YYYY-MM-DDTHH:MM" + hours -> ICS local date-times (Pittsburgh time).
function icsTimes(local, hours) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  const start = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  const end = new Date(start.getTime() + (Number(hours) || 3) * 3600e3);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').slice(0, 15);
  return { start: f(start), end: f(end) };
}
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);

function calendarFile(job, config, { cancelled = false } = {}) {
  const { start, end } = icsTimes(job.scheduled_at, job.duration_hours);
  const host = (config.publicUrl || 'http://localhost').replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const content = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${icsText(config.businessName)}//Bookings//EN`, `METHOD:${cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:job-${job.id}@${host}`,
    `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=America/New_York:${start}`,
    `DTEND;TZID=America/New_York:${end}`,
    `SUMMARY:${icsText(`${job.service_type || 'Cleaning'} — ${config.businessName}`)}`,
    job.address ? `LOCATION:${icsText(job.address)}` : null,
    `DESCRIPTION:${icsText(`Questions or changes: call or text ${config.businessPhone}.`)}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  return { filename: 'cleaning.ics', content, contentType: `text/calendar; charset=utf-8; method=${cancelled ? 'CANCEL' : 'PUBLISH'}` };
}

// kind: booked | moved | cancelled | reminder. opts.series: [{scheduled_at}] for a repeating booking.
function bookingEmail(kind, { job, customer, account, config, series = null }) {
  const when = fmtLocal(job.scheduled_at, LONG);
  const short = fmtLocal(job.scheduled_at);
  const cleaners = (job.employees || []).map((e) => firstName(e.name));
  const portalUrl = account ? `${config.publicUrl}/${account.is_host ? 'host/turnovers' : 'portal/bookings'}` : null;
  const subjects = {
    booked: series ? `You're booked: ${short}, then ${series.label}` : `You're booked: ${short}`,
    moved: `New time for your cleaning: ${short}`,
    cancelled: series ? `Your ${series.label} cleanings are cancelled` : `Your cleaning on ${short} is cancelled`,
    reminder: `Reminder: your cleaning is tomorrow, ${fmtLocal(job.scheduled_at, { hour: 'numeric', minute: '2-digit' })}`,
  };
  const intros = {
    booked: series ? `Your ${series.label} cleanings are confirmed. Here are the details for the first one:` : 'Your cleaning is confirmed. Here are the details:',
    moved: 'Your cleaning has a new date or time. Here are the updated details:',
    cancelled: series
      ? `Your ${series.label} cleanings from ${when} on are cancelled (${series.dates.length} visit${series.dates.length === 1 ? '' : 's'}). If that's a mistake, just reply and we'll put you back on the schedule.`
      : `Your cleaning on ${when} is cancelled. If that's a mistake, just reply and we'll put you back on the schedule.`,
    reminder: "Just a reminder that we're coming tomorrow. Please make sure we can get in, and put away anything you don't want moved.",
  };
  const facts = kind === 'cancelled' ? [] : [
    ['When', `${when}${job.duration_hours ? ` (about ${job.duration_hours} hour${Number(job.duration_hours) === 1 ? '' : 's'})` : ''}`],
    job.address && ['Where', job.address],
    job.service_type && ['Service', job.service_type],
    cleaners.length && [`Your cleaner${cleaners.length > 1 ? 's' : ''}`, cleaners.join(', ')],
  ].filter(Boolean);
  const prices = kind === 'cancelled' ? [] : priceRows(job);
  const upcoming = kind === 'booked' && series && series.dates.length > 1 ? series.dates.slice(1, 6).map((d) => fmtLocal(d)) : [];
  const contact = `Need to change something? Reply to this email or call or text ${config.businessPhone}.`;

  const text = [
    `Hi ${firstName(customer.name)},`,
    intros[kind],
    facts.map(([k, v]) => `${k}: ${v}`).join('\n'),
    prices.length ? `Price:\n${prices.map(([k, v]) => `  • ${k}: ${v}`).join('\n')}` : '',
    upcoming.length ? `Next visits:\n${upcoming.map((d) => `  • ${d}`).join('\n')}${series.dates.length > 6 ? `\n  …and ${series.dates.length - 6} more` : ''}` : '',
    portalUrl ? `See your bookings any time: ${portalUrl}` : '',
    contact,
    `Thank you!\n— ${config.businessName}`,
  ].filter(Boolean).join('\n\n');

  const e = escapeHtml;
  const row = (k, v, strong) => `<tr><td style="padding:6px 0;color:#5b6765;width:120px;vertical-align:top">${e(k)}</td><td style="padding:6px 0;${strong ? 'font-weight:700' : ''}">${e(v)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#eef4f2;font-family:Arial,Helvetica,sans-serif;color:#17211f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0f3d38;color:#ffffff;padding:20px 24px;font-size:18px;font-weight:700">${e(config.businessName)}</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 14px;font-size:16px">Hi ${e(firstName(customer.name))},</p>
<p style="margin:0 0 18px;font-size:16px;line-height:1.5">${e(intros[kind])}</p>
${facts.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:15px;border-top:1px solid #e3ebe9;border-bottom:1px solid #e3ebe9;margin-bottom:16px">${facts.map(([k, v], i) => row(k, v, i === 0)).join('')}</table>` : ''}
${prices.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;margin-bottom:16px">${prices.map(([k, v]) => `<tr><td style="padding:3px 0;${k === 'Total' ? 'font-weight:700;border-top:1px solid #e3ebe9' : ''}">${e(k)}</td><td align="right" style="padding:3px 0;${k === 'Total' ? 'font-weight:700;border-top:1px solid #e3ebe9' : ''}">${e(v)}</td></tr>`).join('')}</table>` : ''}
${upcoming.length ? `<p style="margin:0 0 6px;font-weight:700">Next visits</p><p style="margin:0 0 16px;line-height:1.6">${upcoming.map(e).join('<br>')}${series.dates.length > 6 ? `<br>…and ${series.dates.length - 6} more` : ''}</p>` : ''}
${kind !== 'cancelled' ? '<p style="margin:0 0 16px;color:#5b6765;font-size:14px">The attached file adds this cleaning to your calendar.</p>' : ''}
${portalUrl ? `<p style="margin:0 0 18px"><a href="${e(portalUrl)}" style="display:inline-block;background:#1b6f66;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">See your bookings</a></p>` : ''}
<p style="margin:0;font-size:14px;line-height:1.5;color:#3e4a48">${e(contact)}</p>
</td></tr></table></td></tr></table></body></html>`;

  const attachments = kind === 'cancelled' ? [] : [calendarFile(job, config)];
  return { subject: `${subjects[kind]} — ${config.businessName}`, text, html, attachments };
}

module.exports = { bookingEmail, calendarFile };
