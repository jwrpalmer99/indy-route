import { DEFAULTS, getCameraScaleForPath } from "./settings.js";
import { IndyRouteLabelRenderer } from "./label-renderer.js";

function panToPosition(x, y, scale) {
  if (canvas?.pan) return canvas.pan({ x, y, scale });
  if (canvas?.animatePan) return canvas.animatePan({ x, y, scale, duration: 0 });
}

const labelRenderer = new IndyRouteLabelRenderer();

export const IndyRouteRenderer = {
  ensureRoot() {
    window.__indyRouteBroadcast ??= { containers: [], preview: null, previewRouteId: null };
    return window.__indyRouteBroadcast;
  },

  clearLocal() {
    const root = this.ensureRoot();
    for (const entry of root.containers) {
      const c = entry?.container ?? entry;
      try { c.destroy({ children: true }); } catch {}
    }
    root.containers.length = 0;
    this.clearPreview();
  },

  clearRoute(routeId) {
    if (!routeId) return;
    const root = this.ensureRoot();
    for (let i = root.containers.length - 1; i >= 0; i--) {
      const entry = root.containers[i];
      if (entry?.routeId !== routeId) continue;
      const c = entry?.container ?? entry;
      try { c.destroy({ children: true }); } catch {}
      root.containers.splice(i, 1);
    }
    if (root.preview && root.previewRouteId === routeId) {
      try { root.preview.destroy({ children: true }); } catch {}
      root.preview = null;
      root.previewRouteId = null;
    }
  },

  clearPreview() {
    const root = this.ensureRoot();
    if (root.preview) {
      try { root.preview.destroy({ children: true }); } catch {}
      root.preview = null;
    }
    root.previewRouteId = null;
  },

  distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  },

  createRouteContainer(settings) {
    const container = new PIXI.Container();
    container.sortableChildren = true;
    container.zIndex = 999999;

    const preferAbove = settings?.renderAboveTokens;
    const layer = preferAbove
      ? (canvas.effects ?? canvas.foreground ?? canvas.primary)
      : canvas.primary;
    layer.sortableChildren = true;
    layer.addChild(container);

    const finalLine = new PIXI.Graphics(); finalLine.zIndex = 2; container.addChild(finalLine);
    const dot = new PIXI.Graphics();      dot.zIndex = 3; container.addChild(dot);

    return { container, finalLine, dot };
  },

  drawDot(dot, x, y, settings, angleRad) {
    if (!dot) return;
    const container = dot?.parent;
    if (!settings.showDot) {
      dot?.clear?.();
      if (container?.indyRouteTokenSprite) container.indyRouteTokenSprite.visible = false;
      return;
    }
    this.ensureTokenSprite(container, settings);
    if (container?.indyRouteTokenState === "ready" && container.indyRouteTokenSprite) {
      const sprite = container.indyRouteTokenSprite;
      sprite.visible = true;
      sprite.position.set(x, y);
      const scaleMult = Number.isFinite(settings.dotTokenScale) ? settings.dotTokenScale : 1;
      const size = settings.dotRadius * 2 * scaleMult;
      const tex = sprite.texture;
      const base = Math.max(tex?.width || 1, tex?.height || 1);
      const scale = size / base;
      sprite.scale.set(scale);
      if (settings.dotTokenRotate && Number.isFinite(angleRad)) {
        const offsetDeg = Number.isFinite(settings.dotTokenRotateOffset)
          ? settings.dotTokenRotateOffset
          : 0;
        const offsetRad = (offsetDeg * Math.PI) / 180;
        sprite.rotation = angleRad + offsetRad;
      } else {
        sprite.rotation = 0;
      }
      dot?.clear?.();
      return;
    }
    if (settings.dotTokenUuid && container?.indyRouteTokenState !== "failed") {
      dot?.clear?.();
      return;
    }
    dot.clear();
    dot.beginFill(settings.dotColorNum, 1.0);
    dot.drawCircle(x, y, settings.dotRadius);
    dot.endFill();
  },

  drawEndX(container, x, y, settings, size = 20) {
    if (settings.showEndX === false) return;
    const g = new PIXI.Graphics();
    g.lineStyle({
      width: settings.lineWidth * 2,
      color: settings.lineColorNum,
      alpha: settings.lineAlpha,
      cap: PIXI.LINE_CAP.ROUND
    });
    g.moveTo(x - size, y - size); g.lineTo(x + size, y + size);
    g.moveTo(x + size, y - size); g.lineTo(x - size, y + size);
    container.addChild(g);
  },

  drawDashedSegment(graphics, a, b, dashState, dashLen = 20, gapLen = 14) {
    const segLen = this.distance(a, b);
    if (segLen <= 1e-6) return;
    const patternLen = dashLen + gapLen;
    const dx = (b.x - a.x) / segLen;
    const dy = (b.y - a.y) / segLen;

    let remaining = segLen;
    let t = 0;
    while (remaining > 0) {
      const offset = dashState.offset % patternLen;
      const inDash = offset < dashLen;
      const step = inDash ? Math.min(dashLen - offset, remaining) : Math.min(patternLen - offset, remaining);
      if (inDash) {
        const x0 = a.x + dx * t;
        const y0 = a.y + dy * t;
        const x1 = a.x + dx * (t + step);
        const y1 = a.y + dy * (t + step);
        graphics.moveTo(x0, y0);
        graphics.lineTo(x1, y1);
      }
      t += step;
      remaining -= step;
      dashState.offset = (dashState.offset + step) % patternLen;
    }
  },

  getDashPattern(settings) {
    const width = Number.isFinite(settings?.lineWidth) ? settings.lineWidth : 1;
    const dashSetting = Number.isFinite(settings?.dashLength) && settings.dashLength > 0 ? settings.dashLength : null;
    const gapSetting = Number.isFinite(settings?.gapLength) && settings.gapLength > 0 ? settings.gapLength : null;
    return {
      dashLen: dashSetting ? dashSetting : Math.max(20, width * 2),
      gapLen: gapSetting ? gapSetting : Math.max(14, width * 1.6)
    };
  },

  ensureTokenSprite(container, settings) {
    if (!container || !settings.dotTokenUuid) return;
    if (container.indyRouteTokenState) return;
    container.indyRouteTokenState = "loading";
    this.resolveTokenTexture(settings.dotTokenUuid)
      .then((texture) => {
        if (!texture || container.destroyed) {
          container.indyRouteTokenState = "failed";
          return;
        }
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.zIndex = 3;
        container.addChild(sprite);
        container.indyRouteTokenSprite = sprite;
        container.indyRouteTokenState = "ready";
      })
      .catch(() => {
        container.indyRouteTokenState = "failed";
      });
  },

  async resolveTokenTexture(uuid) {
    const root = this.ensureRoot();
    root.tokenCache ??= new Map();
    if (root.tokenCache.has(uuid)) return root.tokenCache.get(uuid);

    let texture = null;
    try {
      const doc = await fromUuid(uuid);
      const src =
        doc?.texture?.src ||
        doc?.prototypeToken?.texture?.src ||
        doc?.actor?.prototypeToken?.texture?.src ||
        doc?.img ||
        null;
      if (src) texture = await loadTexture(src);
    } catch {}

    root.tokenCache.set(uuid, texture);
    return texture;
  },

  async resolveRouteToken(uuid) {
    if (!uuid) return null;
    try {
      const doc = await fromUuid(uuid);
      let tokenDoc = null;
      if (doc?.documentName === "Token") {
        tokenDoc = doc;
      } else if (doc?.document?.documentName === "Token") {
        tokenDoc = doc.document;
      } else if (doc?.documentName === "Actor") {
        const tokens = doc.getActiveTokens?.(true, true) ?? doc.getActiveTokens?.() ?? [];
        tokenDoc = tokens[0]?.document ?? null;
      }
      if (!tokenDoc) return null;
      if (tokenDoc.parent?.id && canvas?.scene?.id && tokenDoc.parent.id !== canvas.scene.id) return null;
      return tokenDoc;
    } catch {
      return null;
    }
  },

  async resolveRouteSound(value) {
    if (!value) return null;
    const root = this.ensureRoot();
    root.soundCache ??= new Map();
    if (root.soundCache.has(value)) return root.soundCache.get(value);

    let src = null;
    try {
      if (value.includes(".") && !value.includes("/") && !value.includes("\\")) {
        const doc = await fromUuid(value);
        src = doc?.path || doc?.src || doc?.sound?.path || null;
      } else {
        src = value;
      }
    } catch {
      src = value;
    }

    root.soundCache.set(value, src);
    return src;
  },

  moveTokenMarker(tokenDoc, x, y) {
    const tokenObj = tokenDoc?.object ?? tokenDoc?._object;
    const topLeft = this.getTokenTopLeft(tokenDoc, x, y);
    if (tokenObj?.setPosition) {
      tokenObj.setPosition(topLeft);
      return;
    }
    if (!tokenObj) return;
    tokenObj.x = topLeft.x;
    tokenObj.y = topLeft.y;
    tokenObj.refresh?.();
  },

  getTokenTopLeft(tokenDoc, x, y) {
    const tokenObj = tokenDoc?.object ?? tokenDoc?._object;
    let w = tokenObj?.w;
    let h = tokenObj?.h;
    if ((!w || !h) && tokenDoc?.width && tokenDoc?.height && canvas?.grid?.size) {
      w = tokenDoc.width * canvas.grid.size;
      h = tokenDoc.height * canvas.grid.size;
    }
    const dx = (w || 0) / 2;
    const dy = (h || 0) / 2;
    return { x: x - dx, y: y - dy };
  },

  render(payload) {
    if (!canvas?.ready) {
      Hooks.once("canvasReady", () => this.render(payload));
      return;
    }
    const { sceneId, path, settings, startTime, lingerMs, routeId, labelText } = payload ?? {};
    if (game.scenes.current?.id !== sceneId) return;
    if (!Array.isArray(path) || path.length < 2) return;

    const root = this.ensureRoot();
    const { container, finalLine, dot } = this.createRouteContainer(settings);
    const entry = { container, routeId: routeId ?? null };
    root.containers.push(entry);

    let totalLen = 0;
    for (let i = 0; i < path.length - 1; i++) totalLen += this.distance(path[i], path[i + 1]);
    const duration = Math.max(0.05, totalLen / settings.drawSpeed);
    const start = path[0];
    const end = path[path.length - 1];
    const zoomFactor = Number.isFinite(settings.cameraZoomFactor) ? settings.cameraZoomFactor : DEFAULTS.cameraZoomFactor;
    const cameraScale = getCameraScaleForPath(totalLen, zoomFactor);
    const canAnimateCamera = settings.cinematicMovement && !!canvas?.animatePan && !!cameraScale;
    const introMs = canAnimateCamera
      ? (Number.isFinite(settings.introMs) ? settings.introMs : DEFAULTS.introMs)
      : 0;
    const pauseMs = canAnimateCamera
      ? (Number.isFinite(settings.pauseMs) ? settings.pauseMs : DEFAULTS.pauseMs)
      : 0;
    const startTimeAdjusted = startTime + introMs + pauseMs;

    finalLine.clear();
    finalLine.lineStyle({
      width: settings.lineWidth,
      color: settings.lineColorNum,
      alpha: settings.lineAlpha,
      cap: PIXI.LINE_CAP.ROUND,
      join: PIXI.LINE_JOIN.ROUND
    });

    const marker = { tokenDoc: null, lastDocUpdate: 0, snapReady: false };
    const snapTokenToStart = () => {
      if (!marker.tokenDoc) return false;
      this.moveTokenMarker(marker.tokenDoc, start.x, start.y);
      if (game.user.isGM) {
        const topLeft = this.getTokenTopLeft(marker.tokenDoc, start.x, start.y);
        marker.tokenDoc.update(topLeft, { animate: false }).catch(() => {});
      }
      return true;
    };
    if (settings.dotTokenUuid) {
      this.resolveRouteToken(settings.dotTokenUuid).then((tokenDoc) => {
        marker.tokenDoc = tokenDoc;
        if (marker.snapReady) snapTokenToStart();
      });
    }
    const updateMarker = (x, y, angleRad) => {
      if (marker.tokenDoc) {
        this.moveTokenMarker(marker.tokenDoc, x, y);
        if (game.user.isGM) {
          const intervalMs = Number.isFinite(settings.tokenUpdateMs)
            ? settings.tokenUpdateMs
            : DEFAULTS.tokenUpdateMs;
          const nowMs = Date.now();
          if (nowMs - marker.lastDocUpdate > intervalMs) {
            marker.lastDocUpdate = nowMs;
            const topLeft = this.getTokenTopLeft(marker.tokenDoc, x, y);
            marker.tokenDoc.update(topLeft, { animate: false }).catch(() => {});
          }
        }
        dot.clear();
        return;
      }
      this.drawDot(dot, x, y, settings, angleRad);
    };

    const dashState = { offset: 0 };
    const dash = this.getDashPattern(settings);
    const deferTokenSnap = !!settings.dotTokenUuid && canAnimateCamera && introMs > 0;
    if (deferTokenSnap) {
      setTimeout(() => {
        marker.snapReady = true;
        snapTokenToStart();
      }, introMs);
    } else {
      updateMarker(start.x, start.y, 0);
    }

    const cumulative = [0];
    for (let i = 1; i < path.length; i++) {
      cumulative[i] = cumulative[i - 1] + this.distance(path[i - 1], path[i]);
    }

    const pointAt = (t) => {
      const targetLen = t * totalLen;
      let i = 1;
      while (i < cumulative.length && cumulative[i] < targetLen) i++;
      if (i >= path.length) return end;
      const prevLen = cumulative[i - 1];
      const segLen = Math.max(1e-6, cumulative[i] - prevLen);
      const segT = (targetLen - prevLen) / segLen;
      const a = path[i - 1];
      const b = path[i];
      return { x: a.x + (b.x - a.x) * segT, y: a.y + (b.y - a.y) * segT };
    };

    const easeInOut = (t) => t * t * (3 - 2 * t);
    const now = Date.now();
    let elapsed = Math.max(0, (now - startTimeAdjusted) / 1000);
    const shouldAnimateCamera = canAnimateCamera && elapsed < duration;
    if (shouldAnimateCamera) {
      canvas.animatePan({ x: start.x, y: start.y, scale: cameraScale, duration: introMs });
    }

    const finish = () => {
      dot.clear();
      const end = path[path.length - 1];
      this.drawEndX(container, end.x, end.y, settings, settings.lineWidth * 2);
      labelRenderer.drawLabel(container, path, settings, labelText);

      // lingerMs: >0 remove after ms; otherwise persist
      if (typeof lingerMs === "number" && lingerMs > 0) {
        setTimeout(() => {
          try { container.destroy({ children: true }); } catch {}
          const i = root.containers.findIndex((e) => (e?.container ?? e) === container);
          if (i >= 0) root.containers.splice(i, 1);
        }, lingerMs);
      }
    };

    let soundHandle = null;
    let soundPromise = null;

    const startAnimation = () => {
      const ticker = canvas.app.ticker;
      const cam = { x: start.x, y: start.y };
      if (settings.routeSound) {
        soundPromise = this.resolveRouteSound(settings.routeSound).then((src) => {
          if (!src) return null;
          try {
            return foundry.audio?.AudioHelper?.play?.({ src, autoplay: true, loop: false });
          } catch {
            return null;
          }
        }).then((sound) => {
          soundHandle = sound ?? null;
          return soundHandle;
        });
      }

      // fast-forward
      let idx = 1;
      dashState.offset = 0;
      const t0 = Math.min(1, elapsed / duration);
      const targetIndex0 = Math.floor(t0 * (path.length - 1)) + 1;
      while (idx <= targetIndex0 && idx < path.length) {
        this.drawDashedSegment(finalLine, path[idx - 1], path[idx], dashState, dash.dashLen, dash.gapLen);
        const prev = path[idx - 1];
        const curr = path[idx];
        const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
        updateMarker(curr.x, curr.y, angle);
        idx += 1;
      }

      if ((elapsed / duration) >= 1) {
        // DRAW FULL LINE FIRST
        dashState.offset = 0;
        for (let i = 1; i < path.length; i++) {
          this.drawDashedSegment(finalLine, path[i - 1], path[i], dashState, dash.dashLen, dash.gapLen);
        }

        finish();
        return;
      }

      const onTick = (delta) => {
        if (container?.destroyed || finalLine?.destroyed || dot?.destroyed) {
          ticker.remove(onTick);
          return;
        }
        elapsed += delta / 60;

        const t = Math.min(1, elapsed / duration);
        const tSmooth = easeInOut(t);
        if (shouldAnimateCamera) {
          const p = pointAt(tSmooth);
          const smoothBase = Number.isFinite(settings.cameraSmooth)
            ? settings.cameraSmooth
            : DEFAULTS.cameraSmooth;
          const alpha = 1 - Math.pow(1 - smoothBase, delta);
          cam.x += (p.x - cam.x) * alpha;
          cam.y += (p.y - cam.y) * alpha;
          panToPosition(cam.x, cam.y, cameraScale);
        }
        const targetIndex = Math.floor(t * (path.length - 1)) + 1;

        while (idx <= targetIndex && idx < path.length) {
          this.drawDashedSegment(finalLine, path[idx - 1], path[idx], dashState, dash.dashLen, dash.gapLen);
          const prev = path[idx - 1];
          const curr = path[idx];
          const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
          updateMarker(curr.x, curr.y, angle);
          idx += 1;
        }

        if (t >= 1) {
          ticker.remove(onTick);
          if (marker.tokenDoc && game.user.isGM) {
            const topLeft = this.getTokenTopLeft(marker.tokenDoc, end.x, end.y);
            marker.tokenDoc.update(topLeft);
          }
          const fadeMs = 500;
          if (soundHandle?.fade) {
            soundHandle.fade(0, fadeMs);
          } else if (soundPromise) {
            soundPromise.then((sound) => sound?.fade?.(0, fadeMs));
          } else if (soundHandle?.stop) {
            soundHandle.stop();
          }
          if (shouldAnimateCamera) panToPosition(end.x, end.y, cameraScale);
          finish();
        }
      };

      ticker.add(onTick);
    };

    if (now < startTimeAdjusted) {
      setTimeout(startAnimation, Math.max(0, startTimeAdjusted - now));
    } else {
      startAnimation();
    }
  },

  renderStatic(path, settings, routeId, labelText) {
    if (!canvas?.ready) return;
    if (!Array.isArray(path) || path.length < 2) return;
    this.clearPreview();

    const root = this.ensureRoot();
    const { container, finalLine, dot } = this.createRouteContainer(settings);
    root.preview = container;
    root.previewRouteId = routeId ?? null;

    finalLine.clear();
    finalLine.lineStyle({
      width: settings.lineWidth,
      color: settings.lineColorNum,
      alpha: settings.lineAlpha,
      cap: PIXI.LINE_CAP.ROUND,
      join: PIXI.LINE_JOIN.ROUND
    });

    const dashState = { offset: 0 };
    const dash = this.getDashPattern(settings);
    for (let i = 1; i < path.length; i++) {
      this.drawDashedSegment(finalLine, path[i - 1], path[i], dashState, dash.dashLen, dash.gapLen);
    }

    dot.clear();
    const end = path[path.length - 1];
    this.drawEndX(container, end.x, end.y, settings, settings.lineWidth * 2);
    labelRenderer.drawLabel(container, path, settings, labelText);
  },

  async persistRouteToTile(path, settings, { includeEndX = true, labelText = "" } = {}) {
    if (!canvas?.ready || !canvas?.scene) return null;
    if (!Array.isArray(path) || path.length < 2) return null;
    const renderer = canvas.app?.renderer;
    if (!renderer) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of path) {
      if (!point) continue;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;

    const pad = Math.max(10, (settings?.lineWidth ?? 1) * 2 + 4);
    const width = Math.max(1, Math.ceil(maxX - minX + pad * 2));
    const height = Math.max(1, Math.ceil(maxY - minY + pad * 2));
    const offsetX = -minX + pad;
    const offsetY = -minY + pad;
    const offsetPath = path.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));

    const container = new PIXI.Container();
    const line = new PIXI.Graphics();
    line.lineStyle({
      width: settings.lineWidth,
      color: settings.lineColorNum,
      alpha: settings.lineAlpha,
      cap: PIXI.LINE_CAP.ROUND,
      join: PIXI.LINE_JOIN.ROUND
    });
    container.addChild(line);

    const dashState = { offset: 0 };
    const dash = this.getDashPattern(settings);
    for (let i = 1; i < offsetPath.length; i++) {
      this.drawDashedSegment(line, offsetPath[i - 1], offsetPath[i], dashState, dash.dashLen, dash.gapLen);
    }

    if (includeEndX) {
      const end = offsetPath[offsetPath.length - 1];
      this.drawEndX(container, end.x, end.y, settings, settings.lineWidth * 2);
    }
    await labelRenderer.drawLabel(container, offsetPath, settings, labelText);

    const renderTexture = PIXI.RenderTexture.create({ width, height });
    renderer.render(container, { renderTexture, clear: true });
    const extractCanvas = renderer.extract.canvas(renderTexture);
    renderTexture.destroy(true);
    container.destroy({ children: true });

    if (!extractCanvas) return null;
    let textureSrc = null;
    const folder = "indy-route";
    const fileName = `indy-route-${foundry.utils.randomID()}.png`;
    try {
      if (foundry.utils?.ImageHelper?.uploadBase64) {
        await FilePicker.createDirectory("data", folder).catch(() => {});
        const dataUrl = extractCanvas.toDataURL("image/png");
        const upload = await foundry.utils.ImageHelper.uploadBase64(dataUrl, { folder, filename: fileName });
        textureSrc = upload?.path ?? upload ?? textureSrc;
      } else if (FilePicker?.upload) {
        await FilePicker.createDirectory("data", folder).catch(() => {});
        const blob = await new Promise((resolve) => extractCanvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Failed to create PNG blob.");
        const file = new File([blob], fileName, { type: blob.type || "image/png" });
        const upload = await FilePicker.upload("data", folder, file, {});
        textureSrc = upload?.path ?? upload ?? textureSrc;
      }
    } catch {
      textureSrc = null;
    }
    if (!textureSrc) return null;
    const tileData = {
      x: minX - pad,
      y: minY - pad,
      width,
      height,
      texture: { src: textureSrc },
      locked: true
    };
    const created = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
    return created?.[0] ?? null;
  }
};
