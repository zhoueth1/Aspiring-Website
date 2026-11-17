const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smootherstep = (a: number, b: number, p: number) => {
  const t = Math.min(Math.max((p - a) / (b - a), 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Pull back gradually before rotating; all framing is reversible and continuous. */
export function getCastingFrame(progress: number, aspect: number, reducedMotion = false) {
  const approach = reducedMotion ? 0 : smootherstep(.07, .22, progress);
  const retreat = reducedMotion ? 1 : smootherstep(.36, .95, progress);
  const reveal = reducedMotion ? 1 : smootherstep(.48, .95, progress);
  const pullout = reducedMotion ? 1 : smootherstep(.76, .99, progress);
  const span = lerp(lerp(11.8, 6.1, approach), 15.8, retreat);
  const footprint = lerp(4.3, 8.5, retreat);
  const halfHeight = Math.max(span / 2, footprint / Math.max(aspect, .1));
  const pivotY = lerp(6.7 - approach * 1.05, 4.6, reveal);
  return { reveal, pullout, halfHeight, pivotY, pivotZ: reveal * 3.3 };
}
