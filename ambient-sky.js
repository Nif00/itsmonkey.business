(() => {
  "use strict";

  const DAY_MS = 86_400_000;
  const SYNODIC_MONTH = 29.530588853;
  const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
  const PHASE_NAMES = [
    "new moon",
    "waxing crescent",
    "first quarter",
    "waxing gibbous",
    "full moon",
    "waning gibbous",
    "last quarter",
    "waning crescent",
  ];
  const OUTPUT_COLUMNS = 88;
  const OUTPUT_ROWS = 48;
  const MOON_RADIUS_COLUMNS = OUTPUT_COLUMNS * 0.45;
  const MOON_RADIUS_ROWS = OUTPUT_ROWS * 0.45;
  const BIRD_SCALE = 0.5;
  const BIRD_CENTER_Y = 0.34;
  const ASCII_RAMP = " .:-=+*#%@";
  const REACH_COLUMNS = 43;
  const REACH_ROWS = 42;
  const REACH_CELL_WIDTH = 12;
  const REACH_CELL_HEIGHT = 14;
  const REACH_RAMP = [" ", " ", " ", ".", ":", ">", "~", "×", "*", "#"];
  const CRATERS = [
    [-0.52, -0.38, 0.11],
    [-0.12, -0.52, 0.07],
    [0.35, -0.38, 0.09],
    [0.58, -0.08, 0.075],
    [0.42, 0.28, 0.12],
    [-0.46, 0.31, 0.09],
    [0.02, 0.18, 0.06],
  ];
  const WIND_GLYPHS = [".", ":", ">", "~", "×", "+"];
  const WIND_STEPS = 18;
  const STAR_FIELD = [
    [4, 14, "."], [10, 31, "+"], [16, 8, "."], [22, 21, "."],
    [31, 12, "."], [38, 27, "+"], [45, 7, "."], [53, 18, "."],
    [61, 33, "."], [68, 10, "+"], [73, 25, "."], [80, 5, "."],
    [88, 30, "."], [94, 16, "+"], [97, 37, "."],
  ];
  const PAGE_STAR_COUNT = 34;

  const SOURCE = globalThis.LUNAR_MARK_SOURCE;
  if (!SOURCE) {
    console.warn("Lunar mark source data was not loaded.");
    return;
  }

  const SOURCE_LUMINANCE = Uint8Array.from(
    atob(SOURCE.luminanceBase64),
    (character) => character.charCodeAt(0),
  );
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sky = document.createElement("div");
  sky.className = "ambient-sky";
  sky.setAttribute("aria-hidden", "true");
  sky.innerHTML = `
    <div class="ambient-stars"></div>
    <div class="lunar-lockup">
      <div class="lunar-orbit"><span>+</span></div>
      <div class="lunar-meta">
        <span class="lunar-phase-name"></span>
        <span class="lunar-age"></span>
      </div>
      <canvas class="lunar-reach-canvas reach-right" width="1032" height="1176"></canvas>
      <pre class="lunar-ascii-mark"></pre>
      <pre class="lunar-meter"></pre>
      <span class="lunar-bearing">052.3 / +19.7</span>
    </div>`;
  const pageStars = document.createElement("div");
  pageStars.className = "ambient-page-stars";
  pageStars.setAttribute("aria-hidden", "true");
  document.body.prepend(pageStars, sky);

  const stars = sky.querySelector(".ambient-stars");
  const lunarMark = sky.querySelector(".lunar-ascii-mark");
  const reachCanvas = sky.querySelector(".lunar-reach-canvas");
  const phaseName = sky.querySelector(".lunar-phase-name");
  const lunarAge = sky.querySelector(".lunar-age");
  const lunarMeter = sky.querySelector(".lunar-meter");
  let windTimer;
  let meteorTimer;
  let reachAnimationFrame;
  let reachPrevious = 0;
  let reachDensity = [];
  let reachTime = 0;

  for (let index = 0; index < PAGE_STAR_COUNT; index += 1) {
    const leftSide = index % 2 === 0;
    const inset = index % 7 === 0 ? 13 + (index * 3) % 4 : 2 + (index * 7) % 9;
    const x = leftSide ? inset : 100 - inset;
    const y = 3 + (index * 29) % 94;
    const flickers = index % 3 === 0;

    const star = document.createElement("span");
    star.className = `ambient-page-star${flickers ? " is-flickering" : ""}`;
    star.textContent = "+";
    star.style.setProperty("--page-star-x", `${x}%`);
    star.style.setProperty("--page-star-y", `${y}%`);
    star.style.setProperty("--star-opacity", (0.11 + (index % 5) * 0.018).toFixed(3));
    star.style.setProperty("--star-floor", (0.025 + (index % 4) * 0.012).toFixed(3));
    star.style.setProperty("--star-peak", (0.12 + (index % 5) * 0.018).toFixed(3));
    star.style.setProperty("--flicker-duration", `${8 + (index % 6) * 1.7}s`);
    star.style.setProperty("--flicker-delay", `${-(index * 1.9).toFixed(1)}s`);
    star.style.fontSize = `${6 + index % 3}px`;
    pageStars.append(star);
  }

  STAR_FIELD.forEach(([x, y, glyph], index) => {
    const star = document.createElement("span");
    star.className = `ambient-star${glyph === "+" ? " is-major" : ""}`;
    star.textContent = glyph;
    star.style.setProperty("--star-x", `${x}%`);
    star.style.setProperty("--star-y", `${y}%`);
    star.style.setProperty("--star-delay", `${(index * 1.7).toFixed(1)}s`);
    stars.append(star);
  });

  function syncPageStarHeight() {
    const contentRoot = document.querySelector(".site-shell");
    const contentHeight = contentRoot ? contentRoot.offsetTop + contentRoot.offsetHeight : 0;
    const height = Math.max(window.innerHeight, contentHeight);
    pageStars.style.height = `${height}px`;
  }

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function smoothstep(edge0, edge1, value) {
    const amount = clamp((value - edge0) / (edge1 - edge0));
    return amount * amount * (3 - 2 * amount);
  }

  function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function lunarPhase(date = new Date()) {
    const age = ((date.getTime() - KNOWN_NEW_MOON) / DAY_MS) % SYNODIC_MONTH;
    return ((age + SYNODIC_MONTH) % SYNODIC_MONTH) / SYNODIC_MONTH;
  }

  function sampleSource(normalizedX, normalizedY) {
    const sourceX = SOURCE.centerX + normalizedX * SOURCE.radiusX;
    const sourceY = SOURCE.centerY + normalizedY * SOURCE.radiusY;
    const x0 = Math.max(0, Math.min(SOURCE.width - 1, Math.floor(sourceX)));
    const y0 = Math.max(0, Math.min(SOURCE.height - 1, Math.floor(sourceY)));
    const x1 = Math.min(SOURCE.width - 1, x0 + 1);
    const y1 = Math.min(SOURCE.height - 1, y0 + 1);
    const xAmount = sourceX - x0;
    const yAmount = sourceY - y0;
    const top = SOURCE_LUMINANCE[y0 * SOURCE.width + x0] * (1 - xAmount) + SOURCE_LUMINANCE[y0 * SOURCE.width + x1] * xAmount;
    const bottom = SOURCE_LUMINANCE[y1 * SOURCE.width + x0] * (1 - xAmount) + SOURCE_LUMINANCE[y1 * SOURCE.width + x1] * xAmount;
    return top * (1 - yAmount) + bottom * yAmount;
  }

  function birdMaskAt(moonX, moonY) {
    const sourceX = moonX / BIRD_SCALE;
    const sourceY = (moonY - BIRD_CENTER_Y) / BIRD_SCALE;
    const sourceDistance = Math.sqrt(sourceX * sourceX + sourceY * sourceY);
    const sourceDisc = clamp((1.035 - sourceDistance) / 0.07);

    if (sourceDisc <= 0.01) {
      return 0;
    }

    const source = sampleSource(sourceX, sourceY) / 255;
    return clamp(1 - source / Math.max(sourceDisc, 0.08));
  }

  function craterToneAt(x, y) {
    let tone = 0.94;

    CRATERS.forEach(([centerX, centerY, radius]) => {
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      const interior = 1 - smoothstep(radius * 0.12, radius * 0.82, distance);
      const ring = 1 - smoothstep(0, radius * 0.13, Math.abs(distance - radius));
      tone -= interior * 0.18;
      tone += ring * 0.16;
    });

    return clamp(tone, 0.64, 1);
  }

  function dotMatrixMoon(phase) {
    const terminator = Math.cos(phase * Math.PI * 2);
    const waxing = phase <= 0.5;
    const rows = [];

    for (let row = 0; row < OUTPUT_ROWS; row += 1) {
      const moonY = (row - (OUTPUT_ROWS - 1) / 2) / MOON_RADIUS_ROWS;
      const limb = Math.sqrt(Math.max(0, 1 - moonY * moonY));
      let line = "";

      for (let column = 0; column < OUTPUT_COLUMNS; column += 1) {
        const moonX = (column - (OUTPUT_COLUMNS - 1) / 2) / MOON_RADIUS_COLUMNS;
        const distance = Math.sqrt(moonX * moonX + moonY * moonY);
        const disc = clamp((1.04 - distance) / 0.075);

        if (disc <= 0.01) {
          line += " ";
          continue;
        }

        const crowMask = birdMaskAt(moonX, moonY);
        const boundary = terminator * limb;
        const signedDistance = waxing ? moonX - boundary : boundary - moonX;
        const moonLight = clamp(0.5 + signedDistance * 9);
        const xorSignal = moonLight + crowMask - 2 * moonLight * crowMask;
        const craterTone = craterToneAt(moonX, moonY);
        const luminance = clamp(disc * xorSignal * craterTone);
        const characterIndex = Math.round(Math.pow(luminance, 0.92) * (ASCII_RAMP.length - 1));
        line += ASCII_RAMP[characterIndex];
      }

      rows.push(line.replace(/\s+$/, ""));
    }

    return rows.join("\n");
  }

  function artLevel(lines, x, y) {
    const row = lines[Math.max(0, Math.min(lines.length - 1, y))] || "";
    const glyph = row[Math.max(0, Math.min(OUTPUT_COLUMNS - 1, x))] || " ";
    return Math.max(0, ASCII_RAMP.indexOf(glyph)) / (ASCII_RAMP.length - 1);
  }

  function sampleArt(lines, x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(OUTPUT_COLUMNS - 1, x0 + 1);
    const y1 = Math.min(OUTPUT_ROWS - 1, y0 + 1);
    const xAmount = x - x0;
    const yAmount = y - y0;
    const top = artLevel(lines, x0, y0) * (1 - xAmount) + artLevel(lines, x1, y0) * xAmount;
    const bottom = artLevel(lines, x0, y1) * (1 - xAmount) + artLevel(lines, x1, y1) * xAmount;
    return top * (1 - yAmount) + bottom * yAmount;
  }

  function buildReachDensity(art) {
    const lines = art.split("\n");
    const moonRows = 38;
    const rowOffset = 2;
    const density = [];

    for (let row = 0; row < REACH_ROWS; row += 1) {
      const line = [];
      const normalizedY = (row - rowOffset) / (moonRows - 1);

      for (let column = 0; column < REACH_COLUMNS; column += 1) {
        if (normalizedY < 0 || normalizedY > 1) {
          line.push(0);
          continue;
        }

        const sourceX = column / (REACH_COLUMNS - 1) * (OUTPUT_COLUMNS - 1);
        const sourceY = normalizedY * (OUTPUT_ROWS - 1);
        const base = Math.pow(sampleArt(lines, sourceX, sourceY), 0.86);
        line.push(base < 0.025 ? 0 : base);
      }

      density.push(line);
    }

    return density;
  }

  function reachField(x, y, time) {
    const a = x * 0.55;
    const b = y * 0.35;
    const value = Math.sin(a + 2.1 * Math.sin(b * 0.9 + time) + time * 0.7)
      * Math.cos(b - 1.7 * Math.sin(a * 0.6 - time * 0.8));
    return 0.5 + 0.5 * value;
  }

  function drawReachCanvas(time = 0) {
    const context = reachCanvas.getContext("2d");
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = REACH_COLUMNS * REACH_CELL_WIDTH;
    const height = REACH_ROWS * REACH_CELL_HEIGHT;

    if (reachCanvas.width !== width * scale || reachCanvas.height !== height * scale) {
      reachCanvas.width = width * scale;
      reachCanvas.height = height * scale;
    }

    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    context.textBaseline = "top";
    context.font = '10px "IBM Plex Mono", "SFMono-Regular", Consolas, monospace';

    for (let row = 0; row < REACH_ROWS; row += 1) {
      for (let column = 0; column < REACH_COLUMNS; column += 1) {
        const base = reachDensity[row]?.[column] || 0;
        if (!base) {
          continue;
        }

        const value = base * (0.72 + 0.58 * reachField(column + 151, row, time));
        const rampIndex = Math.min(REACH_RAMP.length - 1, Math.floor(value * REACH_RAMP.length));
        const glyph = REACH_RAMP[rampIndex];
        if (glyph === " ") {
          continue;
        }

        const alpha = 0.13 + value * 0.5;
        context.fillStyle = `rgba(199, 229, 255, ${alpha.toFixed(2)})`;
        context.fillText(glyph, column * REACH_CELL_WIDTH + 2, row * REACH_CELL_HEIGHT + 2);
      }
    }
  }

  function animateReach(timestamp) {
    if (reducedMotion.matches) {
      reachAnimationFrame = undefined;
      drawReachCanvas(0);
      return;
    }

    if (timestamp - reachPrevious > 66) {
      reachPrevious = timestamp;
      reachTime = timestamp * 0.00022;
      drawReachCanvas(reachTime);
    }

    reachAnimationFrame = window.requestAnimationFrame(animateReach);
  }

  function syncReachMotion() {
    if (reachAnimationFrame) {
      window.cancelAnimationFrame(reachAnimationFrame);
      reachAnimationFrame = undefined;
    }

    reachPrevious = 0;
    if (reducedMotion.matches) {
      reachTime = 0;
      drawReachCanvas(0);
    } else {
      reachAnimationFrame = window.requestAnimationFrame(animateReach);
    }
  }

  function renderMoon() {
    const phase = lunarPhase();
    const age = phase * SYNODIC_MONTH;
    const phaseIndex = Math.round(phase * 8) % 8;
    const illuminated = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    const meterLength = 12;
    const litCells = Math.round(illuminated * meterLength);

    const art = dotMatrixMoon(phase);
    lunarMark.dataset.phase = PHASE_NAMES[phaseIndex];
    lunarMark.textContent = art;
    reachDensity = buildReachDensity(art);
    drawReachCanvas(reachTime);
    phaseName.textContent = `LUNA / ${PHASE_NAMES[phaseIndex]}`;
    lunarAge.textContent = `DAY ${age.toFixed(1).padStart(4, "0")}`;
    lunarMeter.textContent = `[${"=".repeat(litCells)}${".".repeat(meterLength - litCells)}] ${(illuminated * 100).toFixed(0).padStart(3, "0")}%`;
  }

  function scheduleWind(delay = randomBetween(45_000, 100_000)) {
    window.clearTimeout(windTimer);
    windTimer = window.setTimeout(spawnWind, delay);
  }

  function spawnWind() {
    if (document.hidden || reducedMotion.matches) {
      scheduleWind(90_000);
      return;
    }

    const current = document.createElement("div");
    const reverse = Math.random() < 0.32;
    const maximumLeft = window.innerWidth <= 520 ? 28 : 52;
    current.className = `ambient-wind-current${reverse ? " is-reverse" : ""}`;
    current.style.setProperty("--wind-top", `${randomBetween(62, 142).toFixed(1)}px`);
    current.style.setProperty("--wind-left", `${randomBetween(4, maximumLeft).toFixed(1)}%`);

    for (let lane = 0; lane < 3; lane += 1) {
      for (let step = 0; step < WIND_STEPS; step += 1) {
        const glyph = document.createElement("span");
        const activationStep = reverse ? WIND_STEPS - 1 - step : step;
        const y = 16 + lane * 27 + Math.sin(step * 0.82 + lane * 1.7) * 7;
        glyph.textContent = WIND_GLYPHS[(step * 3 + lane * 5) % WIND_GLYPHS.length];
        glyph.style.left = `${(step / (WIND_STEPS - 1) * 100).toFixed(2)}%`;
        glyph.style.top = `${y.toFixed(2)}%`;
        glyph.style.setProperty("--wind-delay", `${(activationStep * 0.18 + lane * 0.035).toFixed(3)}s`);
        glyph.style.setProperty("--wind-rest", (0.012 + lane * 0.006).toFixed(3));
        glyph.style.setProperty("--wind-peak", (0.32 + (step % 4) * 0.055).toFixed(3));
        current.append(glyph);
      }
    }

    sky.append(current);
    const lifetime = (WIND_STEPS - 1) * 180 + 2_300;
    windTimer = window.setTimeout(() => {
      current.remove();
      scheduleWind(randomBetween(240_000, 540_000));
    }, lifetime);
  }

  function scheduleMeteor(delay = randomBetween(360_000, 900_000)) {
    window.clearTimeout(meteorTimer);
    meteorTimer = window.setTimeout(spawnMeteor, delay);
  }

  function spawnMeteor() {
    if (document.hidden || reducedMotion.matches) {
      scheduleMeteor(180_000);
      return;
    }

    const meteor = document.createElement("pre");
    meteor.className = "ambient-meteor";
    meteor.textContent = "...........*";
    meteor.style.setProperty("--meteor-top", `${randomBetween(30, 132).toFixed(1)}px`);
    meteor.style.setProperty("--meteor-left", `${randomBetween(10, 62).toFixed(1)}%`);
    sky.append(meteor);

    meteor.addEventListener("animationend", () => {
      meteor.remove();
      scheduleMeteor();
    }, { once: true });
  }

  function handleMotionPreference() {
    syncReachMotion();
    if (reducedMotion.matches) {
      window.clearTimeout(windTimer);
      window.clearTimeout(meteorTimer);
      sky.querySelectorAll(".ambient-wind-current, .ambient-meteor").forEach((item) => item.remove());
      return;
    }

    scheduleWind();
    scheduleMeteor();
  }

  renderMoon();
  syncPageStarHeight();
  window.requestAnimationFrame(syncPageStarHeight);
  new ResizeObserver(syncPageStarHeight).observe(document.querySelector(".site-shell") || document.body);
  window.setInterval(renderMoon, 6 * 60 * 60 * 1000);
  reducedMotion.addEventListener?.("change", handleMotionPreference);
  handleMotionPreference();
})();
