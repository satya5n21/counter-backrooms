# Counter-Rooms

A browser FPS set in a warm, peaceful golden-hour backrooms. You survive waves of soft-glowing
entities in a hand-built arena of sunlit galleries, a pillared atrium and quiet lounges.

The world uses downloaded PBR textures, 3D models and an HDRI sky (see [Assets](#assets)).
Sound and music are synthesised with Web Audio. Without the asset files the game still runs,
using its original generated textures and primitive models.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` outputs a static site to `dist/` (about 225 MB,
almost all of it `assets/`).

Open http://localhost:5173/?lite for the original look without downloading any assets.

## Controls

| Action | Keys |
|---|---|
| Move / sprint / jump | WASD · Shift · Space |
| Aim / fire | Mouse · Left click (the rifle fires while held) |
| Reload | R |
| Switch weapon | 1 / 2 / 3, mouse wheel, Q for the last weapon |
| Pause | Esc or P |

## Difficulty

Difficulty changes **bot aim and reactions** (aim spread, time to react, how fast they turn,
how much they lead their shots) and **bot health and damage**. Within a game, every wave
pushes these a little further and adds more bots.

| | Easy | Normal | Hard |
|---|---|---|---|
| Aim spread | wide | moderate | tight |
| Reaction time | 0.95 s | 0.55 s | 0.28 s |
| Leads your movement | no | partly | mostly |
| Health / damage | 55 / 5 | 85 / 8 | 125 / 12 |

Bot types: **Drifters** (standard), **Wisps** (fast and fragile, from wave 3) and
**Wardens** (slow and tanky, fire 3 bolts at once, from wave 5).

All tuning lives in [`src/config.js`](src/config.js).

## Code map

| Path | What it does |
|---|---|
| `src/core/` | Asset loading, game loop and states, input and pointer lock, settings, post-processing (bloom, colour grade) |
| `src/world/` | Map layout (`mapData.js`), level building, materials, props, collision, ray casts, pathfinding, sky, light shafts, dust |
| `src/player/` | First-person movement and camera |
| `src/weapons/` | Pistol, rifle and shotgun: hitscan, recoil, reloads, viewmodels (`Viewmodels.js` for the models and arms) |
| `src/ai/` | Bot behaviour, aiming and light-bolt projectiles |
| `src/game/` | Wave director and pickups |
| `src/ui/`, `src/audio/` | HUD, menus, generated audio |

To change the arena, edit the character grid in `src/world/mapData.js`. The legend is at the top of the file.

## Assets

Files the game loads live in `public/assets/` and are listed in `MANIFEST` in
[`src/core/Assets.js`](src/core/Assets.js). The loading screen downloads them all at startup.
Any file that fails to load falls back to the generated version of that surface, prop or weapon.

| Folder | Contents |
|---|---|
| `textures/` | ambientCG PBR sets (colour, OpenGL normal, roughness, AO). The wallpaper gets its yellow stripes, and the carpet and ceiling their colour, in [`src/world/Materials.js`](src/world/Materials.js). |
| `models/weapons/`, `models/arms/` | First-person guns and arms. Size, grip point, screen position and arm poses are in `GUNS` and `ARM_POSES` in [`src/weapons/Viewmodels.js`](src/weapons/Viewmodels.js). |
| `models/props/` | Furniture, vents and ceiling lights, fitted to real-world sizes in `Level._templates()`. |
| `hdri/` | Sunset sky seen through the windows, also used for reflections. It is rotated so its sun matches the in-game sun. |

`asset-sources/` (outside `public/`, so it never ships) keeps the original zips, Blender files,
DirectX normal maps, displacement maps and the two unused texture sets.

Credits and licences are in [CREDITS.md](CREDITS.md) and on the in-game Credits screen. Most
models are CC BY 4.0, which requires that credit. The rifle uses the Sketchfab Standard licence,
which forbids sharing the model file on its own.
