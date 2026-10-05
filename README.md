# cvoid

![The origin of cvoid: the hub's clock in its ring of cubes, and Irrlicht, the cold flame that keeps by you](docs/cvoid.jpg)

Past the blue fog of the PlayStation 2 system menu, there is more of it.

A grid of rooms that were never built, each one dreamt the first time someone comes near: its name,
its colours, what stands in it, the drone it hums, the words hanging in the fog, the sky over it.
Claude dreams them. Once dreamt, a place stays as it was, for everyone who comes after.

Something else is out there. It notices you. Sometimes it says where it will be waiting.

And a cold flame with eyes keeps by you. It is called Irrlicht, and through it you can always go back.

## To enter

    npm install
    echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
    npm start                 # http://127.0.0.1:5173

Without a key the void still opens, made of local noise instead of dreams.

Mouse to look, `W` `A` `S` `D` to fly, `Shift` to surge, `V` casts a light ahead, `J` throws a gob of
alien goo at the post you look at (it clings to the screen and runs down it). `Tab` holds the rest: the map
of everywhere you have been, the keys, the controller, the screen, the credits.

<details>
<summary>settings, in <code>.env</code></summary>

| | default | |
|---|---|---|
| `PORT` | `5173` | |
| `CVOID_HOST` | `127.0.0.1` | bind address |
| `CVOID_MODEL` | `claude-opus-5-5` | who dreams |
| `CVOID_EFFORT` | `low` | higher: slower, more considered places |
| `CVOID_FAST` | off | `1`: Opus fast mode (twice the price) |
| `CVOID_CACHE` | `.cache/sectors` | where the dreamt places are kept |
| `CVOID_MAX_SECTORS` | `300` | new places per run of the server |
| `CVOID_MAX_BEATS` | `600` | turns of the entity per run |

</details>

## Other doors

Round the clock at the origin there is room for more rings. Each is a plugin, a folder in `plugins/`:
a dimension, a game, a place of someone's own. cvoid needs none of them, and keeps them out of its
repository. What a plugin is given and the hooks it answers are written down in `public/src/main.js`
(the page) and `server.js` (the server).

## Made with

Open source, and with thanks to the people who made it:

| | licence | |
|---|---|---|
| [three.js](https://threejs.org) | MIT | the whole picture: the void, what stands in it, the glow |
| [Ruffle](https://ruffle.rs) | MIT / Apache-2.0 | Flash, played again, in the plugins' dimensions |
| [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) | MIT | how the server asks Claude, who dreams the places |
| [Zod](https://zod.dev) | MIT | the shape a dreamt place has to have |
| [Node.js](https://nodejs.org) | MIT | the server |
| [Puppeteer](https://pptr.dev) | Apache-2.0 | cvoid driven headless: its tests, and stills of it |

And the code it borrows:

| | licence | |
|---|---|---|
| [webgl-noise](https://github.com/stegu/webgl-noise) | MIT | simplex noise on the GPU, by Ian McEwan and Stefan Gustavson: the sky and every place's field |
| [Simplex noise demystified](https://github.com/stegu/perlin-noise) | public domain | simplex noise on the CPU, after Stefan Gustavson: where the void is crowded and where it is empty |
| [mulberry32](https://gist.github.com/tommyettinger/46a874533244883189143505d203312c) | public domain | seeded randomness, by Tommy Ettinger: the same place is always the same |
| [MurmurHash3](https://github.com/aappleby/smhasher) | public domain | its finaliser, by Austin Appleby: a place's coordinates into its seed |

What a plugin brings keeps its own licence, and is named on the credits page in cvoid (`Tab`, then
`credits`).

## Made by

<img src="docs/irrlicht.png" alt="Irrlicht" width="140" align="right">

Kibi Kelburton, with Claude (Opus 5.5, by Anthropic), who wrote the code with Kibi in Claude Code
and, in the void, dreams the places and speaks for what waits there.

Copyright (C) 2026 Kibi Kelburton. cvoid is free software under the GNU Affero General Public
License, version 3 or (at your option) any later version (see `LICENSE`), and comes with no
warranty. Run it, change it, pass it on; if you let others use a changed cvoid over a network,
offer them its source.
