import { MODULE_ID, DEFAULTS, DEFAULT_TRAVEL_MODES } from "./settings.js";
import { CHANNEL } from "./constants.js";
import { IndyRouteRenderer } from "./renderer.js";
import { IndyRouteTool } from "./tool.js";
import { IndyRouteManager } from "./apps/manager.js";
import { IndyRouteSettingsApp } from "./apps/settings-app.js";
import { IndyRouteTravelModesApp } from "./apps/travel-modes.js";
import { IndyRouteCurrenciesApp } from "./apps/currencies.js";

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

  game.settings.register(MODULE_ID, "travelModes", {
    name: "Travel Modes",
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_TRAVEL_MODES
  });

  game.settings.register(MODULE_ID, "currencyConversions", {
    name: "Currency Conversions",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.registerMenu(MODULE_ID, "routeSettingsMenu", {
    name: "Route Tools",
    label: "Configure Route Tools",
    hint: "Configure the route drawing animation settings.",
    icon: "fas fa-route",
    type: IndyRouteSettingsApp,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "travelModesMenu", {
    name: "Travel Modes",
    label: "Configure Travel Modes",
    hint: "Configure travel speeds and fares used in route tooltips.",
    icon: "fas fa-route",
    type: IndyRouteTravelModesApp,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "currencyConversionsMenu", {
    name: "Currency Conversions",
    label: "Configure Currency Conversions",
    hint: "Override currency conversions used in route cost breakdowns.",
    icon: "fas fa-coins",
    type: IndyRouteCurrenciesApp,
    restricted: true
  });

  game.settings.register(MODULE_ID, "ignoreCurrencies", {
    name: "Ignore Currencies",
    hint: "Comma-separated currency keys to omit from cost breakdowns.",
    scope: "world",
    config: true,
    type: String,
    default: "ep,pp"
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
