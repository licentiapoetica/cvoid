# cvoid

Fly through an endless generative void in the browser, after the PlayStation 2 system menu:
fog, drifting motes, glass orbs, towers of cubes. Space is a grid of sectors, and each unseen
sector is dreamt up by Claude: its name, palette, geometry, noise recipe, drone, the words
hanging in the fog, and the GLSL function that becomes its sky.

## Run

    npm install
    export ANTHROPIC_API_KEY=sk-ant-...   # or put it in .env
    npm start                             # http://127.0.0.1:5173

Without a key the game still runs: sectors come from a local deterministic generator instead.

Controls:

- Mouse and keyboard: mouse look, `W A S D` fly, `Space` / `C` rise and sink, `Shift` surge,
  `[` `]` look sensitivity, `I` invert vertical look, `M` mute.
  `F` goes fullscreen. Outside fullscreen the browser keeps its own shortcuts, so `Ctrl+W`
  (close tab) and `Ctrl+Shift+W` (close window) still work mid-flight; the game makes the
  browser ask before leaving. In fullscreen on Chromium those keys go to the game, and
  left `Ctrl` can be used to sink.
- Controller: left stick fly, right stick look, right / left trigger rise and sink,
  `A` (cross) or left-stick click surge, d-pad left / right sensitivity, `X` (square) invert,
  `Y` (triangle) mute. Any button starts the game.
- Map: `Tab` (controller: select) opens the map of every sector seen so far, one horizontal
  layer at a time; `Page Up` / `Page Down` (bumpers) step through layers.
- Touch: drag to look, hold a second finger to fly forward.

## How Claude is used

The browser only ever sends integer sector coordinates to `GET /api/sector`. The server
(`server.js`) asks Claude for a structured sector spec and caches it in `.cache/sectors/`,
so a sector is paid for once and is the same place every time you return. Delete that
folder to get a new void.

Only the sector you are in and the two you are looking toward are requested. The answer is
streamed: the abstract geometry appears as soon as that part is written, the floating
text and the sky follow when the rest arrives.

## The entity

Something else is out there. After about half a minute of flight it starts to make itself
known: a pale light at the edge of the fog that retreats when approached, lights gathering
behind you that vanish when you turn, a blackout, a silence, a trail of light, a few words.
Sooner or later it names a sector and says it will wait there. The coordinates appear in the
HUD and on the map. It will not be there, but arriving opens the next chapter and it speaks
differently the further you follow it.

What it does and says is decided by Claude (`POST /api/entity`) from what you have actually
been doing: minutes flown, sectors crossed, the names of the places you passed, whether you
are standing still. One short call roughly every minute of flight. Progress (chapter, what it
has said) is kept in the browser's local storage; `CVOID_MAX_BEATS` caps the calls per server run.

## What sectors are made of

- Up to three layers of abstract geometry: 17 layouts (towers, lattice, shell, tendrils,
  maze, city, stairs, fracture, ...) built from 10 solids, with stretch, symmetry, tilt and spin.
- Optionally a blueprint: something built on purpose (a house, a street, a monument, a
  dream-distorted homage to something from film, games, music or television), which Claude
  writes in a small parts language (`public/src/structures.js`, `buildBlueprint`).
- Each sector request carries a roll of dice suggesting a layout, a solid and a subject, so
  the void does not keep reaching for the same few ideas.

One layout, `recursion`, contains itself: the same shell of pieces repeated inside itself.
Near its centre flight slows in proportion to the distance left, and a traveller who gets very
close is moved one level back out, which is invisible because the thing is self-similar. The
descent never ends; turn around to leave.

The picture listens to the sound. Bass swells the nebula and the orbs, mid frequencies brighten
every edge, highs make the motes flare, and each beat of the sector's heartbeat (`sound.pulse`,
`sound.tempo`) makes the geometry swell and the accent pieces flash. `B` switches the listening
to the microphone, so music playing in the room drives it instead.

The world also has geography (`public/src/population.js`): a slow noise over the grid makes
dense regions, thin ones where Claude is told to place almost nothing, and voids several
sectors across. Voids are never sent to Claude: they cost nothing, appear instantly, and hold
only a little dust and very thin fog. Roughly a third of space is void.

Sectors dreamt before these existed stay as they were. Delete `.cache/sectors/` for a
completely new void, or just fly somewhere unexplored.

## Coordinates

Nothing is random per visit. Sectors sit on an integer grid, 1600 units apart (`public/src/constants.js`): `x` east,
`y` up, `z` south, with the origin hub at `0, 0, 0`. The HUD shows the sector you are in and
your offset from its centre. A sector Claude has dreamt is stored as
`.cache/sectors/<x>_<y>_<z>.json` and is the same place for everyone using that server, forever.
`GET /api/sectors` returns the whole list as JSON.

| Variable | Default | |
|---|---|---|
| `PORT` | `5173` | |
| `CVOID_HOST` | `127.0.0.1` | bind address |
| `CVOID_MODEL` | `claude-opus-5-5` | |
| `CVOID_EFFORT` | `low` | higher = slower, more considered sectors |
| `CVOID_FAST` | off | `1` = Opus fast mode (twice the price; needs account access) |
| `CVOID_CACHE` | `.cache/sectors` | where dreamt sectors are stored |
| `CVOID_MAX_SECTORS` | `300` | cap on new Claude sectors per server run |
| `CVOID_MAX_BEATS` | `600` | cap on entity turns per server run |

## Layout

- `server.js`: static files, the sector endpoint, the prompt and schema
- `public/src/world.js`: sector grid, structure generators, sky, materialization
- `public/src/structures.js`: solids, layouts, blueprints
- `public/src/entity.js`: the entity and its acts
- `public/src/map.js`: the sector map overlay
- `public/src/spec.js`: origin hub, local fallback generator, spec clamping
- `public/src/shaders.js`: noise library and all GLSL
- `public/src/audio.js`: synthesized drone, shimmer and wind
