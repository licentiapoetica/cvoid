export const CELL = 1600;  // width of one sector, in world units
// Structures and blueprints are designed in a box of half-extent REACH (so Claude's coordinates
// run about -250..250) and then drawn UNIT times larger. Sectors are far wider than what stands
// in them: there is a lot of dark between one place and the next.
export const REACH = 260;
export const UNIT = 2;
export const SIGHT = CELL / 600; // how much further everything is than when sectors were 600 wide
