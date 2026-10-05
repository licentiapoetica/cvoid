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
  In the hub, with the crosshair on a portal (round the clock) its name shows
  under the crosshair; click and you are turned to it and flown in (`S` stops it; it stops itself
  once you are through, or past it).
  Once you have gone somewhere (through a portal, into a tag's room, out of one, or across the map),
  a companion floats along beside you, ahead and low to the left, bobbing: the way back, a mouth of
  dark burnt into the air, its edge smouldering, giving off a thin smoke. Click it (or fly into it;
  its mouth opens round you and the dark gathers) and you are back where you were before, in that
  dimension and room, where you were a few seconds before you went; again, and a step further back.
  Looked at or come near, it waits. Double clicking a portal (or the companion) flies you in as fast
  as anything flies. `V` shoots a laser straight ahead; clicking a portal shoots one at it.
  Hold the right mouse button to zoom in (about 2×, the view turning slower to match); let go
  to zoom back out. `F` goes fullscreen. Outside fullscreen the browser keeps its own shortcuts, so `Ctrl+W`
  (close tab) and `Ctrl+Shift+W` (close window) still work mid-flight; the game makes the
  browser ask before leaving. In fullscreen on Chromium those keys go to the game, and
  left `Ctrl` can be used to sink.
- Controller: left stick fly, right stick look, right / left trigger rise and sink,
  bumpers roll, `A` (cross) or left-stick click surge, `X` (square) interact: opens or enters what you
  look at (a post, a museum piece, a 4chan thread, the well you are beside), and with nothing there
  recentres the view; right-stick click autofly, d-pad left / right sensitivity, `Y` (triangle) mute.
  Any button starts the game. Invert look and recentring alone have no button until you give them one.
- Map: `Tab` (controller: select) opens the map of every sector you have been in (only those;
  remembered across visits), one horizontal layer at a time; `Page Up` / `Page Down` (bumpers) step
  through layers. Scroll zooms, out over thousands of sectors; drag moves the view; a click picks a
  spot and a double click goes there. Its panel takes an exact sector and offset (`go`), sets where
  you start (`start here`), goes somewhere at random in what the map shows, and finds you again.
  `O` or `origin` always takes you back to the hub, from any dimension, and starts you there again.
  Under the volume in the Tab panel, the mix: a slider each (0 to 150%) for the void's own sound (its
  drone, wind, heartbeat), music (the zone's, marderchen's, the garden's), sounds (knocks, stings, the
  game's), voices (the entity's) and radio and posts (what plugins play); remembered, and a double
  click puts one back to 100.
  The graphics panel (Tab, top left), for a smoother picture on a slower machine or browser:
  resolution (auto follows the frame rate, waiting longer each time it would go up and down; or a
  fixed 50%, 75%, 100%, or sharp, the screen's own up to 2×), a frame rate cap (120, 60, 30), vsync (on: frames keep time with the screen's
  refreshes, so a cap takes whole ones, 50 for a 60 cap on a 100 Hz screen, and motion stays even; off:
  frames on a clock of their own, at the cap exactly or as fast as they can), the glow
  on or off, smooth edges (antialiasing, off by default), how many videos play at once in the plugins'
  dimensions, how many Flash loops (z0r's) at once, and the mouse: how much the view smooths it (off, light, normal, heavy) and its
  sensitivity. It shows the frame rate and the size drawn at, and whether the browser gives raw mouse
  input: Chrome does; Firefox does not, so the system's pointer acceleration applies there (turning
  that off in the system, and the smoothing down, makes it even). Remembered.
  The Tab panel's windows (the map's, the keys, the controller page, and the plugins') can be put
  where you like: drag one by any part that is not a button or a field, and resize it by its corner;
  what is in it flows to fit. Each is remembered where you left it; pressed twice quickly (not on a
  control), it goes back where it began.
