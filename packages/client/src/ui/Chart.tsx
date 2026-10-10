export interface Series {
  name: string;
  color: string;
  values: number[];
}

const PALETTE = ['#e8b84a', '#7cc4ff', '#6cc56a', '#e2584d', '#b07ae0', '#f08cc0', '#5ed6c8', '#c9c36a'];

export function color(k: number): string {
  return PALETTE[k % PALETTE.length]!;
}

export function LineChart({ series, height = 120, labels }: { series: Series[]; height?: number; labels?: [string, string] }) {
  const w = 320;
  const h = height;
  const n = Math.max(2, ...series.map((s) => s.values.length));
  let max = 1;
  for (const s of series) for (const v of s.values) if (v > max) max = v;
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (n - 1)) * (w - 30) + 28).toFixed(1)},${(h - 14 - (v / max) * (h - 24)).toFixed(1)}`).join(' ');
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img">
        <line x1="28" y1={h - 14} x2={w - 2} y2={h - 14} stroke="var(--line)" />
        <line x1="28" y1="6" x2="28" y2={h - 14} stroke="var(--line)" />
        <text x="2" y="12" fill="var(--muted)" font-size="10">
          {Math.round(max)}
        </text>
        <text x="2" y={h - 14} fill="var(--muted)" font-size="10">
          0
        </text>
        {labels && (
          <>
            <text x="28" y={h - 2} fill="var(--muted)" font-size="9">
              {labels[0]}
            </text>
            <text x={w - 2} y={h - 2} fill="var(--muted)" font-size="9" text-anchor="end">
              {labels[1]}
            </text>
          </>
        )}
        {series.map((s) => (
          <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} stroke-width="1.8" />
        ))}
      </svg>
      <div class="legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} /> {s.name}: {Math.round(s.values[s.values.length - 1] ?? 0)}
          </span>
        ))}
      </div>
    </div>
  );
}
