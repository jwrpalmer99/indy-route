import { DEFAULTS } from "./settings.js";
import { catmullRom } from "./smoothing.js";

export class IndyRouteLabelRenderer {
  distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  arrowRight = "->";
  arrowLeft = "<-";
  fontFaceCache = new Map();
  fontDataCache = new Map();

  getPrimaryFontFamily(fontFamily) {
    if (!fontFamily) return "";
    const first = fontFamily.split(",")[0] ?? "";
    return first.trim().replace(/^["']|["']$/g, "");
  }

  getFontMimeFromUrl(url) {
    if (!url) return "font/ttf";
    const clean = url.split("?")[0].toLowerCase();
    if (clean.endsWith(".woff2")) return "font/woff2";
    if (clean.endsWith(".woff")) return "font/woff";
    if (clean.endsWith(".ttf")) return "font/ttf";
    if (clean.endsWith(".otf")) return "font/otf";
    if (clean.endsWith(".svg")) return "image/svg+xml";
    return "font/ttf";
  }

  async getFontDataUrl(url) {
    if (!url) return "";
    if (this.fontDataCache.has(url)) return this.fontDataCache.get(url);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to load font");
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunk));
      }
      const b64 = btoa(binary);
      const mime = response.headers.get("content-type") || this.getFontMimeFromUrl(url);
      const dataUrl = `data:${mime};base64,${b64}`;
      this.fontDataCache.set(url, dataUrl);
      return dataUrl;
    } catch {
      this.fontDataCache.set(url, "");
      return "";
    }
  }

  async buildFontFaceCss(fontFamily) {
    const family = this.getPrimaryFontFamily(fontFamily);
    if (!family) return "";
    if (this.fontFaceCache.has(family)) return this.fontFaceCache.get(family);
    const defs = CONFIG?.fontDefinitions;
    if (!defs || typeof defs !== "object") return "";
    const target = family.toLowerCase();
    let def = null;
    for (const [key, value] of Object.entries(defs)) {
      const name = (value?.family ?? value?.fontFamily ?? key ?? "").toString();
      const lower = name.toLowerCase();
      if (lower === target || lower.includes(target)) {
        def = value;
        break;
      }
    }
    if (!def) {
      this.fontFaceCache.set(family, "");
      return "";
    }

    const safeFamily = family.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const toUrls = (src) => {
      if (!src) return [];
      if (Array.isArray(src)) return src.slice();
      if (typeof src === "string") return [src];
      if (typeof src === "object") {
        if (Array.isArray(src.urls)) return src.urls.slice();
        if (src.urls && typeof src.urls === "object") return Object.values(src.urls);
        if (Array.isArray(src.src)) return src.src.slice();
        if (src.src && typeof src.src === "object") return Object.values(src.src);
        if (src.url) return [src.url];
        if (src.path) return [src.path];
        if (src.file) return [src.file];
        if (src.files && typeof src.files === "object") return Object.values(src.files);
      }
      return [];
    };
    const normalizeUrl = (url) => {
      if (!url || typeof url !== "string") return "";
      const trimmed = url.trim();
      if (!trimmed) return "";
      if (/^(https?:|data:|blob:|file:)/i.test(trimmed)) return trimmed;
      try {
        return new URL(trimmed, window.location.href).toString();
      } catch {
        return trimmed;
      }
    };
    const toFormat = (url) => {
      const clean = url.split("?")[0].toLowerCase();
      if (clean.endsWith(".woff2")) return "woff2";
      if (clean.endsWith(".woff")) return "woff";
      if (clean.endsWith(".ttf")) return "truetype";
      if (clean.endsWith(".otf")) return "opentype";
      if (clean.endsWith(".svg")) return "svg";
      return "";
    };
    const buildSrc = async (urls) => {
      const entries = [];
      for (const url of urls) {
        const normalized = normalizeUrl(url);
        if (!normalized) continue;
        const dataUrl = await this.getFontDataUrl(normalized);
        if (!dataUrl) continue;
        const format = toFormat(normalized);
        entries.push(format ? `url("${dataUrl}") format("${format}")` : `url("${dataUrl}")`);
      }
      return entries.join(", ");
    };

    const fontEntries = Array.isArray(def?.fonts) && def.fonts.length ? def.fonts : [def];
    const faces = [];
    for (const entry of fontEntries) {
      const urls = toUrls(entry?.src ?? entry?.urls ?? entry?.url ?? entry?.path ?? entry?.file ?? entry?.files);
      if (!urls.length) continue;
      const weight = entry?.weight ?? def?.weight ?? "normal";
      const style = entry?.style ?? def?.style ?? "normal";
      const src = await buildSrc(urls);
      if (!src) continue;
      faces.push(
        `@font-face { font-family: '${safeFamily}'; src: ${src}; font-weight: ${weight}; font-style: ${style}; }`
      );
    }
    const css = faces.join("\n");
    this.fontFaceCache.set(family, css);
    return css;
  }

  smoothLabelPath(path, settings) {
    if (!Array.isArray(path) || path.length < 3) {
      return path ? path.slice() : [];
    }
    const baseSamples = Number.isFinite(settings?.catmullSamplesPerSegment)
      ? settings.catmullSamplesPerSegment
      : 16;
    const alpha = Number.isFinite(settings?.catmullAlpha) ? settings.catmullAlpha : 0.5;
    const labelSamples = Math.max(4, Math.round(baseSamples * 2));
    return catmullRom(path, labelSamples, alpha);
  }

  buildPathMetrics(path) {
    if (!Array.isArray(path) || path.length < 2) return null;
    const cumulative = [0];
    let totalLen = 0;
    for (let i = 1; i < path.length; i++) {
      const segLen = this.distance(path[i - 1], path[i]);
      totalLen += segLen;
      cumulative[i] = totalLen;
    }
    if (!Number.isFinite(totalLen) || totalLen <= 0) return null;
    return { cumulative, totalLen };
  }

  pointAtDistance(path, metrics, dist) {
    if (!metrics || !path?.length || path.length < 2) return null;
    const { cumulative, totalLen } = metrics;
    const target = Math.max(0, Math.min(totalLen, dist));
    let idx = 1;
    while (idx < cumulative.length && cumulative[idx] < target) idx++;
    if (idx >= path.length) idx = path.length - 1;
    const prevLen = cumulative[idx - 1];
    const segLen = Math.max(1e-6, cumulative[idx] - prevLen);
    const t = (target - prevLen) / segLen;
    const a = path[idx - 1];
    const b = path[idx];
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    return { x, y, angle };
  }

  pointAtDistanceOnly(path, metrics, dist) {
    if (!metrics || !path?.length || path.length < 2) return null;
    const { cumulative, totalLen } = metrics;
    const target = Math.max(0, Math.min(totalLen, dist));
    let idx = 1;
    while (idx < cumulative.length && cumulative[idx] < target) idx++;
    if (idx >= path.length) idx = path.length - 1;
    const prevLen = cumulative[idx - 1];
    const segLen = Math.max(1e-6, cumulative[idx] - prevLen);
    const t = (target - prevLen) / segLen;
    const a = path[idx - 1];
    const b = path[idx];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  getSmoothedAngleAtDistance(path, metrics, dist, smoothDist) {
    const fallback = this.pointAtDistance(path, metrics, dist);
    const half = Math.max(1, smoothDist);
    const before = this.pointAtDistanceOnly(path, metrics, dist - half);
    const after = this.pointAtDistanceOnly(path, metrics, dist + half);
    if (!before || !after) return fallback?.angle ?? 0;
    const angle = Math.atan2(after.y - before.y, after.x - before.x);
    return Number.isFinite(angle) ? angle : (fallback?.angle ?? 0);
  }

  normalizeAngle(angle) {
    if (!Number.isFinite(angle)) return 0;
    let a = angle;
    while (a <= -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    return a;
  }

  orientToScreen(angle) {
    let a = this.normalizeAngle(angle);
    if (Math.cos(a) < 0) a = this.normalizeAngle(a + Math.PI);
    return a;
  }

  unwrapAngle(angle, previous) {
    let a = this.normalizeAngle(angle);
    if (!Number.isFinite(previous)) return a;
    while (a - previous > Math.PI) a -= Math.PI * 2;
    while (a - previous < -Math.PI) a += Math.PI * 2;
    return a;
  }

  slicePathByDistance(path, metrics, startDist, endDist) {
    if (!metrics || !Array.isArray(path) || path.length < 2) return [];
    const start = Math.max(0, Math.min(metrics.totalLen, startDist));
    const end = Math.max(0, Math.min(metrics.totalLen, endDist));
    if (end <= start) return [];
    const out = [];
    const startPos = this.pointAtDistanceOnly(path, metrics, start);
    const endPos = this.pointAtDistanceOnly(path, metrics, end);
    if (!startPos || !endPos) return [];
    out.push(startPos);
    for (let i = 1; i < path.length - 1; i++) {
      const d = metrics.cumulative[i];
      if (d > start && d < end) out.push(path[i]);
    }
    out.push(endPos);
    return out;
  }

  getForwardRanges(path, metrics, dir) {
    if (!metrics || !Array.isArray(path) || path.length < 2) return [];
    const ranges = [];
    let rangeStart = null;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen <= 1e-6) continue;
      const dot = dx * dir.x + dy * dir.y;
      const segStart = metrics.cumulative[i - 1];
      const segEnd = metrics.cumulative[i];
      if (dot >= 0) {
        if (rangeStart === null) rangeStart = segStart;
      } else if (rangeStart !== null) {
        ranges.push({ start: rangeStart, end: segStart });
        rangeStart = null;
      }
      if (dot >= 0 && i === path.length - 1) {
        ranges.push({ start: rangeStart ?? segStart, end: segEnd });
        rangeStart = null;
      }
    }
    if (rangeStart !== null) {
      ranges.push({ start: rangeStart, end: metrics.totalLen });
    }
    return ranges.filter((r) => r.end - r.start > 1e-3);
  }

  pickForwardSpan(metrics, path, span, smoothDist) {
    let dirX = 1;
    let dirY = 0;
    const ranges = this.getForwardRanges(path, metrics, { x: dirX, y: dirY });
    if (!ranges.length) return null;
    const midDist = metrics.totalLen / 2;
    let best = null;
    let bestScore = Infinity;
    for (const range of ranges) {
      const len = range.end - range.start;
      if (len < span) continue;
      const center = (range.start + range.end) / 2;
      const score = Math.abs(center - midDist);
      if (score < bestScore) {
        bestScore = score;
        best = range;
      }
    }
    return best ?? null;
  }

  computeLabelSpanInfo(path, settings, labelText) {
    if (!settings?.showLabel) return null;
    const text = (labelText ?? "").toString().trim();
    if (!text) return null;
    const metrics = this.buildPathMetrics(path);
    if (!metrics) return null;
    const fontSize = Number.isFinite(settings.labelFontSize)
      ? settings.labelFontSize
      : Math.max(10, (settings.lineWidth ?? 1) * 2);
    const style = new PIXI.TextStyle({
      fontFamily: (settings.labelFontFamily ?? "Modesto Condensed, serif").toString(),
      fontSize
    });
    const showArrow = settings.labelShowArrow === true;
    const arrowRight = this.arrowRight;
    const arrowLeft = this.arrowLeft;
    const textWidth = Math.max(1, PIXI.TextMetrics.measureText(text, style).width);
    const spaceWidth = Math.max(1, PIXI.TextMetrics.measureText(" ", style).width);
    const arrowGap = Math.max(2, fontSize * 0.2);
    const arrowWidth = showArrow
      ? Math.max(
        1,
        PIXI.TextMetrics.measureText(arrowRight, style).width,
        PIXI.TextMetrics.measureText(arrowLeft, style).width
      )
      : 0;
    const gapSpaces = showArrow ? Math.max(1, Math.round(arrowGap / spaceWidth)) : 0;
    const totalWidth = textWidth + (showArrow ? arrowWidth + (gapSpaces * spaceWidth) : 0);
    if (!Number.isFinite(totalWidth) || totalWidth <= 0) return null;
    const labelPosition = Number.isFinite(settings.labelPosition) ? settings.labelPosition : 50;
    const clampedPosition = Math.min(100, Math.max(0, labelPosition));
    const centerDist = metrics.totalLen * (clampedPosition / 100);
    const widthScaleBase = Math.min(1, metrics.totalLen / totalWidth);
    const spanBase = totalWidth * widthScaleBase;
    const startBase = centerDist - (spanBase / 2);
    const endBase = centerDist + (spanBase / 2);
    const labelPathOriginal = this.slicePathByDistance(path, metrics, startBase, endBase);
    if (labelPathOriginal.length < 2) return null;
    const labelMetricsOriginal = this.buildPathMetrics(labelPathOriginal);
    if (!labelMetricsOriginal) return null;
    const widthScale = Math.min(1, labelMetricsOriginal.totalLen / totalWidth);
    const spanText = totalWidth * widthScale;
    const startDist = Math.max(0, Math.min(metrics.totalLen, startBase));
    return {
      metrics,
      totalWidth,
      spanText,
      startDist,
      labelPathOriginal,
      labelMetricsOriginal,
      gapSpaces
    };
  }

  async drawLabel(container, path, settings, labelText, options = {}) {
    if (!settings?.showLabel) return;
    const text = (labelText ?? "").toString().trim();
    if (!text) return;
    const startRoute = path?.[0];
    const endRoute = path?.[path.length - 1];
    const routeDx = (endRoute?.x ?? 0) - (startRoute?.x ?? 0);
    const arrowRight = this.arrowRight;
    const arrowLeft = this.arrowLeft;
    const travelRight = routeDx >= 0;
    const fontSize = Number.isFinite(settings.labelFontSize)
      ? settings.labelFontSize
      : Math.max(10, (settings.lineWidth ?? 1) * 2);
    const style = new PIXI.TextStyle({
      fontFamily: (settings.labelFontFamily ?? "Modesto Condensed, serif").toString(),
      fontSize,
      fill: settings.labelColorNum ?? settings.lineColorNum,
      stroke: 0x000000,
      strokeThickness: Math.max(2, Math.round(fontSize / 8)),
      align: "center",
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowBlur: 2,
      dropShadowDistance: 2
    });
    const metrics = this.buildPathMetrics(path);
    if (!metrics) return;
    const offset = Number.isFinite(settings.labelOffset) ? settings.labelOffset : 0;
    const baseFontSize = Number.isFinite(DEFAULTS.labelFontSize) ? DEFAULTS.labelFontSize : 18;
    const offsetScale = settings.scaleWithMap ? (fontSize / baseFontSize) : 1;
    const offsetPx = offset * offsetScale;
    const labelPosition = Number.isFinite(settings.labelPosition) ? settings.labelPosition : 50;
    const clampedPosition = Math.min(100, Math.max(0, labelPosition));
    const centerDist = metrics.totalLen * (clampedPosition / 100);
    const showArrow = settings.labelShowArrow === true;
    const initialAlpha = Number.isFinite(options.initialAlpha) ? options.initialAlpha : 1;
    const smoothDist = Math.max(4, fontSize * 0.6);
    if (!settings.labelFollowPath) {
      const mid = this.pointAtDistanceOnly(path, metrics, centerDist);
      if (!mid) return;
      const midPathAngle = this.getSmoothedAngleAtDistance(path, metrics, centerDist, smoothDist);
      const orientedAngle = this.orientToScreen(midPathAngle);
      const angleDelta = this.normalizeAngle(orientedAngle - midPathAngle);
      const arrowGlyph = Math.abs(angleDelta) > (Math.PI / 2) ? arrowLeft : arrowRight;
      const normalX = -Math.sin(midPathAngle);
      const normalY = Math.cos(midPathAngle);
      const x = mid.x + normalX * offsetPx;
      const y = mid.y + normalY * offsetPx;
      const labelLineText = showArrow
        ? (arrowGlyph === arrowRight ? `${text} ${arrowGlyph}` : `${arrowGlyph} ${text}`)
        : text;
      const labelTextSprite = new PIXI.Text(labelLineText, style);
      labelTextSprite.anchor.set(0.5);
      labelTextSprite.rotation = orientedAngle;
      labelTextSprite.position.set(x, y);
      labelTextSprite.zIndex = 4;
      labelTextSprite.alpha = initialAlpha;
      container.addChild(labelTextSprite);
      const labelLen = Math.max(1, PIXI.TextMetrics.measureText(labelLineText, style).width);
      return { display: labelTextSprite, length: labelLen };
    }


    const spanInfo = options.spanInfo;
    let totalWidth = null;
    let spanText = null;
    let labelPathOriginal = null;
    let labelMetricsOriginal = null;
    let gapSpaces = 0;
    if (spanInfo?.totalWidth && spanInfo?.labelPathOriginal && spanInfo?.labelMetricsOriginal) {
      totalWidth = spanInfo.totalWidth;
      spanText = spanInfo.spanText;
      labelPathOriginal = spanInfo.labelPathOriginal;
      labelMetricsOriginal = spanInfo.labelMetricsOriginal;
      gapSpaces = Number.isFinite(spanInfo.gapSpaces) ? spanInfo.gapSpaces : 0;
    } else {
      const textWidth = Math.max(1, PIXI.TextMetrics.measureText(text, style).width);
      const spaceWidth = Math.max(1, PIXI.TextMetrics.measureText(" ", style).width);
      const arrowGap = Math.max(2, fontSize * 0.2);
      const arrowWidth = showArrow
        ? Math.max(
          1,
          PIXI.TextMetrics.measureText(arrowRight, style).width,
          PIXI.TextMetrics.measureText(arrowLeft, style).width
        )
        : 0;
      gapSpaces = showArrow ? Math.max(1, Math.round(arrowGap / spaceWidth)) : 0;
      totalWidth = textWidth + (showArrow ? arrowWidth + (gapSpaces * spaceWidth) : 0);
      if (!Number.isFinite(totalWidth) || totalWidth <= 0) return;
      const widthScaleBase = Math.min(1, metrics.totalLen / totalWidth);
      const spanBase = totalWidth * widthScaleBase;
      const startBase = centerDist - (spanBase / 2);
      const endBase = centerDist + (spanBase / 2);
      labelPathOriginal = this.slicePathByDistance(path, metrics, startBase, endBase);
      if (labelPathOriginal.length < 2) return;
      labelMetricsOriginal = this.buildPathMetrics(labelPathOriginal);
      if (!labelMetricsOriginal) return;
      const widthScale = Math.min(1, labelMetricsOriginal.totalLen / totalWidth);
      spanText = totalWidth * widthScale;
    }
    const gapText = showArrow ? " ".repeat(gapSpaces) : "";
    if (!Number.isFinite(totalWidth) || totalWidth <= 0 || !labelPathOriginal || !labelMetricsOriginal) return;

    const displayReversed = labelPathOriginal[0].x > labelPathOriginal[labelPathOriginal.length - 1].x;
    const labelPathDisplay = displayReversed ? labelPathOriginal.slice().reverse() : labelPathOriginal;
    const labelPathSmooth = this.smoothLabelPath(labelPathDisplay, settings);
    const labelMetricsDisplay = this.buildPathMetrics(labelPathSmooth);
    if (!labelMetricsDisplay) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of labelPathSmooth) {
      if (!point) continue;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;

    const pad = Math.max(6, fontSize + Math.abs(offsetPx) + (settings.lineWidth ?? 1));
    const width = Math.max(1, Math.ceil(maxX - minX + pad * 2));
    const height = Math.max(1, Math.ceil(maxY - minY + pad * 2));
    const offsetX = -minX + pad;
    const offsetY = -minY + pad;
    const pathData = `M ${labelPathSmooth.map((p) => `${(p.x + offsetX).toFixed(2)} ${(p.y + offsetY).toFixed(2)}`).join(" L ")}`;

    const escapeXml = (value) => value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    const pathId = `indy-route-label-${foundry.utils.randomID()}`;
    const fill = settings.labelColor ?? "#ffffff";
    const stroke = "#000000";
    const strokeWidth = Math.max(1, Math.round(fontSize / 8));
    const textLength = spanText.toFixed(2);
    const metricsSample = PIXI.TextMetrics.measureText("Mg", style);
    const ascent = metricsSample?.fontProperties?.ascent ?? (fontSize * 0.8);
    const descent = metricsSample?.fontProperties?.descent ?? (fontSize * 0.2);
    const centerShift = (descent - ascent) / 2;
    const dy = Number.isFinite(offsetPx)
      ? (offsetPx + centerShift).toFixed(2)
      : centerShift.toFixed(2);
    const arrowGlyph = displayReversed ? arrowLeft : arrowRight;
    const textEsc = escapeXml(text);
    const gapEsc = escapeXml(gapText);
    const arrowEsc = escapeXml(arrowGlyph);
    const svgLabelText = showArrow
      ? (displayReversed
        ? `${arrowEsc}${gapEsc}${textEsc}`
        : `${textEsc}${gapEsc}${arrowEsc}`)
      : textEsc;
    const shadowDx = 2;
    const shadowDy = 2;
    const shadowBlur = 2;
    const fontFaceCss = await this.buildFontFaceCss(style.fontFamily);
    const fontFaceBlock = fontFaceCss ? `<style>${fontFaceCss}</style>` : "";
    const svg = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<defs>` +
      `<filter id="label-shadow" x="-50%" y="-50%" width="200%" height="200%">` +
      `<feDropShadow dx="${shadowDx}" dy="${shadowDy}" stdDeviation="${shadowBlur}" flood-color="#000000" flood-opacity="0.6"/>` +
      `</filter>` +
      `${fontFaceBlock}` +
      `</defs>` +
      `<path id="${pathId}" d="${pathData}" fill="none" stroke="none"/>` +
      `<text font-family="${escapeXml(style.fontFamily || "sans-serif")}" font-size="${fontSize}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke" dy="${dy}" filter="url(#label-shadow)" xml:space="preserve">` +
      `<textPath href="#${pathId}" startOffset="50%" text-anchor="middle" lengthAdjust="spacingAndGlyphs" textLength="${textLength}">${svgLabelText}</textPath>` +
      `</text></svg>`;
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const texture = PIXI.Texture.from(svgUrl);
    const sprite = new PIXI.Sprite(texture);
    sprite.position.set(minX - pad, minY - pad);
    sprite.zIndex = 4;
    sprite.alpha = initialAlpha;
    container.addChild(sprite);

    const baseTexture = texture?.baseTexture;
    if (baseTexture && !baseTexture.valid && baseTexture.once) {
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        baseTexture.once("loaded", finish);
        baseTexture.once("error", finish);
        setTimeout(finish, 500);
      });
    }
    return { display: sprite, length: spanText };
  }
}