- Touch: drag to look, hold a second finger to fly forward. Tap with the crosshair on a portal in the
  hub (round the clock) to turn to it and fly into it; tap on anything else as
  a click (a post in f0ck's dimensions: listened to and flown to). Double tap to surge, as Shift does,
  until the next double tap. The crosshair is a small solid light-blue square.
  The Tab panel opens from the "menu" button, top right (it reads "close" while open); on a narrow
  screen its windows are one under another, scrolled through, and while it is open the fingers are
  for it, not for flying.
- With more than one controller connected, the one you use is the one listened to: it is kept until
  another has a button pressed or a stick pushed, so an idle one left plugged in does not get in the way.
- The controller's buttons can be put where you want them: Tab, then `controller`. Every action, flying
  and at the well, is listed with the buttons it is on (named as on your controller: ✕ ○ □ △ L1 R2 ...
  or A B X Y LB RT ...); click one and press the button to put it there, `+` to add another, right
  click to clear it. `swap sticks` flies with the right stick and looks with the left; `reset all`
  puts everything back. Remembered in the browser, and the controller's help line follows it. Plugins
  add groups of their own (the f0ck and 4chan tour: `pad.addActions`, see their READMEs).

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

His door stands with the other portals on the circle round the clock: a ring in a running rainbow,
under a MEOW of little cubes, with a small vortex turning in it from close by. It draws you in as the
others do, turns you a little, and lets you out the other side into his dimension: the workshop he missed, given back without walls. Everything there is
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

In the hub, on the circle of portals round the clock, behind you and to the left as you arrive
(beside 4chan's green ring, when the chan plugin is there), a ring of blocks turns round a black hole, the seven
pieces tumbling about it. It pulls you through like his door does, into the zone: a dimension with
a well for each stage hanging in it, one after another along a winding way, and a falling-block
game in them that is part of the place. The ring behind where you arrive takes you back out into
the hub.

Each well wears its stage's colours and has its name over it. Fly among them and the dimension
takes the stage of the one you are nearest: its colours, sky, current and music. At a well, `P`
(controller: start) sits you down; `P` again stands you up and pauses. `Esc` pauses where you sit
(the browser lets go of the mouse with it); `Esc` again or a click goes on (controller: start or
cross). In the zone `R` (seated,
also right-stick click) levels you out facing the well, from wherever you are. `Space` starts a run
at that well's stage; before that `←` `→` take you over to the well before or after.

- Keyboard: `←` `→` move, `↓` soft drop, `Space` hard drop, `↑` or `X` rotate, `Z` or `Ctrl`
  rotate back, `A` turn round, `C` or `Shift` hold. Mouse look and `Q` `E` roll still work.
- Controller: d-pad (or left stick) move, d-pad down soft drop, d-pad up hard drop, `A` rotate,
  `B` / `X` rotate back, `Y` turn round, bumpers hold.

The game (`public/src/stack.js`) follows the published guideline rules: seven-piece bags, SRS
rotation and wall kicks, hold, five next pieces, ghost, lock delay with move resets, guideline
gravity and scoring, T-spins, back-to-back, combos, perfect clears.

A run is a journey through the stages, from the well it starts at to the last; each stage lasts 24
lines. When a stage is done the game goes over to the next well, with you seated at it (the game
waits on the way): its blocks burn away from the top of the well down, each eaten from a white-hot
edge and leaving as a streak of light in its own colour; the streaks arc up and over to the next
well while you are flown after them and the dimension eases into the next look, the next song
crossfading in from its beginning; and there the blocks come together again from the bottom up,
each as its streak lands.

Finishing the last stage does not end the journey: it is flown on to one more well, further down and
further out, the deep void, where the void plays against you. It is only reached that way (sitting at
its well, `Space` sends you back to the first one). There it is the kill screen: every piece is on
the floor the moment it appears and locks soon, at the top level. The void has a strength (its bar
under the numbers on the left); every line you clear hurts it, quads and T-spins most, back-to-backs
and combos more, a perfect clear a lot. It fights back: every few seconds it pushes rows of garbage up
from the floor, each with one hole, sooner and more of them the weaker it gets, and now and then it
says something. Empty its strength and the void is quiet: the journey is done. Pushed out of the top,
the void keeps you. Either way, `Space` begins a new journey at the first well.

It gets harder as it goes, as classic falling-block games do: the level climbs one every ten lines,
and the pieces fall faster with it (the guideline curve), up to the endgame speed, a row every
frame, from level 14 (the level stops at 15). Each stage also starts at its own level, the first at
1 and each next one two higher (with seven stages: 1, 3, 5, ... 13), so a run started at a later
well is fast from its first piece, and the last stage is played at the endgame speed.

What it does to the place (`public/src/zone.js`):

- Cleared lines burst out of the well as blocks that stay in the dimension for a minute or two,
  carried by the stage's current (schooling, rising, orbiting, spiralling, raining, pulsing).
- Every piece that lands sends a shock through all of them; a quad (four lines at once) or a T-spin a big one.
- Flying through them knocks them out of the way and drags them along. The wells are solid; the
  one being played rocks when things land in it, and gives a little when you fly into it.
- Through a stage its song builds: it starts held back, darker and quieter, and opens up as the
  lines add up.
- Every action has its sound, played by the stage's own instrument, in its key and on its beat:
  moving plays the column you are in, turning goes up clockwise and down the other way, and holds,
  landings, drops and clears each have theirs. In the zone the pieces stand steady; the music does
  not make them flash. The words over the well and the numbers beside it are plain, not glowing.

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
your offset from its centre, for a few seconds whenever you arrive somewhere new (`H` keeps it on
the screen); the keys are listed in the Tab panel. A sector Claude has dreamt is stored as
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
