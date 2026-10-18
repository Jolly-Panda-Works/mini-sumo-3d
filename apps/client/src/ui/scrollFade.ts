/**
 * Soft edges for scrolling lists: an edge fades out only when there's more content beyond
 * it (scrolled away from the top → the top fades; more below → the bottom fades). Lists
 * that fit don't fade at all. Works for every list matched by SELECTOR, including ones
 * that appear later (popups), by watching scrolls, resizes and DOM changes.
 */
const SELECTOR = [
  ".dialog__body",
  ".sub-dialog__body",
  ".friends__list",
  ".leaderboard__list",
  ".wardrobe__items",
  ".wardrobe__options",
  ".notice-popup__message",
].join(",");

function update(el: Element): void {
  if (!(el instanceof HTMLElement)) return;
  const scrollable = el.scrollHeight - el.clientHeight > 2;
  el.classList.toggle("fade-top", scrollable && el.scrollTop > 2);
  el.classList.toggle("fade-bottom", scrollable && el.scrollTop + el.clientHeight < el.scrollHeight - 2);
}

let frame = 0;
function updateAll(): void {
  frame = 0;
  document.querySelectorAll(SELECTOR).forEach(update);
}
function schedule(): void {
  if (!frame) frame = requestAnimationFrame(updateAll);
}

export function startScrollFade(): void {
  // Scroll events don't bubble, but they can be caught on the way down.
  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      if (target instanceof Element && target.matches(SELECTOR)) update(target);
    },
    { capture: true, passive: true },
  );
  window.addEventListener("resize", schedule);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
}
