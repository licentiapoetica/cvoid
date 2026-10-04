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

- Mouse and keyboard: mouse look, `W A S D` fly, `Q` `E` roll, `Enter` autofly (keeps flying forward until
  `Enter` again or `S`), `Space` / `C` rise and sink, `Shift` surge,
  `[` `]` look sensitivity, `I` invert vertical look, `M` mute, `-` `=` volume (also a slider on the
  start screen and in the map's panel), `R` level out (upright again,
  horizon level, still heading the same way; in the zone it also turns you to the well).
  Hold the right mouse button to zoom in (about 2×, the view turning slower to match); let go
  to zoom back out. `F` goes fullscreen. Outside fullscreen the browser keeps its own shortcuts, so `Ctrl+W`
  (close tab) and `Ctrl+Shift+W` (close window) still work mid-flight; the game makes the
  browser ask before leaving. In fullscreen on Chromium those keys go to the game, and
  left `Ctrl` can be used to sink.
- Controller: left stick fly, right stick look, right / left trigger rise and sink,
  bumpers roll, `A` (cross) or left-stick click surge, d-pad up level out, d-pad left / right sensitivity, `X` (square) invert,
  `Y` (triangle) mute. Any button starts the game.
- Map: `Tab` (controller: select) opens the map of every sector you have been in (only those;
  remembered across visits), one horizontal layer at a time; `Page Up` / `Page Down` (bumpers) step
  through layers. Scroll zooms, out over thousands of sectors; drag moves the view; a click picks a
  spot and a double click goes there. Its panel takes an exact sector and offset (`go`), sets where
  you start (`start here`), goes somewhere at random in what the map shows, and finds you again.
  `O` or `origin` always takes you back to the hub, from any dimension, and starts you there again.
- Touch: drag to look, hold a second finger to fly forward.

