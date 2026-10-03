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

- Mouse and keyboard: mouse look, `W A S D` fly, `Enter` autofly (keeps flying forward until
  `Enter` again or `S`), `Space` / `C` rise and sink, `Shift` surge,
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

## marderchen's dimension

A tribute to marderchen: mechatronics technician, builder of glaring psychedelic LED light
organs and hand-soldered 0603 clocks, lover of cats and rainbows, who put all of his code on the
internet for anyone to use.

Fly straight up from the hub. In sector `0, 1, 0` there is a rainbow ring with a small vortex turning
in it. It is a portal: right in front of the ring it draws you the last stretch in, turns you a
little, and lets you out the other side into his dimension: the workshop he missed, given back without walls. Everything there is
an LED on a running rainbow, it all flashes in time to a small chiptune, his six-digit clock
shows the real time, his chaos generator runs, his cats follow him, and he himself scurries
about between it all and says things. The entity does not follow you in. The ring in his
workshop leads back out.

What is his own in there:

- His pixel avatar, his rainbow cat and his ASCII cat signature.
- His code, ported with his own function names (`public/src/marderchen.js`): `rainbowcalc()`
  colours the clock and the wall, `ratemal()` and its step table flash every LED on the beat at
  143 bpm, and the falling-pixel game from his 720x WS2812B matrix runs on the tall wall. The
  chaos generator from his homepage runs as he wrote it. The clock ticks with a relay.
- 251 of his source-code comments on the wall by the workbench, verbatim, each with the name of
  the file it comes from (`public/marderchen/kote.json`).
- The names of the places, taken from his project file names.

What he says is written by Claude from a persona that his friends keep: `persona/marderchen.md`,
put together from his whole site. It is not in this repository, and neither are the notes behind
it, his own "about me" text, or the mirror of his site (`persona/` and
`public/marderchen/about.txt` are ignored by git). The game works without them: he then speaks
only in sentences he really wrote, and the board for his "about me" stays empty.

### The museum

Behind his clock a vortex opens: a tunnel of turning rainbow arms with his art on its walls,
87 GIF animations, then 131 Flash pieces, then 31 photos of the 0603 clock being built. A slow
current carries you through while you face down the tunnel and lets go when you turn to a wall.
Look straight at a Flash piece, middle of the screen, for a second and a half and it starts
playing right there on the wall in [Ruffle](https://ruffle.rs); look away and it stops. `E`
(controller: `B`) opens any piece full screen: GIFs, photos, Flash. `E` or `Esc` goes back.
Pieces whose names say they flash never start by themselves. On the walls the pieces are shown
at half brightness, because some of them are very bright or flash; opened, they are as he made them.

### wuselcode: every file a place

The further out you fly in his dimension, the more of his code you find. Each `.txt` in his
`wuselcode` folder (174 programs) has one sector of its own, dealt out shell by shell
from the workshop: the sector is named after the file, laid out from what the file is (a
`WS2812` strip becomes a spiral, a clock becomes rings, a stroboscope a burst of shards, the
channel count sets its symmetry, the file's size its density), the comments he wrote in it hang
in the dark, and the file itself runs down a board, his comments in green.

### When he takes his dimension over

Only in his dimension, never out in the void: now and then (about once in a quarter of an hour
there, at random) he takes the place over for half a minute or so, and every few seconds does
something else with it. Every cat arrives and MEOW goes up in lights; or everything at once while
the world turns over; or the lights go out and he is right in front of you, enormous; or his
chaostyper closes round you where you stand; or nothing at all, and then one MEOW behind you.
Then it is as it was. (`cvoid.marderchen.goMad(cvoid.camera)` in the browser console sets it off.)

### MEOW, dark rooms, and what he does to the place

- The music. His homepage played a loop: "Break The Time Out" by JW86, which he had cut to
  loop. It fades in as you come through the portal and fades away as you leave, played from the
  mirror of his site (the track is JW86's and is not in this repository; without the mirror a
  small chiptune of ours plays instead). The lights flash to the beat heard in it.
- MEOW is in every place: rainbow letters built from his own "W" outline, his MEOW in ASCII art
  over the workshop, sixteen cats, and his own MEOW sound samples (`public/marderchen/meow*.wav`,
  rebuilt from the arrays in `MEOWing_stm_TEST.txt`), which he and the cats use constantly.
- One sector in seven is a void (there is always one to the west of the workshop). In it the
  dimension is gone: no rainbow, no music, no cats, no MEOW, not him. Only black walls, and on
  every wall his chaostyper (`textwriter.html`, ported line for line) writing its sentence,
  starting again, writing it. The maze has no edge; it comes round again however far you go. It
  lets go only of someone who surges (`Shift`).
- He changes the place as he goes: more rainbowpower, a re-rolled flash sequence, a meow
  chorus, fireworks, another optical sky, starflakes, a rainbow MEOW put up in front of you,
  lights off and on again. Claude picks one with each thing he says; left alone he does it anyway.
- On his workbench lies the old yellowed computer mouse he rebuilt into a vape, fired by
  clicking the mouse button. Now and then it clicks, and a little vapour rises.
- His own "Etwas zu meiner person" from his homepage hangs in the workshop, when it is present
  locally (see below).

The art is not in this repository. It is served from the mirror of his site in
`persona/marderchen/`, which git ignores (about 2 GB: his pages, code, Flash files, GIFs,
photos, and the music he listened to). To set the museum up on a fresh clone, put the mirror
there, or crawl it:

    mkdir -p persona/marderchen && cd persona/marderchen
    wget -r -l inf -nc -nH -e robots=off https://marderchen.totally.rip/
    cd ../.. && npm run museum          # thumbnails, web video of the GIFs (needs ffmpeg)
    npm start & npm run museum:thumbs   # pictures of the Flash pieces (needs Chromium)

Pieces whose names say they flash (he named some "epilepsy" himself) show a warning first. The
full-screen colour flashes in his avatar animation were left out and the dimension itself does
not strobe hard, but it is bright and pulses with the beat.

"its free use it or parts if you want =^.^="

## Coordinates

Nothing is random per visit. Sectors sit on an integer grid, 5200 units apart (`public/src/constants.js`): `x` east,
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
- `public/src/marderchen.js`, `public/src/museum.js`, `persona/`, `scripts/museum*.mjs`: marderchen's dimension, his museum and his persona
- `public/src/map.js`: the sector map overlay
- `public/src/spec.js`: origin hub, local fallback generator, spec clamping
- `public/src/shaders.js`: noise library and all GLSL
- `public/src/audio.js`: synthesized drone, shimmer and wind
