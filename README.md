![](https://img.shields.io/badge/Foundry-v13-informational) 
![GitHub Latest Version](https://img.shields.io/github/v/release/jwrpalmer99/indy-route?sort=semver)
![GitHub All Releases](https://img.shields.io/github/downloads/jwrpalmer99/indy-route/module.zip)


# Indy Route

Draw and animate Indiana Jones-style travel routes on the canvas. Routes can be saved per scene, replayed, edited, exported, and shared (synchronized) to players. The module is designed for quick GM use during play: sketch a route, polish the style, and broadcast a cinematic path for everyone to watch. Calculate travel times and costs (D&D5e travel modes (incl Eberron) are provided but fully configurable.



https://github.com/user-attachments/assets/e20d94f5-456e-4a79-8bc0-243ff58b41bd



## Features
- Draw routes with smoothing, resampling, and animated playback.
- Per-scene route manager: save, rename, edit points, style, play, delete.
- Cinematic camera movement (optional) with intro/pause timing.
- Map-scaled line/dot/speed with a multiplier for consistent look across maps.
- Optional end marker, dot, and token-follow support.
- Control over many display properties that you can change from defaults.
- Play a sound during playback (fade out at finish).
- Travel mode tooltips with time and cost estimates.
- Configurable travel modes and currency conversions.
- Export/import routes as JSON for backup or reuse.

## Install
Install as a Foundry module and enable it in your world.
Use module settings to configure the initial settings of newly drawn routes 
A Route Manager button appears in the Drawing controls (GM only), along with a Clear Routes button.

Routes are stored per scene using scene flags.

<img height="110" alt="toolbar_small" src="https://github.com/user-attachments/assets/cb8ce4eb-afab-4d6e-b41c-31e2daeb6584" />

## Quick Start
1. Open **Route Manager** from the Drawing tools.
2. Click **Draw New Route**.
3. Left-click to place points, Backspace to remove last, Enter/Right-click to finish.
4. The route is saved in the current scene, you can preview, edit, change style or delete it.
5. Click **Play** to animate for all users - it will be sent via sockets and play in sync for all users.
6. Admire the route!
7. Click **Clear Routes** in the Drawing tools - this will clear all routes from the scene for all players.


<img height="348" alt="route_manager" src="https://github.com/user-attachments/assets/a33ccbaf-2e75-4273-b3d5-1abf52329d5d" />

## Route Manager
- **Play**: Broadcasts the animation to all users.
- **Preview**: Plays the animation just for you.
- **Edit**: Continue editing points for the route (Backspace can delete previous points still).
- **Style**: Open the settings dialog for that route.
- **Clear**: Clears any played/previewed animations of that route.
- **Delete**: Removes the route after confirmation.

- **Export Routes**: Downloads all routes for the current scene.
- **Import Routes**: Replaces current scene routes with a JSON file.

Routes are stored on the scene as a flag: `scene.getFlag("indy-route", "routes")`.

## Settings (Route Tools)
### General
- **Scale Line/Dot/Speed by Map Size**: scales width, dot, draw speed, resample step by view size.
- **Scale Multiplier**: multiplies the above scaling (default 1).
- **Cinematic Movement**: pan/zoom the camera during playback - players will be panned/zoomed to the start
- **Playback Sound**: sound path or UUID to play during animation.
- **Travel Mode**: enables distance/time/cost estimates in tooltips (distance treated as miles).
- **Fare Tier**: choose first/standard/steerage for tiered fares.
- **Render Above Tokens**: draw line/dot/marker above tokens.

### Line
- **Line Color**: colour of the line.
- **Line Alpha**: opacity of the line.
- **Line Width**: width of the line.
- **Show End X**: toggle the end marker.

### Dot
- **Show Dot**: toggle dot during animation.
- **Dot Color**: colour of the dot.
- **Dot Radius**: radius of the dot.
- **Dot Token UUID**: attach a sprite/token at dot position (drag/drop Actor/Token or paste UUID). 
- **Rotate Token With Path**: rotate Actor sprite to face movement direction.
- **Actor Scale Multiplier**: scale Actor sprite relative to dot size - (Token uses its normal scaling setting).
- **Actor Rotation Offset (deg)**: additional rotation offset for sprite - (Token uses its normal rotation lock setting).

### Animation
- **Draw Speed (px/sec)**: speed of line drawing.
- **Persist (lingerMs)**: -1 persists, 0 removes immediately after animation, >0 lingers for ms.
- **Resample Step (px)**: spacing for resampled points - smaller value is smoother animation.

### Camera
- **Intro Pan Duration (ms)**: time to pan/zoom to start.
- **Pause Before Draw (ms)**: delay before line starts.
- **Camera Zoom Factor**: smaller = more zoomed out.
- **Camera Smoothness**: lower = smoother but more lag.
- **Token Update Rate (ms)**: how often token movement is synced to others.

### Smoothing
- **None**: raw points.
- **Catmull–Rom**: smooth spline through points.
- **Chaikin**: rounded corners.

## Editing a Route
Use **Edit** to continue adding points to a route (Backspace removes prior points, as it does when initially drawing route). 
Use **Style** to change the visual and animation settings for that route, the route preview will change immediately but will not persist unless you click Save.

## Export/Import
Exported files include all routes in the current scene:
```json
{
  "sceneId": "...",
  "exportedAt": 1700000000000,
  "routes": [ ... ]
}
```
Import replaces the current scene routes.

## Notes
- Routes are scene-specific.
- If a sound is set, it plays at animation start and fades out at the end.
- Token-follow uses a token UUID and moves the actual token during playback - you can use this if you want to use Fog of War etc.
- Token will be snapped to the starting position before animation playback begins.
- Use an Actor if you don't want to add a token to the map that is actually moved but still want the image.
- Travel time/cost uses full days plus a partial-day remainder (priced by hour).
- The module will attempt to use system/world currencies if they provide conversions; otherwise it falls back to gp/sp/cp.
- By default, the travel mode list includes D&D 5e walking speeds and common modes of transport from Eberron (can be customized).

## Module Settings
- **Configure Route Tools**: defaults for new routes.
- **Configure Travel Modes**: add/edit travel speeds and fares used in tooltips.
- **Configure Currency Conversions**: override currency breakdown conversions used for costs.
- **Ignore Currencies**: comma-separated currency keys to omit from the breakdown (default `ep,pp`).

## Troubleshooting
- If scale-based values seem off, use **Capture Map Scale** in the route Style dialog.
