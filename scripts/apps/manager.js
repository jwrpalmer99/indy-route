import { MODULE_ID, DEFAULTS, normalizeSettings } from "../settings.js";
import { CHANNEL } from "../constants.js";
import { IndyRouteRenderer } from "../renderer.js";
import { IndyRouteTool } from "../tool.js";
import { buildRouteFromPoints, createRouteRecord, getSceneRoutes, setSceneRoutes } from "../routes.js";
import { IndyRouteEditor } from "./settings-app.js";

export class IndyRouteManager extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static PARTS = {
    root: { id: "root", template: `modules/${MODULE_ID}/templates/route-manager.hbs`, root: true }
  };

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "indy-route-manager",
    window: { title: "Indy Route Manager", resizable: true },
    position: { width: 540, height: 500 },
    classes: ["indy-route", "indy-route-manager"]
  }, { inplace: false });

  static show() {
    this._instance ??= new IndyRouteManager();
    return this._instance.render(true);
  }

  constructor(options = {}) {
    super(options);
    this.selectedId = null;
  }

  async _prepareContext() {
    const routes = getSceneRoutes();
    return {
      routes,
      selectedId: this.selectedId
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    // handled in _attachPartListeners for ApplicationV2 parts
  }

  _attachPartListeners(partId, html, options) {
    super._attachPartListeners(partId, html, options);
    if (partId !== "root") return;

    const root = (this.element instanceof HTMLElement) ? this.element : this.element?.[0] ?? html;
    const content = root?.querySelector(".window-content") ?? root;

    if (this._managerClickHandler && content?.removeEventListener) {
      content.removeEventListener("click", this._managerClickHandler, true);
    }
    this._managerClickHandler = (event) => {
      if (event.target?.closest?.("input, textarea, select")) return;
      const draw = event.target?.closest?.("[data-action='draw-route']");
      if (draw) {
        event.preventDefault();
        this._drawRoute();
        return;
      }
      const exportBtn = event.target?.closest?.("[data-action='export-routes']");
      if (exportBtn) {
        event.preventDefault();
        this._exportRoutes();
        return;
      }
      const importBtn = event.target?.closest?.("[data-action='import-routes']");
      if (importBtn) {
        event.preventDefault();
        this._importRoutes();
        return;
      }
      const play = event.target?.closest?.("[data-action='play-route']");
      if (play) {
        event.preventDefault();
        event.stopPropagation();
        this._playRoute(play.dataset.routeId);
        return;
      }
      const preview = event.target?.closest?.("[data-action='preview-route']");
      if (preview) {
        event.preventDefault();
        event.stopPropagation();
        this._previewPlayback(preview.dataset.routeId);
        return;
      }
      const editPoints = event.target?.closest?.("[data-action='edit-points']");
      if (editPoints) {
        event.preventDefault();
        event.stopPropagation();
        this._editRoutePoints(editPoints.dataset.routeId);
        return;
      }
      const edit = event.target?.closest?.("[data-action='edit-route']");
      if (edit) {
        event.preventDefault();
        event.stopPropagation();
        this._editRoute(edit.dataset.routeId);
        return;
      }
      const del = event.target?.closest?.("[data-action='delete-route']");
      if (del) {
        event.preventDefault();
        event.stopPropagation();
        this._deleteRoute(del.dataset.routeId);
        return;
      }
      const clear = event.target?.closest?.("[data-action='clear-route']");
      if (clear) {
        event.preventDefault();
        event.stopPropagation();
        this._clearRoute(clear.dataset.routeId);
        return;
      }
      const select = event.target?.closest?.("[data-action='select-route']");
      if (select) {
        event.preventDefault();
        this._selectRoute(select.dataset.routeId);
      }
    };
    content?.addEventListener("click", this._managerClickHandler, true);

    if (this._renameHandler && content?.removeEventListener) {
      content.removeEventListener("change", this._renameHandler, true);
    }
    this._renameHandler = (event) => {
      const rename = event.target?.closest?.("[data-action='rename-route']");
      if (!rename) return;
      event.stopPropagation();
      this._renameRoute(rename.dataset.routeId, rename.value);
    };
    content?.addEventListener("change", this._renameHandler, true);
  }

  async close(options = {}) {
    IndyRouteRenderer.clearPreview();
    return super.close(options);
  }

  async _drawRoute() {
    const routes = getSceneRoutes();
    const defaultName = `Route ${routes.length + 1}`;

    IndyRouteTool.start({
      autoPlay: false,
      onComplete: async (data) => {
        const record = createRouteRecord(data.points, data.baseSettings, defaultName);
        routes.push(record);
        await setSceneRoutes(routes);
        this.selectedId = record.id;
        this._previewRoute(record);
        this.render(true);
      }
    });
  }

  _getRoute(routeId) {
    const routes = getSceneRoutes();
    return routes.find((route) => route.id === routeId);
  }

  _previewRoute(route) {
    if (!route?.points || route.points.length < 2) {
      IndyRouteRenderer.clearPreview();
      return;
    }
    const built = buildRouteFromPoints(route.points, route.settings);
    IndyRouteRenderer.renderStatic(built.path, built.settings, route.id);
  }

  async _selectRoute(routeId) {
    this.selectedId = routeId;
    const route = this._getRoute(routeId);
    if (route) this._previewRoute(route);
    this.render(true);
  }

  _playRoute(routeId) {
    const route = this._getRoute(routeId);
    if (!route?.points || route.points.length < 2) return;
    IndyRouteRenderer.clearRoute(routeId);
    game.socket.emit(CHANNEL, { type: "INDY_CLEAR_ROUTE", payload: { routeId } });
    const built = buildRouteFromPoints(route.points, route.settings);
    const payload = {
      sceneId: canvas.scene.id,
      path: built.path,
      settings: built.settings,
      startTime: Date.now(),
      lingerMs: built.settings.lingerMs,
      routeId
    };
    game.socket.emit(CHANNEL, { type: "INDY_ROUTE", payload });
    IndyRouteRenderer.render(payload);
  }

  _previewPlayback(routeId) {
    const route = this._getRoute(routeId);
    if (!route?.points || route.points.length < 2) return;
    IndyRouteRenderer.clearRoute(routeId);
    const built = buildRouteFromPoints(route.points, route.settings);
    const payload = {
      sceneId: canvas.scene.id,
      path: built.path,
      settings: built.settings,
      startTime: Date.now(),
      lingerMs: built.settings.lingerMs,
      routeId
    };
    IndyRouteRenderer.render(payload);
  }

  _clearRoute(routeId) {
    IndyRouteRenderer.clearRoute(routeId);
    game.socket.emit(CHANNEL, { type: "INDY_CLEAR_ROUTE", payload: { routeId } });
  }

  async _deleteRoute(routeId) {
    const routes = getSceneRoutes();
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;

    const escapeHtml = (value) => {
      if (foundry.utils.escapeHTML) return foundry.utils.escapeHTML(value);
      if (foundry.utils.escapeHtml) return foundry.utils.escapeHtml(value);
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };
    const dialogApi = foundry.applications?.api?.DialogV2 ?? Dialog;
    const confirmed = await dialogApi.confirm({
      title: "Delete Route",
      content: `<p>Delete <strong>${escapeHtml(route.name)}</strong>?</p>`
    });
    if (!confirmed) return;

    const nextRoutes = routes.filter((r) => r.id !== routeId);
    await setSceneRoutes(nextRoutes);
    if (this.selectedId === routeId) {
      this.selectedId = null;
      IndyRouteRenderer.clearPreview();
    }
    this.render(true);
  }

  async _renameRoute(routeId, name) {
    const routes = getSceneRoutes();
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;
    route.name = name?.trim() || route.name;
    route.updatedAt = Date.now();
    await setSceneRoutes(routes);
    this.render(true);
  }

  _exportRoutes() {
    const routes = getSceneRoutes();
    const payload = {
      sceneId: canvas?.scene?.id ?? null,
      exportedAt: Date.now(),
      routes
    };
    const fileName = `indy-route-${canvas?.scene?.id ?? "routes"}.json`;
    saveDataToFile(JSON.stringify(payload, null, 2), "application/json", fileName);
  }

  _importRoutes() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dialogApi = foundry.applications?.api?.DialogV2 ?? Dialog;
      const confirmed = await dialogApi.confirm({
        title: "Import Routes",
        content: "<p>Importing routes will overwrite existing routes for this scene. Continue?</p>"
      });
      if (!confirmed) return;
      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch (err) {
        ui.notifications.error("Invalid JSON file.");
        return;
      }
      const rawRoutes = Array.isArray(parsed?.routes) ? parsed.routes : (Array.isArray(parsed) ? parsed : []);
      const routes = rawRoutes
        .filter((r) => Array.isArray(r?.points) && r.points.length >= 2)
        .map((r) => ({
          id: r.id ?? foundry.utils.randomID(),
          name: (r.name ?? "Imported Route").toString(),
          points: r.points.map((p) => ({ x: Number(p.x), y: Number(p.y) })),
          settings: normalizeSettings({ ...DEFAULTS, ...(r.settings ?? {}) }),
          createdAt: r.createdAt ?? Date.now(),
          updatedAt: Date.now()
        }));
      await setSceneRoutes(routes);
      this.selectedId = null;
      IndyRouteRenderer.clearPreview();
      this.render(true);
      ui.notifications.info(`Imported ${routes.length} routes.`);
    }, { once: true });
    input.click();
  }

  _editRoutePoints(routeId) {
    const routes = getSceneRoutes();
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;

    IndyRouteTool.start({
      initialPoints: route.points,
      baseSettings: route.settings,
      autoPlay: false,
      onComplete: async (data) => {
        route.points = data.points.map((p) => ({ x: p.x, y: p.y }));
        route.updatedAt = Date.now();
        await setSceneRoutes(routes);
        this.selectedId = route.id;
        this._previewRoute(route);
        this.render(true);
      }
    });
  }

  _editRoute(routeId) {
    const routes = getSceneRoutes();
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;

    const editor = new IndyRouteEditor(route, {
      onSave: async (updated) => {
        const idx = routes.findIndex((r) => r.id === updated.id);
        if (idx >= 0) routes[idx] = updated;
        await setSceneRoutes(routes);
        this.selectedId = updated.id;
        this._previewRoute(updated);
        this.render(true);
      }
    });

    editor.render(true);
  }
}
