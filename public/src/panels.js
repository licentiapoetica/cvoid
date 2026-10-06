// The Tab panel's windows (vvoid's own, and whatever plugins add: every element straight under the body
// whose id ends in "Panel"), each one moved by dragging it by any part that is not a control, and
// resized by its corner. Where each one is and how large is remembered; kept on the screen when the
// window changes size; a double click on it (not on a control) puts it back where it began.

const CONTROLS = "button, input, select, textarea, a, label, canvas, [contenteditable], output";
const MIN_W = 180, MIN_H = 60;
const narrow = matchMedia("(max-width: 760px)");

export function draggablePanels({ stored, store }) {
  const placed = stored("panels", {}) ?? {}; // id -> { left, top, width, height }
  let front = 10;
  const save = () => store("panels", placed);

  // put a window where it was left, inside the screen
  function place(el) {
    const p = placed[el.id];
    if (!p) return;
    const width = Math.max(MIN_W, Math.min(p.width ?? el.offsetWidth, innerWidth - 16));
    const height = p.height ? Math.max(MIN_H, Math.min(p.height, innerHeight - 16)) : null;
    Object.assign(el.style, {
      left: `${Math.max(0, Math.min(p.left, innerWidth - 60))}px`, top: `${Math.max(0, Math.min(p.top, innerHeight - 40))}px`,
      right: "auto", bottom: "auto", width: p.width ? `${width}px` : "", height: height ? `${height}px` : "", maxWidth: "none", maxHeight: "none",
    });
  }

  function adopt(el) {
    if (el.dataset.movable) return;
    el.dataset.movable = "1";
    el.classList.add("movable");
    place(el);
    el.addEventListener("pointerdown", (e) => {
      el.style.zIndex = String(++front); // (the one touched comes to the front)
      if (e.button !== 0 || e.target.closest(CONTROLS)) return;
      if (narrow.matches) return; // (a narrow screen has them one under another, scrolled: see index.html)
      // the corner it is resized by is the browser's: a press there is left to it, and the size it was
      // given remembered when it is let go
      const box = el.getBoundingClientRect();
      if (e.clientX > box.right - 18 && e.clientY > box.bottom - 18) {
        addEventListener("pointerup", () => {
          Object.assign(el.style, { maxWidth: "none", maxHeight: "none" }); // (first, so its own limits do not hold it back)
          const now = el.getBoundingClientRect();
          if (Math.abs(now.width - box.width) < 1 && Math.abs(now.height - box.height) < 1) return;
          Object.assign(el.style, { left: `${now.left}px`, top: `${now.top}px`, right: "auto", bottom: "auto" });
          placed[el.id] = { left: Math.round(now.left), top: Math.round(now.top), width: Math.round(now.width), height: Math.round(now.height) };
          save();
        }, { once: true });
        return;
      }
      e.preventDefault();
      // pressed twice in a moment: back where it began (the browser's own double click is lost with the drag)
      if (e.timeStamp - (el.lastPress ?? -1e9) < 350) return reset(el);
      el.lastPress = e.timeStamp;
      el.setPointerCapture(e.pointerId);
      const dx = e.clientX - box.left, dy = e.clientY - box.top;
      Object.assign(el.style, { left: `${box.left}px`, top: `${box.top}px`, right: "auto", bottom: "auto" });
      el.classList.add("dragging");
      const move = (m) => {
        el.style.left = `${Math.max(0, Math.min(m.clientX - dx, innerWidth - 60))}px`;
        el.style.top = `${Math.max(0, Math.min(m.clientY - dy, innerHeight - 40))}px`;
      };
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        el.classList.remove("dragging");
        const now = el.getBoundingClientRect();
        placed[el.id] = { ...placed[el.id], left: Math.round(now.left), top: Math.round(now.top) };
        save();
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }
  function reset(el) {
    el.lastPress = -1e9;
    delete placed[el.id];
    save();
    for (const prop of ["left", "top", "right", "bottom", "width", "height", "maxWidth", "maxHeight"]) el.style[prop] = "";
  }

  const look = () => { for (const el of document.querySelectorAll("body > [id$='Panel']")) adopt(el); };
  look();
  new MutationObserver(look).observe(document.body, { childList: true }); // (plugins add theirs later)
  addEventListener("resize", () => { for (const el of document.querySelectorAll("body > .movable")) place(el); });
}
