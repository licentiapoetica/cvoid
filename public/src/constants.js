export const CELL = 5200;  // width of one sector, in world units
// Structures and blueprints are designed in a box of half-extent REACH (so Claude's coordinates
// run about -250..250) and then drawn UNIT times larger. Sectors are far wider than what stands
// in them: there is a lot of dark between one place and the next.
export const REACH = 260;
export const UNIT = 2;
export const SIGHT = CELL / 600; // how much further everything is than when sectors were 600 wide
// The hub's portals stand on one circle round its clock (the ring of twelve cubes round the crystal),
// level with it, each facing the middle. hubPortal(angle): where one stands at that angle round the
// circle (0 straight ahead as you arrive, a quarter turn to the right, and so on), and which way is
// in (towards the clock)
export const PORTAL_RING = 1700;
export const hubPortal = (angle, ring = PORTAL_RING) => ({
  at: [Math.sin(angle) * ring, 0, -Math.cos(angle) * ring],
  in: [-Math.sin(angle), 0, Math.cos(angle)],
});
// one that stands further out than the circle, its own way round still kept: p.t.'s door, alone, far off
// in the dark
// (how far out, measured square, as the sectors are laid: the next places round the hub begin about 4680
// out along each axis and end about 5720, and the ones past them begin about 9880; at 7800 square it stands
// on the line between the two, in the dark as far from either as it can be)
export const PORTAL_REACH = { pt: 13000 };
// portals that come into being their own way (and are not drawn forming by forming.js): p.t.'s door
export const PORTAL_FORMS_ITSELF = new Set(["pt"]);
// Who stands where on that circle: these, in this order round it (f0ck's straight ahead), each the same
// way from the next, as many as there are (setPortals: the plugins this vvoid has), so the circle is
// always evenly kept, however many there are. hubSlot(name): where that one stands.
export const PORTAL_ORDER = ["f0ck", "z0r", "gumo", "somafm", "player", "files", "zone", "marderchen", "chan", "shorts", "tiktok", "redgifs", "discord", "watch", "bhop", "mania", "pt"];
let portals = PORTAL_ORDER;
export function setPortals(plugins) {
  portals = PORTAL_ORDER.filter((name) => plugins.includes(name));
}
export const portalNames = () => portals;
export const hubSlot = (name) => {
  const angle = (Math.max(0, portals.indexOf(name)) / portals.length) * Math.PI * 2, reach = PORTAL_REACH[name];
  return hubPortal(angle, reach && reach / Math.max(Math.abs(Math.sin(angle)), Math.abs(Math.cos(angle))));
};
// where everyone starts, unless they have chosen a place on the map (and where its origin button takes
// you back to): in the hub, above the clock and off to one side, looking down at it a little
export const SPAWN = [-380, 207, -313];
