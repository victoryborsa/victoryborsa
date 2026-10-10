// A hand-drawn, low-poly world map (equirectangular: x = lon + 180, y = 90 - lat) with guests flying in to Pittsburgh.
type LonLat = [number, number];
const pt = ([lon, lat]: LonLat) => [lon + 180, 90 - lat] as const;
const poly = (pts: LonLat[]) => pts.map(p => pt(p).map(n => n.toFixed(1)).join(",")).join(" ");

const LAND: LonLat[][] = [
  // North America
  [[-168, 66], [-156, 71], [-128, 70], [-95, 72], [-80, 73], [-62, 60], [-55, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 31], [-80, 25], [-82, 29], [-90, 30], [-97, 27], [-97, 21], [-87, 21], [-83, 10], [-78, 8], [-85, 14], [-92, 15], [-105, 20], [-110, 23], [-117, 32], [-124, 40], [-124, 48], [-131, 55], [-140, 60], [-152, 58], [-165, 62]],
  // Greenland
  [[-73, 78], [-45, 82], [-20, 82], [-20, 70], [-42, 60], [-52, 65], [-58, 75]],
  // South America
  [[-78, 8], [-60, 10], [-50, 0], [-35, -6], [-38, -13], [-48, -26], [-58, -38], [-65, -55], [-72, -50], [-74, -40], [-71, -18], [-81, -5], [-80, 2]],
  // Europe and Asia
  [[-10, 36], [-9, 43], [-2, 44], [-4, 48], [2, 51], [8, 54], [10, 58], [5, 62], [15, 69], [25, 71], [40, 67], [60, 69], [80, 73], [105, 78], [140, 72], [170, 70], [180, 66], [178, 62], [160, 60], [155, 52], [142, 59], [135, 54], [140, 48], [130, 42], [122, 40], [122, 31], [119, 25], [110, 20], [108, 12], [104, 9], [100, 14], [98, 8], [104, 1], [100, 4], [96, 16], [92, 22], [88, 22], [80, 15], [78, 8], [72, 21], [66, 25], [57, 26], [52, 27], [50, 30], [48, 28], [56, 24], [59, 22], [52, 16], [43, 13], [35, 28], [34, 31], [35, 36], [28, 36], [27, 40], [23, 38], [20, 40], [15, 38], [18, 40], [13, 44], [12, 42], [8, 44], [3, 43], [-5, 36]],
  // Africa
  [[-17, 21], [-6, 36], [10, 37], [20, 31], [32, 31], [35, 28], [43, 12], [51, 12], [40, -3], [40, -15], [35, -24], [32, -29], [20, -35], [17, -29], [12, -17], [13, -6], [9, 4], [-8, 4], [-17, 14]],
  // Great Britain, Japan, Borneo, Sumatra, Madagascar, Australia, New Zealand
  [[-6, 50], [2, 51], [0, 54], [-3, 58], [-6, 57], [-5, 54]],
  [[130, 31], [140, 35], [142, 40], [141, 45], [139, 40], [133, 34]],
  [[109, 1], [117, 7], [119, 1], [116, -4], [110, -3]],
  [[95, 5], [106, -6], [104, -5], [98, 1]],
  [[44, -25], [50, -15], [49, -12], [44, -17]],
  [[114, -22], [122, -18], [130, -12], [137, -12], [141, -11], [146, -19], [153, -26], [150, -37], [141, -38], [135, -35], [129, -32], [115, -34]],
  [[172, -34], [178, -38], [174, -41], [167, -46], [172, -41]],
  // Iceland, Ireland, Cuba, Sri Lanka, Philippines, Taiwan, Hudson Bay (water, drawn over North America)
  [[-24, 65.5], [-18, 66.5], [-13.5, 65], [-18, 63.4], [-22.5, 63.8]],
  [[-10, 51.6], [-6, 52.2], [-6, 54.5], [-8.5, 55.2], [-10, 53.5]],
  [[-85, 21.8], [-80, 23], [-74.2, 20.2], [-77.5, 19.9], [-82, 22.5]],
  [[80, 9.8], [81.9, 7.5], [80.5, 5.9], [79.8, 7.5]],
  [[120.5, 18.5], [122.3, 17], [124, 12.5], [125.5, 7], [122, 7], [121, 13.5], [120, 16]],
  [[121, 25.2], [122, 24.5], [120.8, 22], [120.1, 23.2]],
];

