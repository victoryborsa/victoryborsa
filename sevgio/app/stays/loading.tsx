/** Shown instantly while search results load: the same shape as the real page, so nothing jumps. */
export default function Loading() {
  return (
    <div className="wrap wrap-wide" style={{ paddingTop: 22 }} aria-busy="true" aria-label="Loading stays">
      <div className="skel" style={{ height: 96, borderRadius: "var(--r-lg)" }} />
      <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: "nowrap", overflow: "hidden" }}>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="skel" style={{ height: 36, width: 120, flex: "none", borderRadius: 999 }} />)}
      </div>
      <div className="results-split">
        <div>
          <div className="skel" style={{ height: 32, width: 180, marginBottom: 18 }} />
          <div className="cards results-cards">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i}>
                <div className="skel" style={{ aspectRatio: "3 / 2", borderRadius: "var(--r-lg)" }} />
                <div className="skel" style={{ height: 14, width: "55%", marginTop: 12 }} />
                <div className="skel" style={{ height: 18, width: "85%", marginTop: 8 }} />
                <div className="skel" style={{ height: 14, width: "40%", marginTop: 8 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="results-map"><div className="skel" style={{ height: "100%", minHeight: 360, borderRadius: 22 }} /></div>
      </div>
    </div>
  );
}
