import assert from "node:assert/strict";

globalThis.window = {};
const events = [];
globalThis.Hooks = {
  callAll: (name, payload) => events.push({ name, payload })
};

const { IndyRouteRenderer } = await import("../scripts/renderer.js");
const calls = { pause: 0, play: 0, stop: 0 };
const state = {
  started: false,
  paused: false,
  pausedAt: null,
  pausedMs: 0,
  soundHandle: {
    pause: () => calls.pause++,
    play: async () => calls.play++,
    stop: async () => calls.stop++
  }
};

window.__indyRouteBroadcast = {
  containers: [],
  preview: null,
  previewRouteId: null,
  activeRoutes: new Map([["route-1", state]])
};

assert.equal(IndyRouteRenderer.pauseRoute("route-1"), false);
assert.equal(calls.pause, 0);

state.started = true;
assert.equal(IndyRouteRenderer.pauseRoute("route-1"), true);
assert.equal(state.paused, true);
assert.equal(calls.pause, 1);

assert.equal(IndyRouteRenderer.resumeRoute("route-1"), true);
assert.equal(state.paused, false);
assert.equal(calls.play, 1);

IndyRouteRenderer.clearRoute("route-1");
assert.equal(calls.stop, 1);
assert.equal(IndyRouteRenderer.isRouteActive("route-1"), false);
assert.equal(events.length, 3);

console.log("playback state checks passed");
