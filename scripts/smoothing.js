export function chaikin(points, iterations = 2, closed = false) {
  if (points.length < 3) return points.slice();
  let pts = points.slice();

  for (let it = 0; it < iterations; it++) {
    const out = [];
    const n = pts.length;

    if (!closed) out.push(pts[0]);

    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];

      const q = {
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y
      };
      const r = {
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y
      };

      out.push(q, r);
    }

    if (!closed) out.push(pts[n - 1]);
    pts = out;
  }

  return pts;
}

export function catmullRom(points, samplesPerSegment, alpha) {
  if (points.length < 2) return points.slice();
  const tj = (ti, pi, pj) => ti + Math.pow(Math.hypot(pj.x - pi.x, pj.y - pi.y), alpha);
  const out = [];
  const n = points.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];

    let t0 = 0;
    let t1 = tj(t0, p0, p1);
    let t2 = tj(t1, p1, p2);
    let t3 = tj(t2, p2, p3);
    const eps = 1e-6;
    if (Math.abs(t1 - t0) < eps) t1 = t0 + eps;
    if (Math.abs(t2 - t1) < eps) t2 = t1 + eps;
    if (Math.abs(t3 - t2) < eps) t3 = t2 + eps;

    if (i === 0) out.push({ x: p1.x, y: p1.y });

    for (let sIdx = 1; sIdx <= samplesPerSegment; sIdx++) {
      const t = t1 + (t2 - t1) * (sIdx / samplesPerSegment);

      const A1 = {
        x: (t1 - t) / (t1 - t0) * p0.x + (t - t0) / (t1 - t0) * p1.x,
        y: (t1 - t) / (t1 - t0) * p0.y + (t - t0) / (t1 - t0) * p1.y
      };
      const A2 = {
        x: (t2 - t) / (t2 - t1) * p1.x + (t - t1) / (t2 - t1) * p2.x,
        y: (t2 - t) / (t2 - t1) * p1.y + (t - t1) / (t2 - t1) * p2.y
      };
      const A3 = {
        x: (t3 - t) / (t3 - t2) * p2.x + (t - t2) / (t3 - t2) * p3.x,
        y: (t3 - t) / (t3 - t2) * p2.y + (t - t2) / (t3 - t2) * p3.y
      };

      const B1 = {
        x: (t2 - t) / (t2 - t0) * A1.x + (t - t0) / (t2 - t0) * A2.x,
        y: (t2 - t) / (t2 - t0) * A1.y + (t - t0) / (t2 - t0) * A2.y
      };
      const B2 = {
        x: (t3 - t) / (t3 - t1) * A2.x + (t - t1) / (t3 - t1) * A3.x,
        y: (t3 - t) / (t3 - t1) * A2.y + (t - t1) / (t3 - t1) * A3.y
      };

      out.push({
        x: (t2 - t) / (t2 - t1) * B1.x + (t - t1) / (t2 - t1) * B2.x,
        y: (t2 - t) / (t2 - t1) * B1.y + (t - t1) / (t2 - t1) * B2.y
      });
    }
  }
  return out;
}
