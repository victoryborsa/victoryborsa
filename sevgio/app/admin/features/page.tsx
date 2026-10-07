import { requireUser } from "@/lib/auth.ts";
import { flagStates } from "@/lib/flags.ts";
import { setFlagAction } from "@/app/actions/admin.ts";
import { SubmitButton } from "@/components/forms.tsx";

export default async function Features() {
  await requireUser(["admin"], "/admin");
  const flags = await flagStates();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <p className="muted">Each new feature from the upgrade plan has its own switch. Turning one off puts the site back the way it worked before that feature, right away, with no deploy. Features show as &ldquo;Not built yet&rdquo; until they are ready.</p>
      <div className="stack" style={{ gap: 12 }}>
        {flags.map(f => (
          <section className="box" key={f.key} data-flag={f.key} style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>{f.name}</h2>
              <p className="muted" style={{ margin: "4px 0 6px" }}>{f.about}</p>
              <p className="hint mono" style={{ margin: 0 }}>{f.key} · Phase {f.phase}</p>
              {f.ready && f.forced !== null && <p className="hint" style={{ margin: "6px 0 0" }}>Set to {f.forced ? "on" : "off"} in Render → Environment ({f.key}). Remove that setting to use this switch.</p>}
            </div>
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              {!f.ready ? <span className="pill neutral">Not built yet</span> : <span className={`pill ${f.on ? "ok" : "neutral"}`}>{f.on ? "On" : "Off"}</span>}
              {f.ready && f.forced === null && (
                <form action={setFlagAction}>
                  <input type="hidden" name="key" value={f.key} />
                  <input type="hidden" name="on" value={f.on ? "0" : "1"} />
                  <SubmitButton className={`btn btn-sm ${f.on ? "btn-ghost" : "btn-primary"}`} pendingText="Saving…">{f.on ? "Turn off" : "Turn on"}</SubmitButton>
                </form>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