What is built is solid: flying into a structure (or the zone's well) bounces you back off it with
a knock, louder the harder you hit. Two exceptions: a recursion, which is made to be flown into
forever, and marderchen's dark rooms, where his chaostyper's maze must let go of anyone who surges.

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

## The void

The void is someone too: an archivist. Everything ever made and let go comes to rest in it, and
it keeps all of it; the sectors are its rooms, the entity a thief in its archive. Its character is in `persona/void.md`, which you can edit (restart the
server to hear the change); like the rest of `persona/` it is kept out of the repository, and
without it the void dreams plainly and speaks only in its own few local lines. It colours every sector dreamt from then on (names, inscriptions,
whispers; sectors already dreamt stay as they were), and now and then, more seldom than the
entity, the void speaks to you itself: a few words forming in the fog, written by Claude
(`POST /api/void`) from what you have been doing, the rooms you passed and what you lingered on
or picked out. Without Claude a local script says much the same with the
same real names and numbers. What it has said is kept in the browser.

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

## The zone

Fly straight down from the hub. In sector `0, -1, 0` a ring of blocks turns round a black hole,
the seven pieces tumbling about it. It pulls you through like his door does, into the zone: a
dimension with a well hanging in it, and a falling-block game in the well that is part of the place.

At the well, `P` (controller: start) sits you down; `P` again stands you up and pauses. In the
zone `R` (seated, also right-stick click) levels you out facing the well, from wherever you are.
`Space` starts a run, and before that `←` `→` choose the stage it starts on.

- Keyboard: `←` `→` move, `↓` soft drop, `Space` hard drop, `↑` or `X` rotate, `Z` or `Ctrl`
  rotate back, `A` turn round, `C` or `Shift` hold, `V` the Zone. Mouse look and `Q` `E` roll still work.
- Controller: d-pad (or left stick) move, d-pad down soft drop, d-pad up hard drop, `A` rotate,
  `B` / `X` rotate back, `Y` turn round, bumpers hold, triggers the Zone.

The game (`public/src/stack.js`) follows the published guideline rules: seven-piece bags, SRS
rotation and wall kicks, hold, five next pieces, ghost, lock delay with move resets, guideline
gravity and scoring, T-spins, back-to-back, combos, perfect clears. And the Zone: clearing lines
fills a meter; from a quarter full it can be set off, and then time stops for as long as the
meter held (20 seconds full). Nothing falls; every line cleared sinks to the bottom of the well
and waits there, and when time starts again they all go at once (n lines score 50 × n² × level).

What it does to the place (`public/src/zone.js`):

- Cleared lines burst out of the well as blocks that stay in the dimension for a minute or two,
  carried by the stage's current (schooling, rising, orbiting, spiralling, raining, pulsing).
- Every piece that lands sends a shock through all of them; a quad (four lines at once) or a T-spin a big one.
- Flying through them knocks them out of the way and drags them along. The well itself rocks when
  things land in it, and gives a little when you fly into it.
- In the Zone time stops for the whole dimension: the blocks, the current, the sky. The music goes
  under water. When it ends, everything piled up is thrown out in one blast.
- A run is a journey through the stages, from the one you chose to the last; each lasts 24 lines.
  Through a stage its song builds: it starts held back, darker and quieter, and opens up as the
  lines add up. When the stage is done the next song crossfades in from its beginning and the
  dimension eases into the next look (colours, sky, current) without a cut. Finishing the last
  stage completes the journey.
- Every action has its sound, played by the stage's own instrument, in its key and on its beat:
  moving plays the column you are in, turning goes up clockwise and down the other way, and holds,
  landings, drops, clears and the Zone each have theirs. In the zone the pieces stand steady; the
  music does not make them flash.

### Your own stages

Out of the box there are seven stages of ours, with a small score of ours for each. Anything you
put in `zone/` (next to `server.js`; `CVOID_ZONE` points elsewhere) becomes the stages instead. The
folder is ignored by git, so files that are only yours to use stay on your machine:

    zone/
      first stage/
        1 drums.ogg      the layers of its music, in name order, all started together:
        2 bass.ogg       the first always plays, and one more comes in every 5 lines
        3 lead.ogg
        stage.json       optional, see below
        sky_night.png    optional: pictures named like sky, back, bg, pano, env hang far behind the well
        feather.png      optional: the first other picture is what the stage's swarm is made of
        whale.glb        optional: models (.glb / .gltf) float behind the well, turning
      a song.mp3         a loose audio file is a stage of its own

Audio can be anything the browser plays (`ogg`, `opus`, `mp3`, `wav`, `flac`, `m4a`), pictures
`png`, `jpg`, `webp`, `gif`. Loose pictures and models go with every stage. `stage.json` can set:

    { "bpm": 120, "offset": 0.0, "root": 55, "mode": "minor", "behaviour": "orbit", "voice": "drop", "lines": 24,
      "palette": { "fog": "#03243a", "deep": "#00070f", "glow": "#2fd5ff", "accent": "#c4fff4" } }

`bpm` and `offset` (seconds to the first beat) put the pieces' sounds on the music's beat; without
them they play at once. `root` is in Hz; `mode` is one of `minor`, `dorian`, `lydian`, `phrygian`,
`whole`, `pentatonic` (for a song in a major key, `pentatonic` stays in tune); `behaviour` one of
`school`, `rise`, `drift`, `spiral`, `orbit`, `pulse`, `rain`; `voice`, the instrument of the
pieces' sounds, one of `bell`, `drop`, `marimba`, `chime`, `pluck`, `harp`; `lines`, how many lines
the stage lasts (24). `title` is the name shown (else the
folder's), and `look` names one of our stages (`open water`, `ember field`, `glass desert`,
`night train`, `aurora`, `deep bloom`, `starfall`) to take the sky and anything else left out from.
Folders are played in name order. Links into `zone/` are followed, so files can stay where they are.
Reload the page after changing files.

## Plugins

Local additions of your own go in `plugins/<name>/`, which `.gitignore` keeps out of the
repository. A plugin's `server.js`, if it has one, default-exports a function that is given what it
may use (`send`, `readBody`, which paths are cvoid's own, the port, a way to add to the hub's
description) and returns `handle(req, res, url)`, asked before cvoid's own routes, and
`upgrade(req, socket, head)` for websockets. Its `public/` folder is served at `/plugins/<name>/`,
and its `public/client.js`, if there, is loaded into the page: it default-exports
`install(game)` and returns its hooks into the frame, the keys and mouse, the flight, the HUD, the
map and the void's voice (listed at the top of `public/src/main.js`). A plugin may add a dimension
of its own (`game.addRealm`). Without plugins, none of this does anything.

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
| `CVOID_ZONE` | `zone` | where the zone's own stages are read from |

## Layout

- `server.js`: static files, the sector endpoint, the prompt and schema
- `public/src/world.js`: sector grid, structure generators, sky, materialization
- `public/src/structures.js`: solids, layouts, blueprints
- `public/src/entity.js`: the entity and its acts
- `public/src/marderchen.js`, `public/src/museum.js`, `persona/`, `scripts/museum*.mjs`: marderchen's dimension, his museum and his persona
- `public/src/zone.js`, `public/src/stack.js`: the zone and the falling-block game in its well
- `public/src/map.js`: the sector map overlay
- `public/src/spec.js`: origin hub, local fallback generator, spec clamping
- `public/src/shaders.js`: noise library and all GLSL
- `public/src/audio.js`: synthesized drone, shimmer and wind
