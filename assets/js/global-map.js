/**
 * Global Client & Collaboration Radar
 * ------------------------------------
 * Renders a Mercator world choropleth (D3 + TopoJSON) inside #global-collaboration-radar.
 *
 * Country tiers:
 *   1. Hub (Malaysia)         → accent blue #0563bb + pulsing locator ring
 *   2. Active client regions  → neon/cyan tinted fills
 *   3. Other regions          → dark glassmorphism grey + graticule grid
 *
 * Interactions: hover (fade other countries + tooltip), click (open WhatsApp).
 */
(function () {
  'use strict';

  /* ======================== Guards ======================== */
  if (typeof d3 === 'undefined' || typeof topojson === 'undefined') {
    console.warn('[global-map] D3 or TopoJSON not loaded — radar skipped.');
    var wrapper = document.getElementById('radar-map-wrapper');
    if (wrapper) wrapper.innerHTML = '<div class="radar-error">Map unavailable.</div>';
    return;
  }

  var container = document.getElementById('global-collaboration-radar');
  var wrapper = document.getElementById('radar-map-wrapper');
  if (!wrapper) return;

  /* ======================== Data ======================== */
  // Primary hub
  var HUB_COUNTRIES = new Set(['Malaysia']);

  // Active client / partner regions (North America, Europe, SE Asia, Australia/Oceania, East Asia)
  var ACTIVE_COUNTRIES = new Set([
    /* North America */
    'United States of America', 'Canada', 'Mexico', 'Guatemala', 'Belize',
    'Costa Rica', 'El Salvador', 'Honduras', 'Nicaragua', 'Panama', 'Cuba',
    'Haiti', 'Dominican Rep.', 'Jamaica', 'Puerto Rico', 'Bahamas',
    'Trinidad and Tobago', 'Antigua and Barbuda', 'St. Kitts and Nevis',
    'Dominica', 'St. Lucia', 'St. Vincent and the Grenadines', 'Barbados',
    'Grenada',
    /* Europe */
    'United Kingdom', 'Ireland', 'France', 'Germany', 'Spain', 'Portugal',
    'Italy', 'Switzerland', 'Austria', 'Belgium', 'Netherlands', 'Luxembourg',
    'Denmark', 'Norway', 'Sweden', 'Finland', 'Poland', 'Czechia', 'Slovakia',
    'Hungary', 'Romania', 'Bulgaria', 'Croatia', 'Serbia', 'Slovenia',
    'Bosnia and Herz.', 'Greece', 'Turkey', 'Albania', 'Macedonia', 'Estonia',
    'Latvia', 'Lithuania', 'Iceland', 'Malta', 'Cyprus', 'Monaco', 'Andorra',
    'San Marino', 'Vatican', 'Liechtenstein', 'Belarus', 'Ukraine', 'Moldova',
    /* Southeast Asia */
    'Singapore', 'Thailand', 'Vietnam', 'Myanmar', 'Cambodia', 'Laos',
    'Brunei', 'East Timor', 'Philippines', 'Indonesia',
    /* East Asia */
    'China', 'Japan', 'South Korea', 'North Korea', 'Taiwan', 'Mongolia',
    'Hong Kong', 'Macau',
    /* Australia / Oceania */
    'Australia', 'New Zealand', 'Papua New Guinea', 'Fiji', 'Solomon Is.',
    'Vanuatu', 'New Caledonia', 'Samoa', 'Tonga', 'Palau', 'Kiribati',
    'Marshall Is.', 'Micronesia, Fed. St.', 'Nauru', 'Tuvalu',
  ]);

  // Approximate timezone offsets for tooltip display
  var COUNTRY_TZ = {
    'United States of America': 'UTC−5 to −10',
    Canada: 'UTC−3.5 to −8',
    Mexico: 'UTC−6 to −8',
    'United Kingdom': 'UTC+0',
    Ireland: 'UTC+0',
    France: 'UTC+1',
    Germany: 'UTC+1',
    Spain: 'UTC+1',
    Portugal: 'UTC+0',
    Italy: 'UTC+1',
    Switzerland: 'UTC+1',
    Austria: 'UTC+1',
    Belgium: 'UTC+1',
    Netherlands: 'UTC+1',
    Luxembourg: 'UTC+1',
    Denmark: 'UTC+1',
    Norway: 'UTC+1',
    Sweden: 'UTC+1',
    Finland: 'UTC+2',
    Poland: 'UTC+1',
    Czechia: 'UTC+1',
    Slovakia: 'UTC+1',
    Hungary: 'UTC+1',
    Romania: 'UTC+2',
    Bulgaria: 'UTC+2',
    Croatia: 'UTC+1',
    Serbia: 'UTC+1',
    Slovenia: 'UTC+1',
    'Bosnia and Herz.': 'UTC+1',
    Greece: 'UTC+2',
    Turkey: 'UTC+3',
    Iceland: 'UTC+0',
    Malta: 'UTC+1',
    Cyprus: 'UTC+2',
    Singapore: 'UTC+8',
    Thailand: 'UTC+7',
    Vietnam: 'UTC+7',
    Myanmar: 'UTC+6:30',
    Cambodia: 'UTC+7',
    Laos: 'UTC+7',
    Brunei: 'UTC+8',
    'East Timor': 'UTC+9',
    Philippines: 'UTC+8',
    Indonesia: 'UTC+7 to +9',
    Malaysia: 'UTC+8',
    China: 'UTC+8',
    Japan: 'UTC+9',
    'South Korea': 'UTC+9',
    Australia: 'UTC+8 to +11',
    'New Zealand': 'UTC+12',
    'Papua New Guinea': 'UTC+10',
    Fiji: 'UTC+12',
  };

  /* ======================== Style constants ======================== */
  var ACCENT = '#0563bb';                  // Hub blue
  var CYAN = '#0dcaf0';                    // Active region neon cyan
  var GLASS_GREY = 'rgba(255,255,255,0.06)';  // Other fill
  var GRATICULE_COLOR = 'rgba(255,255,255,0.05)';
  var BORDER_COLOR = 'rgba(5,99,187,0.3)';
  var BG_COLOR = '#0b0d19';
  var FADED_OPACITY = 0.4;

  /* ======================== State ======================== */
  var svg, projection, pathGen, countriesG, pulseGroup;
  var tooltipEl = null;
  var features = [];
  var zoomBehavior = null;          // d3-zoom handle
  var initialProjection = null;     // for reset
  var zoomTransform = d3.zoomIdentity;

  /* ======================== Helpers ======================== */
  function tierFor(name) {
    if (HUB_COUNTRIES.has(name)) return 'hub';
    if (ACTIVE_COUNTRIES.has(name)) return 'active';
    return 'other';
  }

  function fillFor(name) {
    switch (tierFor(name)) {
      case 'hub': return '#00f3ff';
      case 'active': return 'rgba(5,99,187,0.4)';
      default: return 'rgba(255,255,255,0.08)';
    }
  }

  function strokeFor(name) {
    switch (tierFor(name)) {
      case 'hub': return '#ffffff';
      case 'active': return 'rgba(13,202,240,0.7)';
      default: return 'rgba(255,255,255,0.12)';
    }
  }

  function statusFor(name) {
    if (tierFor(name) === 'hub') return 'Instant WhatsApp Response';
    if (tierFor(name) === 'active') return 'Remote XR Deployment Ready';
    return 'Remote Collaboration Available';
  }

  function tzFor(name) {
    if (COUNTRY_TZ[name]) return COUNTRY_TZ[name];
    // Fallback: derive approximate offset from stored centroid longitude
    var feat = features.find(function (f) { return f.properties.name === name; });
    if (feat && feat.centroid) {
      var lon = feat.centroid[0];
      var offset = Math.round(lon / 15);
      return 'UTC' + (offset >= 0 ? '+' : '') + offset;
    }
    return 'Multiple timezones';
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ======================== Dimensions ======================== */
  function getDimensions() {
    var rect = wrapper.getBoundingClientRect();
    var w = rect.width || 600;
    var isMobile = w <= 767;
    var ratio = isMobile ? 4 / 3 : 21 / 9;
    return { width: w, height: w / ratio, isMobile: isMobile };
  }

  /* ======================== Pulse rings (CSS keyframes) ======================== */
  function addPulseRing(cx, cy, color, duration) {
    if (reducedMotion()) return;
    pulseGroup.append('circle')
      .attr('class', 'radar-pulse')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', 0)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .attr('filter', 'url(#radar-glow)')
      .style('animation', reducedMotion() ? 'none' : ('pulse-radar ' + duration + 'ms ease-out infinite'));
  }

  var renderPending = false;

  /* ======================== Main render ======================== */
  function render() {
    wrapper.innerHTML = '';
    var dim = getDimensions();
    var w = dim.width, h = dim.height;
    if (w === 0) { renderPending = true; setTimeout(render, 300); return; }
    renderPending = false;

    wrapper.style.aspectRatio = (w / h).toFixed(4);

    // Build control overlay
    buildControls();

    svg = d3.select(wrapper).append('svg')
      .attr('width', w)
      .attr('height', h)
      .attr('viewBox', '0 0 ' + w + ' ' + h)
      .attr('class', 'radar-svg')
      .style('display', 'block');

    /* Defs */
    var defs = svg.append('defs');
    var glow = defs.append('filter')
      .attr('id', 'radar-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', '2.5').attr('result', 'blur');
    var merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    /* Projection — Mercator fitted to viewport */
    var margin = 12;
    projection = d3.geoMercator()
      .fitExtent([[margin, margin], [w - margin, h - margin]], { type: 'Sphere' });
    initialProjection = projection;
    pathGen = d3.geoPath().projection(projection);

    /* Sphere outline */
    svg.append('path')
      .datum({ type: 'Sphere' })
      .attr('d', pathGen)
      .attr('fill', 'rgba(11,13,25,1)')
      .attr('stroke', BORDER_COLOR)
      .attr('stroke-width', 1);

    /* Graticule */
    svg.append('path')
      .datum(d3.geoGraticule().step([20, 20]))
      .attr('d', pathGen)
      .attr('fill', 'none')
      .attr('stroke', GRATICULE_COLOR)
      .attr('stroke-width', 0.5)
      .attr('pointer-events', 'none');

    /* Pulse rings layer */
    pulseGroup = svg.append('g').attr('class', 'pulse-group').attr('pointer-events', 'none');

    /* Countries layer */
    countriesG = svg.append('g').attr('class', 'countries-group');

    /* Load world TopoJSON */
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(function (world) {
        features = topojson.feature(world, world.objects.countries).features;
        var pulseCentroids = [];

        countriesG.selectAll('path')
          .data(features)
          .enter()
          .append('path')
          .attr('d', pathGen)
          .attr('class', 'country-path')
          .attr('data-name', function (d) { return d.properties.name; })
          .attr('fill', function (d) { return fillFor(d.properties.name); })
          .attr('stroke', function (d) { return strokeFor(d.properties.name); })
          .attr('stroke-width', function (d) { return tierFor(d.properties.name) === 'hub' ? 1.5 : 0.5; })
          .style('transition', 'opacity 0.25s ease, stroke 0.25s ease, stroke-width 0.25s ease, filter 0.25s ease')
          .style('cursor', 'pointer')
          .each(function (d) {
            var c = pathGen.centroid(d);
            if (!isNaN(c[0]) && !isNaN(c[1])) {
              pulseCentroids.push({ name: d.properties.name, x: c[0], y: c[1] });
            }
          })
          .on('mouseenter', function (event, d) { setHover(d.properties.name, event); })
          .on('mousemove', function (event, d) { positionTooltip(event); })
          .on('mouseleave', function () { clearHover(); })
          .on('click', function (event, d) { openWhatsApp(d.properties.name); });

        /* Malaysia locator pin — positioned via centroid projection */
        var malXY = [101.9758, 4.2105];
        var malProj = projection ? projection(malXY) : [w/2, h/2];
        if (malProj && !isNaN(malProj[0]) && !isNaN(malProj[1])) {
          var pinG = svg.append('g').attr('id', 'malaysia-radar-group').attr('class', 'malaysia-pin').attr('pointer-events', 'none');
          pinG.append('circle').attr('cx', malProj[0]).attr('cy', malProj[1]).attr('r', 3).attr('fill', '#00f3ff').attr('stroke', '#fff').attr('stroke-width', 0.5).attr('opacity', 1);
          // Scale-proportional localized pulse wave (tightly bounded 4→16px)
          pinG.append('circle').attr('cx', malProj[0]).attr('cy', malProj[1]).attr('r', 4).attr('fill', 'none').attr('stroke', '#00f3ff').attr('stroke-width', 1.5).attr('class', 'pulse-wave').attr('opacity', 0.6).style('animation', 'localized-pulse 2.5s ease-out infinite').attr('pointer-events', 'none');
        }

        /* Pulse rings — hub (Malaysia) */
        var hub = pulseCentroids.find(function (p) { return p.name === 'Malaysia'; });
        if (hub) addPulseRing(hub.x, hub.y, ACCENT, 2400);

        /* Pulse rings — representative active hubs (avoid clutter) */
        ['United States of America', 'Germany', 'Singapore', 'Australia', 'Japan'].forEach(function (name) {
          var p = pulseCentroids.find(function (c) { return c.name === name; });
          if (p) addPulseRing(p.x, p.y, CYAN, 2800);
        });

        /* Setup zoom / pan on the SVG */
        setupZoom(svg, countriesG);

        var loading = wrapper.querySelector('.radar-loading');
        if (loading) loading.remove();
      })
      .catch(function (err) {
        console.error('[global-map] Failed to load map data:', err);
        var loading = wrapper.querySelector('.radar-loading');
        if (loading) loading.textContent = 'Unable to load map.';
      });
  }

  /* ======================== Hover interactions ======================== */
  function setHover(name, event) {
    if (!countriesG) return;
    countriesG.selectAll('.country-path')
      .style('opacity', function (d) { return d.properties.name === name ? 1 : FADED_OPACITY; })
      .attr('stroke', function (d) {
        return d.properties.name === name ? ACCENT : strokeFor(d.properties.name);
      })
      .attr('stroke-width', function (d) {
        if (d.properties.name === name) return tierFor(name) === 'hub' ? 2.5 : 1.5;
        return tierFor(d.properties.name) === 'hub' ? 1.5 : 0.5;
      })
      .attr('filter', function (d) {
        return d.properties.name === name ? 'url(#radar-glow)' : null;
      });
    buildTooltip(name);
    if (event) positionTooltip(event);
  }

  function clearHover() {
    if (!countriesG) return;
    countriesG.selectAll('.country-path')
      .style('opacity', 1)
      .attr('stroke', function (d) { return strokeFor(d.properties.name); })
      .attr('stroke-width', function (d) { return tierFor(d.properties.name) === 'hub' ? 1.5 : 0.5; })
      .attr('filter', null);
    destroyTooltip();
  }

  /* ======================== Tooltip ======================== */
  function buildTooltip(name) {
    destroyTooltip();
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'radar-tooltip';
    tooltipEl.innerHTML =
      '<div class="radar-tooltip-name">' + name + '</div>' +
      '<div class="radar-tooltip-row"><span class="tt-label">Tz:</span> ' + tzFor(name) + '</div>' +
      '<div class="radar-tooltip-row"><span class="tt-label">Status:</span> ' + statusFor(name) + '</div>';
    wrapper.appendChild(tooltipEl);
    requestAnimationFrame(function () {
      if (tooltipEl) tooltipEl.classList.add('visible');
    });
  }

  function positionTooltip(event) {
    if (!tooltipEl || !wrapper) return;
    var rect = wrapper.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    var ttW = tooltipEl.offsetWidth || 180;
    var ttH = tooltipEl.offsetHeight || 60;
    var left = x + 14;
    var top = y - ttH - 8;
    // Keep tooltip within wrapper bounds
    if (left + ttW > rect.width) left = rect.width - ttW - 4;
    if (top < 4) top = y + 18;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }

  function destroyTooltip() {
    if (!tooltipEl) return;
    tooltipEl.classList.remove('visible');
    var el = tooltipEl;
    tooltipEl = null;
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 250);
  }

  /* ======================== Click action ======================== */
  function openWhatsApp(name) {
    if (!name) return;
    var url = 'https://wa.me/601126169814?text=Hi%20Wei%20Kit,%20reaching%20out%20from%20' + encodeURIComponent(name) + '!';
    window.open(url, '_blank', 'noopener');
  }

  /* ======================== Controls overlay ======================== */
  function buildControls() {
    var existing = wrapper.querySelector('.radar-controls');
    if (existing) existing.remove();
    var ctrl = document.createElement('div');
    ctrl.className = 'radar-controls';
    ctrl.innerHTML =
      '<button class="btn-zoom-in" aria-label="Zoom in" title="Zoom in"><i class="bi bi-plus-lg"></i></button>' +
      '<button class="btn-zoom-out" aria-label="Zoom out" title="Zoom out"><i class="bi bi-dash-lg"></i></button>' +
      '<button class="btn-reset" aria-label="Reset view" title="Reset view"><i class="bi bi-arrow-counterclockwise"></i></button>';
    wrapper.insertBefore(ctrl, wrapper.firstChild);

    ctrl.querySelector('.btn-zoom-in').addEventListener('click', function () { zoomIn(); });
    ctrl.querySelector('.btn-zoom-out').addEventListener('click', function () { zoomOut(); });
    ctrl.querySelector('.btn-reset').addEventListener('click', function () { resetView(); });
  }

  /* ======================== Zoom / Pan ======================== */
  function setupZoom(svgEl, countriesGroup) {
    zoomBehavior = d3.zoom()
      .scaleExtent([0.5, 8])
      .translateExtent([[0, 0], [svgEl.node().getBoundingClientRect().width, svgEl.node().getBoundingClientRect().height]])
      .on('zoom', function (event) {
        var t = event.transform;
        var s = t.k || 1;
        var inv = 1 / s;
        countriesGroup.attr('transform', t.toString());
        if (pulseGroup) pulseGroup.attr('transform', t.toString());
        // Dynamic inverse scaling for Malaysia radar dot + pulse
        var pin = svg.select('#malaysia-radar-group');
        if (pin) {
          pin.attr('transform', t.toString());
          var currentScale = t.k || 1;
          var baseRadius = 4;
          var clampedRadius = Math.max(1.5, Math.min(6, baseRadius / Math.sqrt(currentScale)));
          pin.select('circle').attr('r', clampedRadius);
          // Pulse ring stroke-width scales inversely; opacity fades when zoomed out
          pin.select('.pulse-wave')
            .attr('stroke-width', 1 / currentScale)
            .attr('opacity', (currentScale < 1.2 ? 0 : 0.6));
        }
      });
    svgEl.call(zoomBehavior);
  }

  function zoomIn() {
    if (!zoomBehavior || !svg) return;
    svg.transition().duration(250).call(zoomBehavior.scaleBy, 1.4);
  }

  function zoomOut() {
    if (!zoomBehavior || !svg) return;
    svg.transition().duration(250).call(zoomBehavior.scaleBy, 0.7);
  }

  function resetView() {
    if (!zoomBehavior || !svg) return;
    // Reset to initial projection and identity zoom
    if (initialProjection) {
      projection = initialProjection;
      pathGen = d3.geoPath().projection(projection);
    }
    svg.transition().duration(600)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(0,0).scale(1));
    // Re-draw paths with reset projection
    if (countriesG) countriesG.selectAll('.country-path').attr('d', pathGen);
  }

  /* ======================== Resize ======================== */
  var resizeTimer;
  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(); }, 220);
    });
    ro.observe(wrapper);
  } else {
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(); }, 220);
    });
  }

  /* ======================== Init ======================== */
  render();
})();
