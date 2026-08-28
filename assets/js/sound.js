/**
 * Sound Manager - Handles BGM + SFX with Web Audio API
 * Features: BGM loop/resume, SFX on hover/click, persist state, respect autoplay policy
 */
(function() {
  "use strict";

  const SOUND_CONFIG = {
    bgm: {
      url: 'assets/audio/bgm-loop.mp3',
      volume: 0.4,
      fadeDuration: 500
    },
    sfx: {
      hover: {
        url: 'assets/audio/sfx_ui_hover.wav',
        volume: 0.2
      },
      click: {
        url: 'assets/audio/friendly_game_notifi.wav',
        volume: 0.5
      }
    }
  };

  const STORAGE_KEYS = {
    bgmEnabled: 'portfolio-bgm-enabled',
    bgmPosition: 'portfolio-bgm-position',
    bgmWasPlaying: 'portfolio-bgm-was-playing',
    sfxEnabled: 'portfolio-sfx-enabled'
  };

  // Web Audio API state
  let audioContext = null;
  let bgmBuffer = null;
  let sfxHoverBuffer = null;
  let sfxClickBuffer = null;
  let bgmSource = null;
  let bgmGainNode = null;
  let sfxGainNode = null;
  let bgmStartTime = 0;
  let bgmPauseTime = 0;
  let isBgmPlaying = false;
  let isBgmMuted = false;
  let isSfxMuted = false;

  // Hover SFX tracking - prevent stacking
  let currentHoverSource = null;
  let lastHoveredTarget = null;
  let lastHoverTime = 0;

  // Selectors for interactive elements that trigger SFX
  const INTERACTIVE_SELECTORS = [
    'a:not(.glightbox):not(.preview-link):not(.details-link):not(.github-link)',
    'button:not(.header-toggle):not(.initial-loader-skip):not(#sound-toggle)',
    '.portfolio-item',
    '.service-item',
    '.testimonial-item',
    '[role="button"]',
    '.navmenu a',
    '.social-links a',
    '.scroll-top',
    '.glow-btn',
    '.btn'
  ].join(', ');

  // Initialize AudioContext (requires user gesture)
  function initAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // BGM gain node
      bgmGainNode = audioContext.createGain();
      bgmGainNode.gain.value = SOUND_CONFIG.bgm.volume;
      bgmGainNode.connect(audioContext.destination);

      // SFX gain node (separate so BGM volume doesn't affect SFX)
      sfxGainNode = audioContext.createGain();
      sfxGainNode.gain.value = 1;
      sfxGainNode.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }

  // Load a single audio file with error handling
  async function loadAudio(url, name) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      console.log(`[Sound] Loaded ${name}: ${url}`);
      return audioBuffer;
    } catch (error) {
      console.error(`[Sound] Failed to load ${name}: ${url}`, error.message);
      return null;
    }
  }

  // Load all audio files
  async function loadAllAudio() {
    initAudioContext();

    const [bgm, hover, click] = await Promise.all([
      loadAudio(SOUND_CONFIG.bgm.url, 'BGM'),
      loadAudio(SOUND_CONFIG.sfx.hover.url, 'Hover SFX'),
      loadAudio(SOUND_CONFIG.sfx.click.url, 'Click SFX')
    ]);

    bgmBuffer = bgm;
    sfxHoverBuffer = hover;
    sfxClickBuffer = click;

    return bgm !== null && hover !== null && click !== null;
  }

  // Play BGM from specific time
  function playBgmFrom(time = 0) {
    if (!bgmBuffer || !audioContext || isBgmMuted) return;

    stopBgm();

    bgmSource = audioContext.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    bgmSource.connect(bgmGainNode);

    const currentTime = audioContext.currentTime;
    bgmStartTime = currentTime - time;
    bgmSource.start(0, time);
    isBgmPlaying = true;

    persistBgmPosition();
  }

  // Pause BGM and save position
  function pauseBgm() {
    if (!isBgmPlaying || !bgmSource || !audioContext) return;

    bgmPauseTime = audioContext.currentTime - bgmStartTime;
    bgmSource.stop();
    bgmSource.disconnect();
    bgmSource = null;
    isBgmPlaying = false;

    sessionStorage.setItem(STORAGE_KEYS.bgmPosition, bgmPauseTime.toString());
    sessionStorage.setItem(STORAGE_KEYS.bgmWasPlaying, 'true');
  }

  // Stop BGM completely
  function stopBgm() {
    if (bgmSource) {
      bgmSource.stop();
      bgmSource.disconnect();
      bgmSource = null;
    }
    isBgmPlaying = false;
    bgmPauseTime = 0;
    sessionStorage.removeItem(STORAGE_KEYS.bgmPosition);
    sessionStorage.removeItem(STORAGE_KEYS.bgmWasPlaying);
  }

  // Stop and cleanup an audio source
  function stopSource(source) {
    if (!source) return;
    try {
      source.stop();
    } catch (e) {
      // Already stopped
    }
    source.disconnect();
  }

  // Play SFX (hover or click)
  function playSfx(type) {
    if (isSfxMuted || !audioContext) return;

    const buffer = type === 'hover' ? sfxHoverBuffer : sfxClickBuffer;
    if (!buffer) {
      console.warn(`[Sound] ${type} SFX buffer not loaded`);
      return;
    }

    // For hover SFX, stop any currently playing hover sound
    if (type === 'hover') {
      stopSource(currentHoverSource);
      currentHoverSource = null;
    }

    const volume = type === 'hover'
      ? SOUND_CONFIG.sfx.hover.volume
      : SOUND_CONFIG.sfx.click.volume;

    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(sfxGainNode);

    // Track hover sources for cleanup
    if (type === 'hover') {
      currentHoverSource = source;
    }

    // Cleanup when playback finishes
    source.onended = function() {
      gainNode.disconnect();
      if (type === 'hover') {
        currentHoverSource = null;
      }
    };

    source.start(0);
  }

  // Toggle BGM mute/unmute
  function toggleBgmMute() {
    isBgmMuted = !isBgmMuted;
    if (isBgmMuted) {
      pauseBgm();
    } else {
      const savedPosition = parseFloat(sessionStorage.getItem(STORAGE_KEYS.bgmPosition)) || 0;
      playBgmFrom(savedPosition);
    }
    updateBgmButtonState();
    localStorage.setItem(STORAGE_KEYS.bgmEnabled, (!isBgmMuted).toString());
  }

  // Toggle SFX mute/unmute
  function toggleSfxMute() {
    isSfxMuted = !isSfxMuted;
    localStorage.setItem(STORAGE_KEYS.sfxEnabled, (!isSfxMuted).toString());
  }

  // Persist BGM position every second
  function persistBgmPosition() {
    if (!isBgmPlaying || !audioContext) return;
    const position = audioContext.currentTime - bgmStartTime;
    sessionStorage.setItem(STORAGE_KEYS.bgmPosition, position.toString());
    setTimeout(persistBgmPosition, 1000);
  }

  // Update BGM button UI
  function updateBgmButtonState() {
    const btn = document.getElementById('sound-toggle');
    if (!btn) return;

    btn.classList.toggle('muted', isBgmMuted);
    btn.classList.toggle('is-playing', isBgmPlaying && !isBgmMuted);
    btn.setAttribute('aria-pressed', isBgmMuted.toString());
    btn.setAttribute('aria-label', isBgmMuted ? 'Turn music on' : 'Turn music off');

    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = isBgmMuted ? 'bi bi-volume-mute navicon' : 'bi bi-volume-up navicon';
    }
  }

  // Attach SFX listeners to interactive elements
  function attachSfxListeners() {
    const HOVER_DEBOUNCE = 150; // ms

    // Hover SFX with element caching
    document.addEventListener('mouseover', (e) => {
      if (isSfxMuted) return;

      // Don't play hover SFX on touch devices
      if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;

      const target = e.target.closest(INTERACTIVE_SELECTORS);
      if (!target) return;

      // Skip if same element (moving across child elements)
      if (target === lastHoveredTarget) return;

      // Debounce
      const now = Date.now();
      if (now - lastHoverTime < HOVER_DEBOUNCE) return;

      lastHoverTime = now;
      lastHoveredTarget = target;

      initAudioContext();
      playSfx('hover');
    }, true);

    // Reset cached element on mouseout
    document.addEventListener('mouseout', (e) => {
      const target = e.target.closest(INTERACTIVE_SELECTORS);
      const relatedTarget = e.relatedTarget;

      // If we're leaving to a child of the same interactive element, don't reset
      if (target && relatedTarget && target.contains(relatedTarget)) return;

      if (target === lastHoveredTarget) {
        lastHoveredTarget = null;
      }
    }, true);

    // Click SFX - only on actual interactive elements, not sound toggle
    document.addEventListener('click', (e) => {
      if (isSfxMuted) return;

      // Find closest interactive element
      const target = e.target.closest(INTERACTIVE_SELECTORS);
      if (!target) return;

      // Sound toggle is handled separately via its own click listener
      if (target.id === 'sound-toggle') return;

      // Middle-click, Ctrl/Cmd+click, Shift+click open in new tab/window natively
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) {
        initAudioContext();
        playSfx('click');
        return;
      }

      initAudioContext();
      playSfx('click');

      // For internal links, delay navigation so click SFX can play
      if (target.tagName === 'A' && target.href) {
        const link = target;

        // Skip delay for: hash links, javascript: links, external links, target="_blank"
        if (link.target === '_blank') return;
        if (link.hasAttribute('download')) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        if (href.startsWith('mailto:') || href.startsWith('tel:')) return;

        // External link (different origin) - let browser handle it
        try {
          const url = new URL(link.href, window.location.href);
          if (url.origin !== window.location.origin) return;
        } catch (err) {
          // Invalid URL, let browser handle it
          return;
        }

        // Internal navigation - delay briefly to let click SFX play out
        e.preventDefault();
        setTimeout(() => {
          window.location.href = link.href;
        }, 180);
      }
    }, true);
  }

  // Initialize sound system
  async function init() {
    // Load saved preferences
    isBgmMuted = localStorage.getItem(STORAGE_KEYS.bgmEnabled) === 'false';
    isSfxMuted = localStorage.getItem(STORAGE_KEYS.sfxEnabled) === 'false';

    // Respect prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      isBgmMuted = true;
      isSfxMuted = true;
    }

    const btn = document.getElementById('sound-toggle');
    if (!btn) return;

    // Initialize on first user gesture
    function initOnGesture() {
      initAudioContext();
      loadAllAudio().then(loaded => {
        if (loaded && !isBgmMuted) {
          const savedPosition = parseFloat(sessionStorage.getItem(STORAGE_KEYS.bgmPosition)) || 0;
          playBgmFrom(savedPosition);
        }
        attachSfxListeners();
        updateBgmButtonState();
      });
      document.removeEventListener('click', initOnGesture);
      document.removeEventListener('keydown', initOnGesture);
    }

    document.addEventListener('click', initOnGesture, { once: true });
    document.addEventListener('keydown', initOnGesture, { once: true });

    // Sound toggle button click - separate listener
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudioContext();
      toggleBgmMute();
    });

    // Initial button state
    updateBgmButtonState();
  }

  // Handle page visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isBgmPlaying) {
      pauseBgm();
    } else if (!document.hidden && !isBgmMuted && !isBgmPlaying) {
      const savedPosition = parseFloat(sessionStorage.getItem(STORAGE_KEYS.bgmPosition)) || 0;
      const wasPlaying = sessionStorage.getItem(STORAGE_KEYS.bgmWasPlaying) === 'true';
      if (wasPlaying) {
        initAudioContext();
        playBgmFrom(savedPosition);
      }
    }
  });

  // Handle page unload
  window.addEventListener('beforeunload', () => {
    if (isBgmPlaying) {
      pauseBgm();
    }
  });

  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
