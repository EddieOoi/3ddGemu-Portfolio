/**
 * Initial Loader — session-gated intro for index.html only.
 *
 * Session behavior (mutually exclusive with the standard #preloader):
 *   - Already visited this session (refresh / back-nav to index):
 *       remove #initial-loader immediately; DO NOT touch the standard #preloader,
 *       let it handle the page load as normal.
 *   - First visit this session:
 *       mark visited, suppress the standard #preloader, run the full intro:
 *         0-100% counter (min 2.5s) with a progress-driven curtain slide
 *         (blue -> white, ease-out) and a SKIP INTRO button. At 100% the
 *         counter and skip hide, the title holds ~3s, then the whole overlay
 *         fades out and is removed.
 *
 * Runs immediately (no DOMContentLoaded wait) so the standard #preloader can be
 * removed before it paints on a first visit, avoiding a flash.
 */
(function () {
  "use strict";

  const initial = document.getElementById('initial-loader');
  const visited = sessionStorage.getItem('visited') === 'true';

  if (visited) {
    // Returning this session: skip the intro entirely, keep the standard
    // preloader. Kill the crossfade transition first so the node vanishes
    // with ZERO delay (no fade), then remove it. The home page is never
    // locked, so index.html renders immediately.
    if (initial) {
      initial.style.transition = 'none';
      initial.remove();
    }
    return;
  }

  // First visit this session.
  sessionStorage.setItem('visited', 'true');

  // Suppress the standard across-page preloader so the two don't run together.
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.remove();
  }

  if (!initial) {
    return;
  }

  // Don't lock the page if the intro is visually disabled (reduced-motion):
  // the loader is display:none there, so just remove it and let the site show.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) {
    initial.remove();
    return;
  }

  // Lock scrolling + hide the home page for the duration of the intro.
  document.documentElement.classList.add('initial-loading');
  document.body.classList.add('initial-loading');

  const counterEl = document.getElementById('initial-loader-counter');
  const curtainEl = initial.querySelector('.initial-loader-curtain');
  const skipEl = document.getElementById('initial-loader-skip');

  const MIN_DURATION = 2500; // ms — mandatory minimum intro length.
  const start = performance.now();

  // Background lerps blue (#0563bb) -> white (#ffffff) as it slides out.
  const FROM = [5, 99, 187];
  const TO = [255, 255, 255];

  // Text is the inverse of the background: white while the curtain is blue,
  // lerping to blue as the curtain turns white. Driven at the same ratio so
  // the two are always opposites, moving in lockstep.
  const TEXT_FROM = [255, 255, 255];
  const TEXT_TO = [5, 99, 187];

  let finished = false;    // true once startReveal() has run (loader going away).
  let holdStarted = false; // guards beginHold() against re-entry by the rAF loop.
  let fadeTimer = null;
  let removeTimer = null;

  function lerpColor(t) {
    const r = Math.round(FROM[0] + (TO[0] - FROM[0]) * t);
    const g = Math.round(FROM[1] + (TO[1] - FROM[1]) * t);
    const b = Math.round(FROM[2] + (TO[2] - FROM[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function lerpText(t) {
    const r = Math.round(TEXT_FROM[0] + (TEXT_TO[0] - TEXT_FROM[0]) * t);
    const g = Math.round(TEXT_FROM[1] + (TEXT_TO[1] - TEXT_FROM[1]) * t);
    const b = Math.round(TEXT_FROM[2] + (TEXT_TO[2] - TEXT_FROM[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Release the scroll/content lock so the home page is revealed.
  function releaseLock() {
    document.documentElement.classList.remove('initial-loading');
    document.body.classList.remove('initial-loading');
  }

  // Tear down the loader unconditionally: clear any pending timers, release the
  // content/scroll lock, and remove #initial-loader from the DOM so the home
  // page is fully restored to visibility. Safe to call multiple times.
  function removeLoader() {
    if (fadeTimer) clearTimeout(fadeTimer);
    if (removeTimer) clearTimeout(removeTimer);
    fadeTimer = removeTimer = null;
    releaseLock();
    if (initial && initial.parentNode) {
      initial.remove();
    }
  }

  // Single seamless reveal step. Runs after the 100% hold (or on SKIP):
  //  1) Drop the preloader's OWN text block fast (0.3s, via loader-hide-ui /
  //     loader-hide-title) so it never overlaps the home hero.
  //  2) Release the lock so the home page (#header/main/#hero, which have a
  //     1s opacity transition) fades IN simultaneously.
  //  3) Add .initial-loader-hidden to the whole loader, triggering its 1.2s
  //     opacity+transform crossfade OUT. The node is removed after 1200ms.
  //  Owns the `finished` flag so it can only run once.
  function startReveal() {
    if (finished) return;
    finished = true;

    // 1) Drop the preloader's text fast — faster than the 1.2s loader melt.
    initial.classList.add('loader-hide-ui', 'loader-hide-title');

    // 2) Reveal the home page (it fades in via its own 1.0s transition).
    releaseLock();

    // 3) Start the loader's own crossfade-out, then remove after it completes.
    initial.classList.add('initial-loader-hidden');
    removeTimer = setTimeout(removeLoader, 1200);
  }

  // Begin the post-100% hold. Owns its own `holdStarted` guard (separate from
  // `finished`, which belongs to startReveal) so the rAF loop can't re-enter it
  // at 100%. Schedules startReveal 2s later; does NOT set `finished`.
  function beginHold() {
    if (holdStarted) return;
    holdStarted = true;

    // Hide the counter + skip for the clean 2s title hold; reveal starts after.
    initial.classList.add('loader-hide-ui');

    fadeTimer = setTimeout(startReveal, 2000);
  }

  // Final fade-out: SKIP INTRO jumps straight to the seamless reveal.
  function beginFade() {
    if (finished) return;
    startReveal();
  }

  // SAFETY NET: if any step throws, rAF stalls, or a timer is missed, forcibly
  // restore the page. The longest natural path is ~4.2s (3s hold + 1.2s fade),
  // so a 5s cap guarantees a true hang still gets cleaned up without blocking
  // the home page. If the intro already completed, #initial-loader is gone and
  // this is a no-op.
  setTimeout(function forceFinish() {
    if (!initial || !initial.parentNode) return; // already removed
    try { startReveal(); } catch (e) { /* fall through to removal */ }
  }, 5000);

  // Animate 0 -> 100 over at least MIN_DURATION; drive the curtain slide
  // (progress-linked) and the blue->white color along the way.
  function tick(now) {
    if (finished) return;
    const elapsed = now - start;
    const progress = Math.min(elapsed / MIN_DURATION, 1);
    const value = Math.round(progress * 100);

    if (counterEl) {
      counterEl.textContent = String(value);
    }

    // Eased ratio (slows near the end) per spec: 1 - (1 - value/100)^3.
    const easedProgress = 1 - Math.pow(1 - value / 100, 3);

    // Pace the text color in lockstep with the background: white on the blue
    // curtain, lerping to blue as the curtain turns white. Set via a CSS var
    // so every text layer (title, glitch copies, subtitle, counter, dash,
    // scanline, skip) stays in contrast with the background at the same rate.
    initial.style.setProperty('--loader-text', lerpText(easedProgress));

    if (curtainEl) {
      curtainEl.style.transform = `translateX(${easedProgress * 100}%)`;
      curtainEl.style.background = lerpColor(easedProgress);
    }

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      beginHold();
    }
  }

  // SKIP INTRO: stop the timeline and run the fade-out immediately.
  if (skipEl) {
    skipEl.addEventListener('click', beginFade);
  }

  requestAnimationFrame(tick);
})();
