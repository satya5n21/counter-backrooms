# Counter-Rooms

A browser FPS set in a warm, peaceful golden-hour backrooms. You survive waves of soft-glowing
entities in a hand-built arena of sunlit galleries, a pillared atrium and quiet lounges.

Everything is generated in code: textures are painted on canvases, models are built from
primitives, and all sound and music is synthesised with Web Audio. There are no asset files.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` outputs a static site to `dist/`.

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
| `src/core/` | Game loop and states, input and pointer lock, settings, post-processing (bloom, colour grade) |
| `src/world/` | Map layout (`mapData.js`), level building, collision, ray casts, pathfinding, sky, light shafts, dust |
| `src/player/` | First-person movement and camera |
| `src/weapons/` | Pistol, rifle and shotgun: hitscan, recoil, reloads, viewmodels |
| `src/ai/` | Bot behaviour, aiming and light-bolt projectiles |
| `src/game/` | Wave director and pickups |
| `src/ui/`, `src/audio/` | HUD, menus, generated audio |

To change the arena, edit the character grid in `src/world/mapData.js`. The legend is at the top of the file.
