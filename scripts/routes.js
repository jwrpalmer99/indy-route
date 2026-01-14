import {
  MODULE_ID,
  DEFAULTS,
  applyMapScaling,
  applyColorNumbers,
  getMapPixelSize,
  normalizeSettings
} from "./settings.js";
import { chaikin, catmullRom } from "./smoothing.js";

function routeDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function resample(points, stepPx) {
  if (points.length < 2) return points.slice();
  if (!Number.isFinite(stepPx) || stepPx <= 0) return points.slice();
  const out = [points[0]];
  let carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const segLen = routeDistance(a, b);
    if (segLen === 0) continue;
    const dx = (b.x - a.x) / segLen;
    const dy = (b.y - a.y) / segLen;
    let dist = stepPx - carry;
    while (dist <= segLen) {
      out.push({ x: a.x + dx * dist, y: a.y + dy * dist });
      dist += stepPx;
    }
    carry = segLen - (dist - stepPx);
    if (carry === stepPx) carry = 0;
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (!tail || routeDistance(tail, last) > 1e-6) out.push({ x: last.x, y: last.y });
  return out;
}

export function buildRouteFromPoints(points, baseSettings) {
  const s = normalizeSettings(baseSettings);
  let smooth;
  switch (s.smoothingMode) {
    case "none":
      smooth = points.slice();
      break;
    case "chaikin":
      smooth = chaikin(points, s.chaikinIterations);
      break;
    case "catmull":
    default:
      smooth = catmullRom(points, s.catmullSamplesPerSegment, s.catmullAlpha);
      break;
  }

  const sizeOverride = s.scaleMapSize && s.scaleMapSize.width && s.scaleMapSize.height
    ? s.scaleMapSize
    : null;
  const scaledSettings = s.scaleWithMap ? applyMapScaling(s, sizeOverride) : s;

  const colored = applyColorNumbers(scaledSettings);
  const path = resample(smooth, colored.sampleStepPx);
  return { path, settings: colored, smoothPoints: smooth };
}

export function getSceneRoutes(scene = canvas?.scene) {
  if (!scene) return [];
  return foundry.utils.deepClone(scene.getFlag(MODULE_ID, "routes") ?? []);
}

export async function setSceneRoutes(routes, scene = canvas?.scene) {
  if (!scene) return;
  await scene.setFlag(MODULE_ID, "routes", routes);
}

export function createRouteRecord(points, baseSettings, name) {
  const now = Date.now();
  let settings = normalizeSettings(baseSettings);
  if (settings.scaleWithMap && !settings.scaleMapSize) {
    const mapSize = getMapPixelSize();
    if (mapSize) {
      settings = {
        ...settings,
        scaleMapSize: { width: mapSize.width, height: mapSize.height }
      };
    }
  }
  return {
    id: foundry.utils.randomID(),
    name: name || `Route ${now}`,
    points: points.map((p) => ({ x: p.x, y: p.y })),
    settings,
    createdAt: now,
    updatedAt: now
  };
}
