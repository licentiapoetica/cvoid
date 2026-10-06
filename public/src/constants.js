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
export const hubPortal = (angle) => ({
  at: [Math.sin(angle) * PORTAL_RING, 0, -Math.cos(angle) * PORTAL_RING],
  in: [-Math.sin(angle), 0, Math.cos(angle)],
});
// Who stands where on that circle: these, in this order round it (f0ck's straight ahead), each the same
// way from the next, as many as there are (setPortals: the plugins this cvoid has), so the circle is
// always evenly kept, however many there are. hubSlot(name): where that one stands.
export const PORTAL_ORDER = ["f0ck", "z0r", "gumo", "somafm", "player", "zone", "marderchen", "chan", "shorts", "tiktok", "redgifs", "discord", "bhop", "mania"];
let portals = PORTAL_ORDER;
export function setPortals(plugins) {
  portals = PORTAL_ORDER.filter((name) => plugins.includes(name));
}
export const portalNames = () => portals;
export const hubSlot = (name) => hubPortal((Math.max(0, portals.indexOf(name)) / portals.length) * Math.PI * 2);
// where everyone starts, unless they have chosen a place on the map (and where its origin button takes
// you back to): in the hub, above the clock and off to one side, looking down at it a little
export const SPAWN = [-380, 207, -313];
