/**
 * app.js
 * STS-31 Hubble Space Telescope Launch-to-LEO Orchestration Layer.
 * Auto-starts from T-00:00:10 countdown and renders Figma 463:863 telemetry,
 * Launch Complex 39B Tower, multi-stage Space Shuttle Discovery stack,
 * and Hubble Space Telescope deployment at 613.5 km Low Earth Orbit.
 */

(() => {
  const canvas = document.getElementById('simulation-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // DOM Telemetry Elements (Figma 463:863)
  const elThrust = document.getElementById('val-thrust');
  const elVelocity = document.getElementById('val-velocity');
  const elPressure = document.getElementById('val-pressure');
  const elClock = document.getElementById('val-clock');
  const elStart = document.getElementById('val-start');
  const elNextStage = document.getElementById('val-next-stage');
  const elDuration = document.getElementById('val-duration');
  const elAltitude = document.getElementById('val-altitude');
  const elDownrange = document.getElementById('val-downrange');
  const elTemperature = document.getElementById('val-temperature');
  const elFuel = document.getElementById('val-fuel');

  const engine = new RocketSimulationEngine();
  let currentState = engine.getTelemetryPayload();
  let lastTimestamp = 0;

  // Starfield for high-altitude mesosphere & 613.5 km Low Earth Orbit
  const stars = Array.from({ length: 140 }, () => ({
    xRatio: Math.random(),
    yRatio: Math.random() * 0.85,
    radius: 0.6 + Math.random() * 1.4,
    alpha: 0.35 + Math.random() * 0.65
  }));

  // Load Updated Resorces Assets
  const assetSources = {
    tower: 'Resorces/image 16.png',
    leftSRB: 'Resorces/Group 55.png',
    rightSRB: 'Resorces/Group 72.png',
    externalTank: 'Resorces/Group 71.png',
    orbiter: 'Resorces/Group 59.png'
  };

  const images = {};
  Object.keys(assetSources).forEach((key) => {
    const img = new Image();
    img.src = assetSources[key];
    images[key] = img;
  });

  function ready(img) {
    return img && img.complete && img.naturalWidth > 0;
  }

  /**
   * Updates all Figma 463:863 HUD DOM readouts & CSS variables (no inline styles)
   */
  function syncTelemetryDOM(state) {
    if (elClock) elClock.textContent = state.clock_formatted;
    if (elStart) elStart.textContent = state.start_label;
    if (elNextStage) elNextStage.textContent = state.next_stage_label;
    if (elDuration) elDuration.textContent = state.duration_label;

    if (elThrust) elThrust.textContent = state.thrust_display;
    if (elVelocity) elVelocity.textContent = state.velocity_kms.toFixed(2);
    if (elPressure) elPressure.textContent = state.pressure_kpa.toFixed(1);
    if (elAltitude) elAltitude.textContent = state.altitude_km.toFixed(1);
    if (elDownrange) elDownrange.textContent = state.downrange_km.toFixed(0);
    if (elTemperature) elTemperature.textContent = `${state.temperature_c}`;
    if (elFuel) elFuel.textContent = `${state.fuel_percent} %`;

    // Circular fuel ring arc (stroke-dasharray: 475 528)
    const maxArc = 475;
    const dashOffset = maxArc * (1 - state.fuel_percent / 100);
    document.documentElement.style.setProperty('--fuel-dashoffset', dashOffset.toFixed(2));

    // Zoom out ground & launchpad as Shuttle climbs from Pad 39B
    const padZoom = state.altitude_km <= 0
      ? 1.0
      : Math.max(0.0, 1 / (1 + state.altitude_km * 1.8) - state.altitude_km * 0.015);
    document.documentElement.style.setProperty('--camera-zoom', Math.max(0, padZoom).toFixed(4));
  }

  /**
   * Renders atmospheric color shades (#CAF0F8 -> #0077B6 -> #023E8A -> #03045E -> LEO Space)
   * and orbital horizon / starfield as altitude progresses from 0 km to 613.5 km.
   */
  function drawSkyAndAtmosphere(state) {
    const w = canvas.width;
    const h = canvas.height;
    const alt = state.altitude_km;

    // Normalized transition from pad (0 km) to LEO (613.5 km)
    const spaceFactor = Math.min(1, alt / 160);
    const grad = ctx.createLinearGradient(0, 0, 0, h);

    if (spaceFactor < 0.85) {
      grad.addColorStop(0, '#03045E');
      grad.addColorStop(Math.max(0.15, 0.36 - spaceFactor * 0.25), '#023E8A');
      grad.addColorStop(Math.max(0.35, 0.72 - spaceFactor * 0.42), '#0077B6');
      grad.addColorStop(1, spaceFactor < 0.35 ? '#CAF0F8' : '#0077B6');
    } else {
      // High-altitude / 613.5 km Low Earth Orbit dark space with Earth limb glow at bottom
      grad.addColorStop(0, '#010214');
      grad.addColorStop(0.55, '#03045E');
      grad.addColorStop(0.84, '#023E8A');
      grad.addColorStop(0.95, '#0077B6');
      grad.addColorStop(1, '#CAF0F8');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Stars fade in above 25 km altitude
    if (alt > 25) {
      const starVisibility = Math.min(1, (alt - 25) / 95);
      ctx.save();
      stars.forEach((s) => {
        ctx.fillStyle = `rgba(255, 255, 255, ${(s.alpha * starVisibility).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.xRatio * w, s.yRatio * h, s.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  }

  /**
   * Renders Launch Complex 39B Tower (Resorces/image 16.png) on the left of the pad.
   * Zooms out and drops away as Discovery lifts off.
   */
  function drawLaunchTower(state, scaleFactor) {
    if (state.altitude_km > 8 || !ready(images.tower)) return;

    const groundY = canvas.height * (1 - 0.092 * Math.max(0, 1 / (1 + state.altitude_km * 1.8)));
    const towerZoom = Math.max(0, 1 / (1 + state.altitude_km * 1.4));
    const dropOffset = state.altitude_km * 180;

    const towerW = 138 * scaleFactor * towerZoom;
    const towerH = 717 * scaleFactor * towerZoom;
    const towerX = canvas.width * 0.14;
    const towerY = groundY - towerH + dropOffset;

    if (towerY > canvas.height) return;

    ctx.save();
    ctx.globalAlpha = 0.62 * towerZoom;
    ctx.drawImage(images.tower, towerX, towerY, towerW, towerH);
    ctx.restore();
  }

  /**
   * Draws an engine exhaust plume beneath an engine nozzle
   */
  function drawExhaustPlume(x, y, width, length, isSRB) {
    const flicker = 0.92 + Math.random() * 0.16;
    const h = length * flicker;

    const grad = ctx.createRadialGradient(x, y + h * 0.25, width * 0.1, x, y + h * 0.45, h * 0.75);
    if (isSRB) {
      grad.addColorStop(0, 'rgba(255, 255, 240, 0.98)');
      grad.addColorStop(0.35, 'rgba(255, 195, 45, 0.92)');
      grad.addColorStop(0.7, 'rgba(255, 110, 20, 0.55)');
      grad.addColorStop(1, 'rgba(255, 80, 0, 0)');
    } else {
      // Liquid H2/O2 blue-white SSME plume
      grad.addColorStop(0, 'rgba(235, 250, 255, 0.95)');
      grad.addColorStop(0.45, 'rgba(110, 210, 255, 0.75)');
      grad.addColorStop(1, 'rgba(0, 119, 182, 0)');
    }

    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.42, width * 0.65, h * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Renders the deployed Hubble Space Telescope (HST) in 613.5 km Low Earth Orbit
   */
  function drawHubbleTelescope(cx, cy, scale, deployProgress) {
    if (deployProgress <= 0) return;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.min(1, deployProgress * 1.4);

    // Solar Array Wings (extend outward as deployProgress -> 1)
    const wingSpan = 28 + deployProgress * 64;
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-wingSpan, 0);
    ctx.lineTo(wingSpan, 0);
    ctx.stroke();

    // Left & Right Solar Panels
    ctx.fillStyle = '#023E8A';
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-wingSpan - 18, -32, 22, 64);
    ctx.strokeRect(-wingSpan - 18, -32, 22, 64);
    ctx.fillRect(wingSpan - 4, -32, 22, 64);
    ctx.strokeRect(wingSpan - 4, -32, 22, 64);

    // Hubble Silver Aft Shroud & Forward Optical Telescope Assembly Cylinder
    const bodyGrad = ctx.createLinearGradient(-16, 0, 16, 0);
    bodyGrad.addColorStop(0, '#9aa5b1');
    bodyGrad.addColorStop(0.5, '#f5f7fa');
    bodyGrad.addColorStop(1, '#7b8794');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(-16, -24, 32, 48);
    ctx.fillRect(-12, -52, 24, 28);

    // Open Aperture Door
    ctx.fillStyle = '#e4e7eb';
    ctx.beginPath();
    ctx.moveTo(-12, -52);
    ctx.lineTo(-22, -68);
    ctx.lineTo(-8, -68);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /**
   * Renders the complete STS-31 Space Shuttle Discovery stack using the updated Resorces PNGs:
   * - External Tank (Group 71.png)
   * - Left SRB (Group 55.png) & Right SRB (Group 72.png)
   * - Discovery Orbiter (Group 59.png)
   */
  function drawShuttleStack(state, scaleFactor) {
    const cx = canvas.width * 0.505;
    const baseGroundY = canvas.height * 0.908;

    // Smooth vertical position from Launch Pad 39B on ground up to orbital center viewport
    const climbProgress = Math.min(1, state.altitude_km / 45);
    const stackBaseY = baseGroundY - climbProgress * (canvas.height * 0.14);

    // Dimensions matching Figma 463:863 proportions scaled to viewport
    const etW = 112 * scaleFactor;
    const etH = 423 * scaleFactor;
    const srbW = 64 * scaleFactor;
    const srbH = 495 * scaleFactor;
    const orbW = 187 * scaleFactor;
    const orbH = 274 * scaleFactor;

    const etX = cx - etW * 0.5;
    const etY = stackBaseY - etH - 22 * scaleFactor;

    ctx.save();

    // 1. External Tank (Group 71.png) — detaches and drifts away after T+00:08:50 (ET SEP)
    if (!state.et_separated || state.et_sep_progress < 1) {
      const etSepP = state.et_sep_progress;
      const etDropY = etSepP * etSepP * 260 * scaleFactor;
      const etDriftX = -etSepP * 90 * scaleFactor;

      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - etSepP * 0.95);
      ctx.translate(etX + etW * 0.5 + etDriftX, etY + etH * 0.5 + etDropY);
      ctx.rotate(-etSepP * 0.22);
      if (ready(images.externalTank)) {
        ctx.drawImage(images.externalTank, -etW * 0.5, -etH * 0.5, etW, etH);
      }
      ctx.restore();
    }

    // 2. Left SRB (Group 55.png) & Right SRB (Group 72.png) — detach at T+00:02:04 (46.3 km)
    if (!state.srb_separated || state.srb_sep_progress < 1) {
      const sepP = state.srb_separated ? state.srb_sep_progress : 0;
      const spreadX = sepP * 195 * scaleFactor;
      const dropY = sepP * sepP * 310 * scaleFactor;
      const srbAlpha = Math.max(0, 1 - sepP * 0.95);

      const leftSrbX = cx - etW * 0.5 - srbW * 0.85 - spreadX;
      const rightSrbX = cx + etW * 0.5 - srbW * 0.15 + spreadX;
      const srbY = stackBaseY - srbH + dropY;

      if (state.srb_active) {
        drawExhaustPlume(leftSrbX + srbW * 0.5, srbY + srbH - 8 * scaleFactor, 38 * scaleFactor, 155 * scaleFactor, true);
        drawExhaustPlume(rightSrbX + srbW * 0.5, srbY + srbH - 8 * scaleFactor, 38 * scaleFactor, 155 * scaleFactor, true);
      }

      // Left SRB
      ctx.save();
      ctx.globalAlpha = srbAlpha;
      ctx.translate(leftSrbX + srbW * 0.5, srbY + srbH * 0.5);
      ctx.rotate(-sepP * 0.42);
      if (ready(images.leftSRB)) {
        ctx.drawImage(images.leftSRB, -srbW * 0.5, -srbH * 0.5, srbW, srbH);
      }
      ctx.restore();

      // Right SRB
      ctx.save();
      ctx.globalAlpha = srbAlpha;
      ctx.translate(rightSrbX + srbW * 0.5, srbY + srbH * 0.5);
      ctx.rotate(sepP * 0.42);
      if (ready(images.rightSRB)) {
        ctx.drawImage(images.rightSRB, -srbW * 0.5, -srbH * 0.5, srbW, srbH);
      }
      ctx.restore();
    }

    // 3. Space Shuttle Discovery Orbiter (Group 59.png)
    const orbX = cx - orbW * 0.5;
    const orbY = stackBaseY - orbH - 68 * scaleFactor;

    if (state.ssme_active) {
      drawExhaustPlume(cx, orbY + orbH - 4 * scaleFactor, 34 * scaleFactor, 120 * scaleFactor, false);
    }

    // Max-Q transonic condensation halo around T+00:00:52 (11 km)
    if (state.time >= 42 && state.time <= 62) {
      const qIntensity = 1 - Math.abs(state.time - 52) / 10;
      ctx.save();
      ctx.strokeStyle = `rgba(202, 240, 248, ${(qIntensity * 0.55).toFixed(2)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, orbY + orbH * 0.35, orbW * 0.68, 22 * scaleFactor, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (ready(images.orbiter)) {
      ctx.drawImage(images.orbiter, orbX, orbY, orbW, orbH);
    }

    // 4. Hubble Space Telescope Deployment in 613.5 km LEO (T+00:42:15)
    if (state.hubble_deployed) {
      const hubbleY = orbY - (55 + state.hubble_deploy_progress * 85) * scaleFactor;
      drawHubbleTelescope(cx, hubbleY, scaleFactor, state.hubble_deploy_progress);
    }

    // 5. Subtle Stage Status Caption at bottom of viewport
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '300 13px "Google Sans Flex", Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    const caption = state.completed
      ? 'STS-31 HUBBLE SPACE TELESCOPE DEPLOYED IN LOW EARTH ORBIT (613.5 KM) — CLICK TO REPLAY'
      : `STS-31 DISCOVERY  |  STAGE: ${state.phase}`;
    ctx.fillText(caption, canvas.width * 0.5, canvas.height - 26);

    ctx.restore();
  }

  /**
   * Main Animation Loop (starts automatically on load from T-00:00:10 countdown)
   */
  function animate(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    currentState = engine.update(dt);
    syncTelemetryDOM(currentState);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleFactor = Math.min(1.0, Math.max(0.55, canvas.height / 1024));

    drawSkyAndAtmosphere(currentState);
    drawLaunchTower(currentState, scaleFactor);
    drawShuttleStack(currentState, scaleFactor);

    requestAnimationFrame(animate);
  }

  // Click anywhere after orbital deployment to restart from T-00:00:10 countdown
  window.addEventListener('click', () => {
    if (currentState.completed) {
      currentState = engine.reset();
      syncTelemetryDOM(currentState);
    }
  });

  function handleResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', handleResize);
  handleResize();
  syncTelemetryDOM(currentState);
  requestAnimationFrame(animate);
})();