const HOME: LonLat = [-80, 40.4];
const FROM: { name: string; at: LonLat; dx?: number; dy?: number; anchor?: "start" | "middle" | "end" }[] = [
  // Canada
  { name: "Toronto", at: [-79.4, 43.7], dx: -3, dy: -3.5, anchor: "end" },
  { name: "Montreal", at: [-73.6, 45.5], dx: 3, dy: -4, anchor: "start" },
  { name: "Vancouver", at: [-123.1, 49.3], dy: -3 },
  // Europe
  { name: "London", at: [-0.1, 51.5], dx: -3, dy: 0, anchor: "end" },
  { name: "Paris", at: [2.35, 48.9], dx: -2, dy: 4.5, anchor: "end" },
  { name: "Amsterdam", at: [4.9, 52.4], dy: -4.5 },
  { name: "Berlin", at: [13.4, 52.5], dx: 2.5, dy: 1, anchor: "start" },
  { name: "Madrid", at: [-3.7, 40.4], dx: -2.5, dy: 1.5, anchor: "end" },
  { name: "Rome", at: [12.5, 41.9], dx: 1, dy: 5 },
  { name: "Istanbul", at: [29, 41], dx: 2.5, dy: -1.5, anchor: "start" },
  // Asia, Africa, Oceania, Latin America
  { name: "Dubai", at: [55.3, 25.3], dy: 5.5 },
  { name: "Mumbai", at: [72.8, 19], dy: 5.5 },
  { name: "Seoul", at: [127, 37.6], dx: -2.5, dy: 1, anchor: "end" },
  { name: "Tokyo", at: [139.7, 35.7], dx: 2.5, dy: 1, anchor: "start" },
  { name: "Cairo", at: [31.2, 30], dy: 5.5 },
  { name: "Lagos", at: [3.4, 6.5], dy: 5.5 },
  { name: "Johannesburg", at: [28, -26.2], dy: 5.5 },
  { name: "São Paulo", at: [-46.6, -23.5], dy: 5.5 },
  { name: "Buenos Aires", at: [-58.4, -34.6], dy: 5.5 },
  { name: "Mexico City", at: [-99, 19.4], dy: 5.5 },
  { name: "Los Angeles", at: [-118, 34], dy: 6 },
  { name: "Sydney", at: [151, -34], dy: 5.5 },
];

export function WorldMap() {
  const [hx, hy] = pt(HOME);
  return (
    <svg className="worldmap" viewBox="0 16 360 122" role="img" aria-label={`Map of the world with guests flying in to Pittsburgh from ${FROM.map(c => c.name).join(", ")}`}>
      <defs>
        <marker id="wm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="wm-arrowhead" />
        </marker>
      </defs>
      {[30, 60, 90, 120, 150].map(y => <line key={y} x1="0" x2="360" y1={y} y2={y} className="wm-grid" />)}
      {[60, 120, 180, 240, 300].map(x => <line key={x} y1="0" y2="180" x1={x} x2={x} className="wm-grid" />)}
      {LAND.map((l, i) => <polygon key={i} points={poly(l)} className="wm-land" />)}
      <polygon points={poly([[-95, 58.5], [-88, 56.5], [-82, 52.5], [-79, 55], [-77, 61], [-86, 64], [-94, 62]])} className="wm-sea" />
      {FROM.map((c, i) => {
        const [x, y] = pt(c.at);
        // Curve each route upward, like a flight path, and stop just short of the pin.
        const mx = (x + hx) / 2, my = Math.min(y, hy) - Math.abs(x - hx) * 0.22 - 6;
        return (
          <g key={c.name}>
            <path d={`M${x.toFixed(1)},${y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${hx.toFixed(1)},${(hy - 2.5).toFixed(1)}`} className="wm-route" markerEnd="url(#wm-arrow)" style={{ animationDelay: `${(i % 7) * 0.3}s` }} />
            <circle cx={x} cy={y} r="1.3" className="wm-city" />
            <text x={x + (c.dx ?? 0)} y={y + (c.dy ?? 5.5)} className="wm-label" textAnchor={c.anchor ?? "middle"}>{c.name}</text>
          </g>
        );
      })}
      <circle cx={hx} cy={hy} r="6" className="wm-pulse" />
      <circle cx={hx} cy={hy} r="2.6" className="wm-home" />
      <g transform={`translate(${hx + 4} ${hy + 3})`}>
        <rect width="38" height="11" rx="2.5" className="wm-tag" />
        <text x="19" y="7.6" textAnchor="middle" className="wm-tag-text">Pittsburgh, PA</text>
      </g>
    </svg>
  );
}
