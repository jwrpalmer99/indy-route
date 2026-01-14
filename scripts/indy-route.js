import { MODULE_ID, DEFAULTS } from "./settings.js";
import { CHANNEL } from "./constants.js";
import { IndyRouteRenderer } from "./renderer.js";
import { IndyRouteTool } from "./tool.js";
import { IndyRouteManager } from "./apps/manager.js";
import { IndyRouteSettingsApp } from "./apps/settings-app.js";

/* -------------------------------------------- */
/* Settings registration + menu                 */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "routeSettings", {
    name: "Route Settings",
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULTS
  });

  game.settings.registerMenu(MODULE_ID, "routeSettingsMenu", {
    name: "Route Tools",
    label: "Configure Route Tools",
    hint: "Configure the route drawing animation settings.",
    icon: "fas fa-route",
    type: IndyRouteSettingsApp,
    restricted: true
  });
});

/* -------------------------------------------- */
/* Scene controls buttons (2 buttons)           */
/* -------------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  // Add to Drawings controls if present; otherwise add to Tokens
  const drawings = controls.drawings ?? controls.tokens;

  drawings.tools.indyRouteStart = {
    name: "indyRouteStart",
    title: "Route Manager",
    icon: "fa-solid fa-route",
    button: true,
    visible: game.user.isGM,
    onClick: () => IndyRouteManager.show()
  };

  drawings.tools.indyRouteClear = {
    name: "indyRouteClear",
    title: "Clear Routes",
    icon: "fa-solid fa-eraser",
    button: true,
    visible: game.user.isGM,
    onClick: () => IndyRouteTool.clearAllBroadcast()
  };
});

/* -------------------------------------------- */
/* Socket: render + clear                       */
/* -------------------------------------------- */

Hooks.once("ready", () => {
  game.socket.on(CHANNEL, (data) => {
    if (!data) return;

    if (data.type === "INDY_ROUTE") IndyRouteRenderer.render(data.payload);
    if (data.type === "INDY_CLEAR_ROUTE") IndyRouteRenderer.clearRoute(data.payload?.routeId);
    if (data.type === "INDY_CLEAR") IndyRouteRenderer.clearLocal();
  });
});
