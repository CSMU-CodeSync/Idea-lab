/**
 * app.js
 * STS-31 Hubble Space Telescope Launch-to-LEO Orchestration Layer.
 * Features:
 * - Auto-start T-00:00:10 countdown (no Play button)
 * - 28.45° Inclined Curved Gravity-Turn Trajectory Trace & Pitch-Over Rotation
 * - Multi-stage SRB (Group 55/72) & External Tank (Group 71) separation
 * - Payload Fairing / Bay Opening, Stowed Hubble (Group 64) Extraction,
 *   and Step-by-Step Solar Wing (Group 61) & High-Gain Antenna (Group 63) Unfolding
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
  const stars = Array.from({ length: 150 }, () => ({
    xRatio: Math.random(),
    yRatio: Math.random() * 0.86,
    radius: 0.6 + Math.random() * 1.4,
    alpha: 0.35 + Math.random() * 0.65
  }));

  // Load Updated Resorces Assets
  const assetSources = {
    tower: 'Resorces/image 16.png',
    leftSRB: 'Resorces/Group 55.png',
    rightSRB: 'Resorces/Group 72.png',
    externalTank: 'Resorces/Group 71.png',
    orbiter: 'Resorces/Group 59.png',
    hubbleComplete: 'Resorces/complete_hubble_tel.png',
    hubbleBody: 'Resorces/Group 64.png',
    hubbleWing: 'Resorces/Group 61.png',
    hubbleAntenna: 'Resorces/Group 63.png'
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
   * Evaluates a point and tangent on the 28.45° inclined orbital ascent curve (Quadratic Bezier).
   * Keeps the entire flight path inside the safe central viewport below the top HUD.
   */
  function getTrajectoryPoint(u) {
    const w = canvas.width;
    const h = canvas.height;

    const p0x = w * 0.38;
    const p0y = h * 0.72;
    const p1x = w * 0.44;
    const p1y = Math.max(290, h * 0.43);
    const p2x = w * 0.66;
    const p2y = Math.max(320, h * 0.46);

    const inv = 1 - u;
    const x = inv * inv * p0x + 2 * inv * u * p1x + u * u * p2x;
    const y = inv * inv * p0y + 2 * inv * u * p1y + u * u * p2y;

    return { x, y, p0x, p0y, p1x, p1y, p2x, p2y };
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

    const maxArc = 475;
    const dashOffset = maxArc * (1 - state.fuel_percent / 100);
    document.documentElement.style.setProperty('--fuel-dashoffset', dashOffset.toFixed(2));

    const padZoom = state.altitude_km <= 0
      ? 1.0
      : Math.max(0.0, 1 / (1 + state.altitude_km * 1.8) - state.altitude_km * 0.015);
    document.documentElement.style.setProperty('--camera-zoom', Math.max(0, padZoom).toFixed(4));
  }

  /**
   * Renders atmospheric color shades (#CAF0F8 -> #0077B6 -> #023E8A -> #03045E -> LEO Space)
   */
  function drawSkyAndAtmosphere(state) {
    const w = canvas.width;
    const h = canvas.height;
    const alt = state.altitude_km;

    const spaceFactor = Math.min(1, alt / 150);
    const grad = ctx.createLinearGradient(0, 0, 0, h);

    if (spaceFactor < 0.85) {
      grad.addColorStop(0, '#03045E');
      grad.addColorStop(Math.max(0.15, 0.36 - spaceFactor * 0.25), '#023E8A');
      grad.addColorStop(Math.max(0.35, 0.72 - spaceFactor * 0.42), '#0077B6');
      grad.addColorStop(1, spaceFactor < 0.35 ? '#CAF0F8' : '#0077B6');
    } else {
      grad.addColorStop(0, '#010214');
      grad.addColorStop(0.58, '#03045E');
      grad.addColorStop(0.86, '#023E8A');
      grad.addColorStop(0.96, '#0077B6');
      grad.addColorStop(1, '#CAF0F8');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (alt > 20) {
      const starVisibility = Math.min(1, (alt - 20) / 90);
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
   * Draws the 28.45° Inclined Gravity-Turn Trajectory Curve & Milestone Waypoints
   */
  function drawInclinedTrajectory(state) {
    const startPt = getTrajectoryPoint(0);
    const endPt = getTrajectoryPoint(1);

    ctx.save();

    // 1. Planned Orbital Trajectory Guide Curve (dashed)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(startPt.p0x, startPt.p0y);
    ctx.quadraticCurveTo(startPt.p1x, startPt.p1y, startPt.p2x, startPt.p2y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Active Traveled Trajectory Curve (glowing cyan)
    if (state.traj_u > 0.005) {
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(0, 229, 255, 0.65)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const u = (state.traj_u * i) / steps;
        const pt = getTrajectoryPoint(u);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 3. Trajectory Milestone Waypoint Dots & Labels
    const waypoints = [
      { u: 0.22, label: 'MAX-Q (11 km)' },
      { u: 0.42, label: 'SRB SEP (46.3 km)' },
      { u: 0.72, label: 'MECO / ET SEP (115 km)' },
      { u: 0.97, label: 'LEO 613.5 km (28.45° INC)' }
    ];

    ctx.font = '300 11px "Google Sans Flex", Inter, sans-serif';
    waypoints.forEach((wp) => {
      const pt = getTrajectoryPoint(wp.u);
      const reached = state.traj_u >= wp.u;
      ctx.fillStyle = reached ? '#00e5ff' : 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, reached ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = reached ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.45)';
      ctx.fillText(wp.label, pt.x + 8, pt.y + 14);
    });

    ctx.restore();
  }

  /**
   * Renders Launch Complex 39B Tower (Resorces/image 16.png) on the left of the pad.
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
   * Draws an engine exhaust plume in local vehicle coordinates
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
   * Renders Fairing Clamshell Split + Stowed Hubble (Group 64) Extraction +
   * Step-by-Step Solar Wings (Group 61) & Antenna (Group 63) Unfolding in 613.5 km LEO.
   */
  function drawFairingAndHubbleDeployment(anchorX, anchorY, scale, state) {
    const fairP = state.fairing_open_progress;
    const extP = state.hubble_extract_progress;
    const unfP = state.hubble_unfold_progress;

    ctx.save();
    ctx.translate(anchorX, anchorY);
    ctx.scale(scale, scale);

    // 1. Protective Payload Fairing Halves splitting open around Hubble
    if (fairP < 1.0 || extP < 0.85) {
      const fairAlpha = Math.max(0, 1 - extP * 0.95);
      const splitOffset = fairP * 78;
      const fairTilt = fairP * 0.38;

      ctx.save();
      ctx.globalAlpha = fairAlpha;
      ctx.fillStyle = '#e6e9ef';
      ctx.strokeStyle = '#9aa5b1';
      ctx.lineWidth = 2;

      // Top / Left Fairing Shell
      ctx.save();
      ctx.translate(-splitOffset, -splitOffset * 0.35);
      ctx.rotate(-fairTilt);
      ctx.beginPath();
      ctx.moveTo(0, -115);
      ctx.quadraticCurveTo(-52, -75, -52, 85);
      ctx.lineTo(-4, 85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Bottom / Right Fairing Shell
      ctx.save();
      ctx.translate(splitOffset, splitOffset * 0.35);
      ctx.rotate(fairTilt);
      ctx.beginPath();
      ctx.moveTo(0, -115);
      ctx.quadraticCurveTo(52, -75, 52, 85);
      ctx.lineTo(4, 85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }

    // 2. Hubble Telescope emerging from inside the fairing & unfolding its wings/antennas
    const emergeOffsetX = extP * 65;
    const emergeOffsetY = -extP * 24;
    const hubbleScale = 0.55 + 0.32 * extP;

    ctx.save();
    ctx.translate(emergeOffsetX, emergeOffsetY);
    ctx.scale(hubbleScale, hubbleScale);

    // Cross-fade to complete_hubble_tel.png at the end of unfolding, or animate individual parts
    if (unfP >= 0.98 && ready(images.hubbleComplete)) {
      ctx.drawImage(images.hubbleComplete, -115, -130, 230, 260);
    } else {
      // A) Unfolding High-Gain Antennas (Group 63.png)
      if (unfP > 0.05 && ready(images.hubbleAntenna)) {
        const antProgress = Math.min(1, unfP * 1.4);
        // Upper-left antenna boom
        ctx.save();
        ctx.translate(-26, -32);
        ctx.rotate(Math.PI - antProgress * 0.78);
        ctx.drawImage(images.hubbleAntenna, -14, 0, 28, 105 * antProgress);
        ctx.restore();

        // Lower-right antenna boom
        ctx.save();
        ctx.translate(28, 56);
        ctx.rotate(-antProgress * 0.45);
        ctx.drawImage(images.hubbleAntenna, -11, 0, 22, 65 * antProgress);
        ctx.restore();
      }

      // B) Unfolding Left & Right Solar Array Wings (Group 61.png)
      if (unfP > 0.15 && ready(images.hubbleWing)) {
        const wingP = Math.min(1, (unfP - 0.15) / 0.85);
        const wingW = 72 * wingP;
        const wingH = 165;

        // Right Solar Wing extending outward
        ctx.save();
        ctx.translate(30, -72);
        ctx.drawImage(images.hubbleWing, 0, 0, wingW, wingH);
        ctx.restore();

        // Left Solar Wing (mirrored horizontally) extending outward
        ctx.save();
        ctx.translate(-30, -72);
        ctx.scale(-1, 1);
        ctx.drawImage(images.hubbleWing, 0, 0, wingW, wingH);
        ctx.restore();
      }

      // C) Stowed Hubble Main Cylindrical Body (Group 64.png) emerging from fairing
      if (ready(images.hubbleBody)) {
        ctx.drawImage(images.hubbleBody, -42, -112, 84, 224);
      }
    }

    ctx.restore();
    ctx.restore();
  }

  /**
   * Renders the complete STS-31 Space Shuttle Discovery stack following the
   * 28.45° inclined trajectory curve and pitching from 90° vertical to 0° horizontal.
   */
  function drawShuttleStack(state, scaleFactor) {
    const pt = getTrajectoryPoint(state.traj_u);

    // Scale stack down smoothly as it climbs from Pad 39B into orbit
    const climbRatio = Math.min(1, state.traj_u * 1.35);
    const vehicleScale = scaleFactor * (1.0 - climbRatio * 0.42);

    //On pad (traj_u == 0), anchor base of SRBs on the launchpad
    const baseGroundY = canvas.height * 0.908;
    const stackCenterX = state.traj_u < 0.02
      ? pt.p0x
      : pt.x;
    const stackCenterY = state.traj_u < 0.02
      ? baseGroundY - 245 * vehicleScale
      : pt.y;

    // Rotation angle from vertical (0 rad = upright 90° pitch; PI/2 rad = horizontal 0° pitch)
    const tiltRad = ((90 - state.pitch_deg) * Math.PI) / 180;

    const etW = 112 * vehicleScale;
    const etH = 423 * vehicleScale;
    const srbW = 64 * vehicleScale;
    const srbH = 495 * vehicleScale;
    const orbW = 187 * vehicleScale;
    const orbH = 274 * vehicleScale;

    ctx.save();
    ctx.translate(stackCenterX, stackCenterY);
    ctx.rotate(tiltRad);

    // 1. External Tank (Group 71.png) — detaches at T+00:08:50
    if (!state.et_separated || state.et_sep_progress < 1) {
      const etSepP = state.et_sep_progress;
      const etDropY = etSepP * etSepP * 240 * vehicleScale;
      const etDriftX = -etSepP * 110 * vehicleScale;

      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - etSepP * 0.95);
      ctx.translate(etDriftX, etDropY);
      ctx.rotate(-etSepP * 0.28);
      if (ready(images.externalTank)) {
        ctx.drawImage(images.externalTank, -etW * 0.5, -etH * 0.5, etW, etH);
      }
      ctx.restore();
    }

    // 2. Left SRB (Group 55.png) & Right SRB (Group 72.png) — detach at T+00:02:04
    if (!state.srb_separated || state.srb_sep_progress < 1) {
      const sepP = state.srb_separated ? state.srb_sep_progress : 0;
      const spreadX = sepP * 185 * vehicleScale;
      const dropY = sepP * sepP * 290 * vehicleScale;
      const srbAlpha = Math.max(0, 1 - sepP * 0.95);

      const leftSrbX = -etW * 0.5 - srbW * 0.35 - spreadX;
      const rightSrbX = etW * 0.5 + srbW * 0.35 + spreadX;
      const srbY = 20 * vehicleScale + dropY;

      if (state.srb_active) {
        drawExhaustPlume(leftSrbX, srbY + srbH * 0.5 - 6 * vehicleScale, 36 * vehicleScale, 150 * vehicleScale, true);
        drawExhaustPlume(rightSrbX, srbY + srbH * 0.5 - 6 * vehicleScale, 36 * vehicleScale, 150 * vehicleScale, true);
      }

      // Left SRB
      ctx.save();
      ctx.globalAlpha = srbAlpha;
      ctx.translate(leftSrbX, srbY);
      ctx.rotate(-sepP * 0.48);
      if (ready(images.leftSRB)) {
        ctx.drawImage(images.leftSRB, -srbW * 0.5, -srbH * 0.5, srbW, srbH);
      }
      ctx.restore();

      // Right SRB
      ctx.save();
      ctx.globalAlpha = srbAlpha;
      ctx.translate(rightSrbX, srbY);
      ctx.rotate(sepP * 0.48);
      if (ready(images.rightSRB)) {
        ctx.drawImage(images.rightSRB, -srbW * 0.5, -srbH * 0.5, srbW, srbH);
      }
      ctx.restore();
    }

    // 3. Space Shuttle Discovery Orbiter (Group 59.png)
    // In LEO, Discovery backs away downward/left as the fairing opens and Hubble emerges
    const leoBackoffX = state.hubble_deployed ? -state.fairing_open_progress * 95 * vehicleScale : 0;
    const leoBackoffY = state.hubble_deployed ? state.fairing_open_progress * 115 * vehicleScale : 0;
    const orbOffsetY = 38 * vehicleScale + leoBackoffY;

    if (state.ssme_active) {
      drawExhaustPlume(leoBackoffX, orbOffsetY + orbH * 0.5 - 4 * vehicleScale, 32 * vehicleScale, 115 * vehicleScale, false);
    }

    // Max-Q transonic vapor cone around T+00:00:52 (11 km)
    if (state.time >= 42 && state.time <= 62) {
      const qIntensity = 1 - Math.abs(state.time - 52) / 10;
      ctx.save();
      ctx.strokeStyle = `rgba(202, 240, 248, ${(qIntensity * 0.6).toFixed(2)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, orbOffsetY - orbH * 0.15, orbW * 0.68, 22 * vehicleScale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (ready(images.orbiter)) {
      ctx.save();
      ctx.globalAlpha = state.hubble_deployed ? Math.max(0.35, 1 - state.hubble_extract_progress * 0.55) : 1.0;
      ctx.drawImage(images.orbiter, -orbW * 0.5 + leoBackoffX, orbOffsetY - orbH * 0.5, orbW, orbH);
      ctx.restore();
    }

    ctx.restore();

    // 4. In 613.5 km LEO: Fairing Split, Stowed Hubble (Group 64) Extraction & Wing/Antenna Unfolding
    if (state.hubble_deployed) {
      drawFairingAndHubbleDeployment(stackCenterX, stackCenterY, scaleFactor, state);
    }

    // 5. Stage & Inclination Status Caption at bottom of viewport
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.font = '300 13px "Google Sans Flex", Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    const caption = state.completed
      ? 'STS-31 HUBBLE DEPLOYED IN 613.5 KM LEO (28.45° INCLINATION) — CLICK TO REPLAY'
      : `STS-31 DISCOVERY  |  STAGE: ${state.phase}  |  PITCH: ${state.pitch_deg.toFixed(0)}°  |  INCLINATION: ${state.inclination_deg}°`;
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
    drawInclinedTrajectory(currentState);
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
