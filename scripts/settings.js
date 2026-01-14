export const MODULE_ID = "indy-route";

export const DEFAULTS = {
  lineColor: "#d61f1f",
  lineAlpha: 0.95,
  lineWidth: 6,
  dashLength: 20,
  gapLength: 14,
  scaleWithMap: true,
  scaleMultiplier: 1,
  cinematicMovement: false,
  showEndX: true,
  renderAboveTokens: false,

  dotColor: "#f7f0e6",
  dotRadius: 6,
  showDot: true,
  dotTokenUuid: "",
  dotTokenRotate: false,
  dotTokenScale: 1,
  dotTokenRotateOffset: 0,
  routeSound: "",

  drawSpeed: 400,
  lingerMs: -1,          // -1 = persist until cleared
  sampleStepPx: 10,

  introMs: 1500,
  pauseMs: 1500,
  cameraZoomFactor: 0.3,
  cameraSmooth: 0.15,
  tokenUpdateMs: 25,

  smoothingMode: "catmull", // "none" | "catmull" | "chaikin"

  catmullSamplesPerSegment: 16,
  catmullAlpha: 0.5
};

export function getViewPixelSizeForScale(scale) {
  const screen = canvas?.app?.renderer?.screen;
  if (screen?.width && screen?.height && scale > 0) {
    return { width: screen.width / scale, height: screen.height / scale };
  }
  return null;
}

export function getMapPixelSize() {
  const scene = canvas?.scene;
  if (!scene) return null;

  const scale = canvas?.stage?.scale?.x ?? canvas?.stage?.worldTransform?.a ?? 1;
  const viewSize = getViewPixelSizeForScale(scale);
  if (viewSize) return viewSize;

  const dims = scene.dimensions ?? canvas?.dimensions;
  const width =
    dims?.sceneWidth ??
    scene.width ??
    dims?.width ??
    scene.background?.width ??
    null;
  const height =
    dims?.sceneHeight ??
    scene.height ??
    dims?.height ??
    scene.background?.height ??
    null;
  if (!width || !height) return null;
  return { width, height };
}

export function applyMapScaling(settings, sizeOverride) {
  if (!settings.scaleWithMap) return settings;
  const size = sizeOverride ?? getMapPixelSize();
  if (!size) return settings;
  const base = Math.max(size.width, size.height) / 300;
  const mult = Number.isFinite(settings.scaleMultiplier) ? settings.scaleMultiplier : 1;
  const safeMult = mult > 0 ? mult : 1;
  const n = base * safeMult;
  return {
    ...settings,
    lineWidth: Math.max(1, n),
    dotRadius: Math.max(1, n * 1.3),
    drawSpeed: Math.max(1,n * 25),
    sampleStepPx: Math.max(1, n)
  };
}

export function getStageScale() {
  return canvas?.stage?.scale?.x ?? canvas?.stage?.worldTransform?.a ?? 1;
}

export function getCameraScaleForPath(totalLen, zoomFactor = DEFAULTS.cameraZoomFactor) {
  const screen = canvas?.app?.renderer?.screen;
  if (!screen || !totalLen) return null;
  const screenMax = Math.max(screen.width, screen.height);
  const targetScale = ((2 * screenMax) / totalLen) * zoomFactor;
  const dims = canvas?.scene?.dimensions ?? canvas?.dimensions;
  const sceneWidth =
    dims?.sceneWidth ??
    canvas?.scene?.width ??
    dims?.width ??
    null;
  const sceneHeight =
    dims?.sceneHeight ??
    canvas?.scene?.height ??
    dims?.height ??
    null;
  const sceneMinScale = (sceneWidth && sceneHeight)
    ? Math.max(screen.width / sceneWidth, screen.height / sceneHeight)
    : 0.2;
  const minScale = Math.max(0.2, sceneMinScale);
  const maxScale = 3;
  return Math.min(maxScale, Math.max(minScale, targetScale));
}

export function getSettings() {
  const s = applyMapScaling(game.settings.get(MODULE_ID, "routeSettings"));
  const toNum = (hex) => parseInt(hex.replace("#","0x"));
  return {
    ...s,
    lineColorNum: toNum(s.lineColor),
    dotColorNum: toNum(s.dotColor)
  };
}

export function applyColorNumbers(settings) {
  const toNum = (hex) => parseInt(hex.replace("#","0x"));
  return {
    ...settings,
    lineColorNum: toNum(settings.lineColor),
    dotColorNum: toNum(settings.dotColor)
  };
}

export function normalizeSettings(s) {
  const num = (v) => (v === "" || v === null || v === undefined) ? v : Number(v);
  const step = num(s.sampleStepPx);
  const dash = num(s.dashLength);
  const gap = num(s.gapLength);
  return {
    ...s,
    lineAlpha: num(s.lineAlpha),
    lineWidth: num(s.lineWidth),
    dashLength: Number.isFinite(dash) && dash > 0 ? dash : null,
    gapLength: Number.isFinite(gap) && gap > 0 ? gap : null,
    dotRadius: num(s.dotRadius),
    drawSpeed: num(s.drawSpeed),
    lingerMs: num(s.lingerMs),
    sampleStepPx: Number.isFinite(step) ? Math.max(1, step) : step,
    scaleMultiplier: num(s.scaleMultiplier),
    catmullSamplesPerSegment: num(s.catmullSamplesPerSegment),
    catmullAlpha: num(s.catmullAlpha),
    introMs: num(s.introMs),
    pauseMs: num(s.pauseMs),
    cameraZoomFactor: num(s.cameraZoomFactor),
    cameraSmooth: num(s.cameraSmooth),
    tokenUpdateMs: num(s.tokenUpdateMs),
    showDot: !!s.showDot,
    dotTokenUuid: s.dotTokenUuid ?? "",
    dotTokenRotate: !!s.dotTokenRotate,
    dotTokenScale: num(s.dotTokenScale),
    dotTokenRotateOffset: num(s.dotTokenRotateOffset),
    routeSound: s.routeSound ?? "",
    showEndX: !!s.showEndX,
    renderAboveTokens: !!s.renderAboveTokens,
    scaleWithMap: !!s.scaleWithMap,
    cinematicMovement: !!s.cinematicMovement
  };
}
