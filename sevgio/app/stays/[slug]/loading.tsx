/** Shown instantly while a listing loads: title, photo gallery and details in their real places. */
export default function Loading() {
  return (
    <div className="wrap page-pad" aria-busy="true" aria-label="Loading this stay">
      <div className="skel" style={{ height: 14, width: 90 }} />
      <div className="skel" style={{ height: 38, width: "min(520px, 80%)", marginTop: 12 }} />
      <div className="skel" style={{ height: 16, width: 260, marginTop: 10 }} />
      <div className="skel-gallery">
        <div className="skel" />
        <div className="skel" /><div className="skel" /><div className="skel" /><div className="skel" />
      </div>
      <div className="row" style={{ gap: 12, marginTop: 20 }}>
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skel" style={{ height: 72, flex: "1 1 120px", borderRadius: "var(--r-lg)" }} />)}
      </div>
    </div>
  );
}
