import { useState, useRef, useCallback } from "preact/hooks";
import { formatChartDate } from "../../utils/format.js";

interface ChartPoint {
  date: string;
  avgPrice: number;
}

const defaultFormatPrice = (p: number) => `${p.toLocaleString()} SB`;

interface PriceChartProps {
  points: ChartPoint[];
  /** Optional extra line in the tooltip (e.g. "Vol: 42"). */
  tooltipExtra?: (point: ChartPoint, index: number) => string | null;
  /** Custom price formatter for display. Default: integer with locale + " SB". */
  formatPriceFn?: (price: number) => string;
}

const W = 300;
const H = 80;
const PAD_X = 4;
const PAD_Y = 6;

function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  }

  // Compute tangent slopes using monotone piecewise cubic (Fritsch-Carlson)
  const n = pts.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dy[i] / dx[i]);
  }

  const tangents: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents.push(0);
    } else {
      tangents.push((m[i - 1] + m[i]) / 2);
    }
  }
  tangents.push(m[n - 2]);

  // Fritsch-Carlson monotonicity fix
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-6) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i] / m[i];
      const b = tangents[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        tangents[i] = t * a * m[i];
        tangents[i + 1] = t * b * m[i];
      }
    }
  }

  // Build cubic Bézier segments
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const seg = dx[i] / 3;
    const cp1x = pts[i].x + seg;
    const cp1y = pts[i].y + tangents[i] * seg;
    const cp2x = pts[i + 1].x - seg;
    const cp2y = pts[i + 1].y - tangents[i + 1] * seg;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

export function PriceChart({ points, tooltipExtra, formatPriceFn = defaultFormatPrice }: PriceChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!svgRef.current || points.length < 2) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const idx = Math.round(relX * (points.length - 1));
      setHoverIdx(Math.max(0, Math.min(idx, points.length - 1)));
    },
    [points.length],
  );

  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  if (points.length === 0) {
    return <div class="sparkline-empty">No price data</div>;
  }

  if (points.length === 1) {
    const pt = points[0];
    return (
      <div class="price-chart-wrap">
        <div class="price-chart-single">
          <span class="price-chart-single-price">
            {formatPriceFn(pt.avgPrice)}
          </span>
          <span class="price-chart-single-date">{formatChartDate(pt.date)}</span>
        </div>
      </div>
    );
  }

  const prices = points.map((p) => p.avgPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const coords: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const x = PAD_X + ((W - PAD_X * 2) * i) / (points.length - 1);
    const y = H - PAD_Y - ((prices[i] - min) / range) * (H - PAD_Y * 2);
    coords.push({ x, y });
  }

  const linePath = smoothPath(coords);

  const fillPath =
    linePath +
    ` L${coords[coords.length - 1].x.toFixed(1)},${H} L${coords[0].x.toFixed(1)},${H} Z`;

  const hoverPt = hoverIdx != null ? points[hoverIdx] : null;
  const hoverCoord = hoverIdx != null ? coords[hoverIdx] : null;
  const extra = hoverPt && hoverIdx != null && tooltipExtra ? tooltipExtra(hoverPt, hoverIdx) : null;

  return (
    <div class="price-chart-wrap">
      <svg
        ref={svgRef}
        class="price-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(63,185,80,0.25)" />
            <stop offset="100%" stop-color="rgba(63,185,80,0)" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#chartGrad)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--accent)"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
        {hoverCoord && (
          <>
            <line
              x1={hoverCoord.x}
              y1={0}
              x2={hoverCoord.x}
              y2={H}
              stroke="var(--text-muted)"
              stroke-width="1"
              stroke-dasharray="2,2"
              vector-effect="non-scaling-stroke"
              opacity="0.5"
            />
            <circle
              cx={hoverCoord.x}
              cy={hoverCoord.y}
              r="4"
              fill="var(--accent)"
              stroke="var(--bg-surface)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {hoverPt && hoverCoord && (
        <div
          class="price-chart-tooltip"
          style={{
            left: `${(hoverCoord.x / W) * 100}%`,
            top: `${(hoverCoord.y / H) * 100}%`,
          }}
        >
          <div class="price-chart-tooltip-inner">
            <span class="price-chart-tooltip-date">
              {formatChartDate(hoverPt.date)}
            </span>
            <span class="price-chart-tooltip-price">
              {formatPriceFn(hoverPt.avgPrice)}
            </span>
            {extra && (
              <span class="price-chart-tooltip-extra">{extra}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
