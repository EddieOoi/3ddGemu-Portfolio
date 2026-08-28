/**
 * Custom Cursor (dot + trailing ring)
 * Shared across all pages. Vanilla JS, no libraries.
 * Disabled on touch/coarse-pointer and reduced-motion environments.
 */
(function () {
  "use strict";

  // Toggle the center dot on/off. When false, only the trailing ring follows the mouse.
  const SHOW_DOT = false;

  // Respect users who don't have a persistent pointer or prefer reduced motion.
  const noHover = window.matchMedia('(hover: none), (pointer: coarse)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (noHover.matches || reduceMotion.matches) {
    return; // Don't attach any listeners or start the animation loop.
  }

  // Only initialize after the DOM is ready (the #cursor-* markup must exist).
  function initCursor() {
    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    if (!dot || !ring) return;

    // Hide the center dot entirely when disabled, leaving just the ring.
    if (!SHOW_DOT) {
      dot.style.display = 'none';
    }

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;

    // Dot follows the raw pointer immediately (no smoothing).
    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    });

    // Ring lerps toward the dot each frame for the trailing effect.
    function loop() {
      ringX += (mouseX - ringX) * 0.15;
      ringY += (mouseY - ringY) * 0.15;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // Grow/highlight the ring over interactive elements.
    const interactive = document.querySelectorAll('a, button, .portfolio-item, .portfolio-card, [role="button"]');
    interactive.forEach((el) => {
      el.addEventListener('mouseenter', () => ring.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => ring.classList.remove('cursor-hover'));
    });

    // Hide the custom cursor when the pointer leaves the window, restore on return.
    document.addEventListener('mouseleave', () => {
      dot.style.opacity = '0';
      ring.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
      dot.style.opacity = '1';
      ring.style.opacity = '1';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCursor);
  } else {
    initCursor();
  }
})();
