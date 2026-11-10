/**
 * app.js
 * STS-31 Hubble Space Telescope Launch-to-LEO Orchestration Layer.
 * Features:
 * - Vast World-Space Trajectory (3800 x 2400 world units) so waypoints are far apart
 * - Dynamic Tracking Camera with Cinematic Zoom-Out during ascent & Zoom-In on LEO Deployment
 * - Ground & Launch Tower rapidly drop out of frame after liftoff, replaced by curved Earth horizon in space
 * - 28.45° Inclined Gravity-Turn Pitch-Over + Fairing Split + Staged Hubble Unfolding
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

  // Dynamic Camera State (tracks Shuttle in vast world coordinates with smooth zoom)
  const camera = {
    x: 0,
    y: 0,
    zoom: 1.0
  };

  // Parallax Deep-Space Starfield
  const stars = Array.from({ length: 220 }, () => ({
    wx: (Math.random() - 0.1) * 5500,
    wy: -Math.random() * 3200,
    radius: 0.7 + Math.random() * 1.6,
    alpha: 0.35 + Math.random() * 0.65
  }));

  // High-Altitude Atmospheric Cloud Deck (between 4 km and 14 km world altitude)
  const clouds = Array.from({ length: 18 }, (_, i) => ({
    wx: (i - 4) * 280 + Math.random() * 120,
    wy: -260 - Math.random() * 240,
    rx: 90 + Math.random() * 110,
    ry: 16 + Math.random() * 18,
    alpha: 0.18 + Math.random() * 0.22
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
   * Evaluates a point in vast WORLD coordinates along the 28.45° inclined orbital ascent curve.
   * World origin (0, 0) is Launch Pad 39B.
   * World X spans 0 -> +4200 px; World Y spans 0 -> -2400 px (upward into LEO).
   * Waypoints are ~900 to 1400 world units apart so they are NEVER cramped!
   */
  function getWorldTrajectoryPoint(u) {
    const p0x = 0;
    const p0y = 0;
    const p1x = 950;
    const p1y = -2150;
    const p2x = 4200;
    const p2y = -2400;

    const inv = 1 - u;
    const wx = inv * inv * p0x + 2 * inv * u * p1x + u * u * p2x;
    const wy = inv * inv * p0y + 2 * inv * u * p1y + u * u * p2y;

    return { wx, wy, p0x, p0y, p1x, p1y, p2x, p2y };
  }

  /**
   * Computes target camera zoom for each flight phase:
   * - 1.00x on Pad 39B during countdown
   * - Zooms out to 0.42x during high-speed ascent so user feels massive scale of space
   * - Zooms in to 0.72x at SRB separation & ET separation milestones
   * - Zooms out to 0.36x during long orbital coast across Earth's horizon
   * - Zooms in to 0.88x in 613.5 km LEO for Fairing split & Hubble unfolding
   */
  function getTargetCameraZoom(state) {
    const t = state.time;
    if (t < 0) return 0.92; // Pad countdown view
    if (t < 25) return 0.92 - (t / 25) * 0.34; // Liftoff zoom-out (0.92 -> 0.58)
    if (t < 110) return 0.46; // Wide supersonic & Max-Q climb
    if (t < 142) return 0.68; // Zoom in slightly to showcase SRB separation clearly
    if (t < 500) return 0.40; // Wide zoom-out for high-velocity upper atmospheric ascent
    if (t < 555) return 0.66; // Zoom in for MECO & External Tank separation
    if (t < 2480) return 0.36; // Ultra-wide orbital coast view showing vast trajectory curve
    return 0.88; // Cinematic close-up zoom-in for Fairing open & Hubble LEO unfolding
  }

  /**
   * Updates camera position and zoom smoothly and syncs DOM ground/HUD
   */
  function updateCameraAndDOM(state) {
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

    // Camera tracks the Shuttle's world position
    const shuttleWorld = getWorldTrajectoryPoint(state.traj_u);
    const viewScale = Math.min(1.0, Math.max(0.55, canvas.height / 1024));
    const targetZoom = getTargetCameraZoom(state) * viewScale;

    if (state.time <= -9.8) {
      camera.x = shuttleWorld.wx;
      camera.y = shuttleWorld.wy - 210;
      camera.zoom = targetZoom;
    } else {
      camera.x += (shuttleWorld.wx - camera.x) * 0.12;
      camera.y += ((shuttleWorld.wy - 180) - camera.y) * 0.12;
      camera.zoom += (targetZoom - camera.zoom) * 0.06;
    }

    // Push the brown ground & launchpad down off-screen as the Shuttle climbs into the sky!
    const screenOriginY = canvas.height * 0.62 - (0 - camera.y) * camera.zoom;
    const baseGroundTop = canvas.height * 0.908;
    const groundDropPx = Math.max(0, screenOriginY - baseGroundTop);
    const groundOpacity = state.altitude_km > 6
      ? 0
      : Math.max(0, 1 - state.altitude_km / 5.5);

    document.documentElement.style.setProperty('--ground-offset-y', `${groundDropPx.toFixed(1)}px`);
    document.documentElement.style.setProperty('--ground-opacity', groundOpacity.toFixed(3));
    document.documentElement.style.setProperty('--camera-zoom', camera.zoom.toFixed(4));
  }

  function worldToScreen(wx, wy) {
    const cx = canvas.width * 0.46;
    const cy = canvas.height * 0.60;
    return {
      x: cx + (wx - camera.x) * camera.zoom,
      y: cy + (wy - camera.y) * camera.zoom
    };
  }

  /**
   * Renders atmospheric color shades (#CAF0F8 -> #0077B6 -> #023E8A -> #03045E -> Deep Space)
   * plus curved blue Earth limb horizon when high in space (no brown ground in space!).
   */
  function drawSkyAndEarthHorizon(state) {
    const w = canvas.width;
    const h = canvas.height;
    const alt = state.altitude_km;

    const spaceFactor = Math.min(1, alt / 110);
    const grad = ctx.createLinearGradient(0, 0, 0, h);

    if (spaceFactor < 0.45) {
      grad.addColorStop(0, '#03045E');
      grad.addColorStop(0.35, '#023E8A');
      grad.addColorStop(0.72, '#0077B6');
      grad.addColorStop(1, '#CAF0F8');
    } else if (spaceFactor < 0.85) {
      grad.addColorStop(0, '#010214');
      grad.addColorStop(0.45, '#03045E');
      grad.addColorStop(0.80, '#023E8A');
      grad.addColorStop(1, '#0077B6');
    } else {
      // Deep orbital space (#01010c -> #03045E)
      grad.addColorStop(0, '#00010a');
      grad.addColorStop(0.68, '#020324');
      grad.addColorStop(0.92, '#023E8A');
      grad.addColorStop(1, '#0077B6');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Parallax Starfield above 18 km
    if (alt > 18) {
      const starVis = Math.min(1, (alt - 18) / 70);
      ctx.save();
      stars.forEach((s) => {
        // Subtle parallax shift with camera
        const sx = ((s.wx - camera.x * 0.15) % w + w) % w;
        const sy = (( -s.wy - camera.y * 0.15) % (h * 0.88) + h * 0.88) % (h * 0.88);
        ctx.fillStyle = `rgba(255, 255, 255, ${(s.alpha * starVis).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    // Curved Blue Earth Limb Glow at bottom of viewport when in high altitude / LEO
    if (alt > 35) {
      const limbAlpha = Math.min(0.85, (alt - 35) / 120);
      ctx.save();
      const earthRadius = w * 2.2;
      const earthCenterX = w * 0.5;
      const earthCenterY = h + earthRadius - 68;

      const limbGrad = ctx.createRadialGradient(
        earthCenterX,
        earthCenterY,
        earthRadius - 45,
        earthCenterX,
        earthCenterY,
        earthRadius + 35
      );
      limbGrad.addColorStop(0, `rgba(1, 18, 56, ${limbAlpha})`);
      limbGrad.addColorStop(0.55, `rgba(0, 119, 182, ${limbAlpha * 0.85})`);
      limbGrad.addColorStop(0.82, `rgba(202, 240, 248, ${limbAlpha * 0.65})`);
      limbGrad.addColorStop(1, 'rgba(202, 240, 248, 0)');

      ctx.fillStyle = limbGrad;
      ctx.beginPath();
      ctx.arc(earthCenterX, earthCenterY, earthRadius + 35, Math.PI * 1.15, Math.PI * 1.85);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // High-altitude tropospheric clouds that pass downward as rocket climbs through 4-15 km
    if (alt < 45) {
      ctx.save();
      clouds.forEach((c) => {
        const sc = worldToScreen(c.wx, c.wy);
        if (sc.y > -100 && sc.y < h + 100) {
          ctx.fillStyle = `rgba(202, 240, 248, ${c.alpha})`;
          ctx.beginPath();
          ctx.ellipse(sc.x, sc.y, c.rx * camera.zoom, c.ry * camera.zoom, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
    }
  }

  /**
   * Draws the vast World-Space 28.45° Inclined Trajectory Curve & Spaced-Out Waypoints
   */
  function drawWorldTrajectory(state) {
    ctx.save();

    // 1. Planned Orbital Trajectory Curve in World Space (dashed)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    const totalSteps = 80;
    for (let i = 0; i <= totalSteps; i++) {
      const u = i / totalSteps;
      const wp = getWorldTrajectoryPoint(u);
      const sp = worldToScreen(wp.wx, wp.wy);
      if (i === 0) ctx.moveTo(sp.x, sp.y);
      else ctx.lineTo(sp.x, sp.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Active Traveled Trajectory Curve (glowing cyan/blue)
    if (state.traj_u > 0.002) {
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = 'rgba(0, 229, 255, 0.7)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      const activeSteps = 60;
      for (let i = 0; i <= activeSteps; i++) {
        const u = (state.traj_u * i) / activeSteps;
        const wp = getWorldTrajectoryPoint(u);
        const sp = worldToScreen(wp.wx, wp.wy);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 3. Widely-Spaced World Milestone Waypoints (~1000 world units apart)
    const waypoints = [
      { u: 0.22, label: 'MAX-Q (11.0 KM)' },
      { u: 0.42, label: 'SRB SEPARATION (46.3 KM)' },
      { u: 0.72, label: 'MECO & ET SEP (115.0 KM)' },
      { u: 0.97, label: 'HUBBLE LEO ORBIT (613.5 KM | 28.45° INC)' }
    ];

    ctx.font = '300 12px "Google Sans Flex", Inter, sans-serif';
    waypoints.forEach((item) => {
      const wp = getWorldTrajectoryPoint(item.u);
      const sp = worldToScreen(wp.wx, wp.wy);
      if (sp.x < -200 || sp.x > canvas.width + 200 || sp.y < 180 || sp.y > canvas.height + 100) return;

      const reached = state.traj_u >= item.u;
      ctx.fillStyle = reached ? '#00e5ff' : 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, reached ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = reached ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(item.label, sp.x + 12, sp.y + 18);
    });

    ctx.restore();
  }

  /**
   * Renders Launch Complex 39B Tower (Resorces/image 16.png) anchored at World Origin (Pad 39B).
   * Automatically pans down and zooms out with the world camera as Discovery lifts off!
   */
  function drawLaunchTowerInWorld() {
    if (!ready(images.tower)) return;

    const padScreen = worldToScreen(-290, 240);
    const towerW = 138 * camera.zoom;
    const towerH = 717 * camera.zoom;
    const towerX = padScreen.x - towerW * 0.5;
    const towerY = padScreen.y - towerH;

    if (towerY > canvas.height + 50 || towerX + towerW < -50) return;

    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.drawImage(images.tower, towerX, towerY, towerW, towerH);
    ctx.restore();
  }

  /**
   * Draws an engine exhaust plume in local vehicle coordinates
   */
  function drawExhaustPlume(x, y, width, length, isSRB) {
    const flicker = 0.9 + Math.random() * 0.2;
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
  function drawFairingAndHubbleDeployment(anchorX, anchorY, zoomScale, state) {
    const fairP = state.fairing_open_progress;
    const extP = state.hubble_extract_progress;
    const unfP = state.hubble_unfold_progress;

    ctx.save();
    ctx.translate(anchorX, anchorY);
    ctx.scale(zoomScale, zoomScale);

    // 1. Protective Payload Fairing Halves splitting open around Hubble
    if (fairP < 1.0 || extP < 0.85) {
      const fairAlpha = Math.max(0, 1 - extP * 0.95);
      const splitOffset = fairP * 85;
      const fairTilt = fairP * 0.42;

      ctx.save();
      ctx.globalAlpha = fairAlpha;
      ctx.fillStyle = '#e6e9ef';
      ctx.strokeStyle = '#9aa5b1';
      ctx.lineWidth = 2;

      // Left / Upper Fairing Shell
      ctx.save();
      ctx.translate(-splitOffset, -splitOffset * 0.35);
      ctx.rotate(-fairTilt);
      ctx.beginPath();
      ctx.moveTo(0, -118);
      ctx.quadraticCurveTo(-54, -75, -54, 88);
      ctx.lineTo(-4, 88);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Right / Lower Fairing Shell
      ctx.save();
      ctx.translate(splitOffset, splitOffset * 0.35);
      ctx.rotate(fairTilt);
      ctx.beginPath();
      ctx.moveTo(0, -118);
      ctx.quadraticCurveTo(54, -75, 54, 88);
      ctx.lineTo(4, 88);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }

    // 2. Hubble Telescope emerging from inside the fairing & unfolding its wings/antennas
    const emergeOffsetX = extP * 48;
    const emergeOffsetY = -extP * 12;
    const hubbleScale = 0.58 + 0.34 * extP;

    ctx.save();
    ctx.translate(emergeOffsetX, emergeOffsetY);
    ctx.scale(hubbleScale, hubbleScale);

    if (unfP >= 0.98 && ready(images.hubbleComplete)) {
      ctx.drawImage(images.hubbleComplete, -115, -130, 230, 260);
    } else {
      // A) Unfolding High-Gain Antennas (Group 63.png)
      if (unfP > 0.05 && ready(images.hubbleAntenna)) {
        const antProgress = Math.min(1, unfP * 1.4);
        ctx.save();
        ctx.translate(-26, -32);
        ctx.rotate(Math.PI - antProgress * 0.78);
        ctx.drawImage(images.hubbleAntenna, -14, 0, 28, 105 * antProgress);
        ctx.restore();

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

        ctx.save();
        ctx.translate(30, -72);
        ctx.drawImage(images.hubbleWing, 0, 0, wingW, wingH);
        ctx.restore();

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
   * Renders the complete STS-31 Space Shuttle Discovery stack at its World Trajectory Position
   * scaled dynamically by camera.zoom and rotated by its pitch angle.
   */
  function drawShuttleStack(state) {
    const wp = getWorldTrajectoryPoint(state.traj_u);
    const sp = worldToScreen(wp.wx, wp.wy);

    const z = camera.zoom;
    const tiltRad = ((90 - state.pitch_deg) * Math.PI) / 180;

    const etW = 112 * z;
    const etH = 423 * z;
    const srbW = 64 * z;
    const srbH = 495 * z;
    const orbW = 187 * z;
    const orbH = 274 * z;

    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(tiltRad);

    // 1. External Tank (Group 71.png) — detaches at T+00:08:50
    if (!state.et_separated || state.et_sep_progress < 1) {
      const etSepP = state.et_sep_progress;
      const etDropY = etSepP * etSepP * 320 * z;
      const etDriftX = -etSepP * 140 * z;

      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - etSepP * 0.95);
      ctx.translate(etDriftX, etDropY);
      ctx.rotate(-etSepP * 0.32);
      if (ready(images.externalTank)) {
        ctx.drawImage(images.externalTank, -etW * 0.5, -etH * 0.5, etW, etH);
      }
      ctx.restore();
    }

    // 2. Left SRB (Group 55.png) & Right SRB (Group 72.png) — detach at T+00:02:04
    if (!state.srb_separated || state.srb_sep_progress < 1) {
      const sepP = state.srb_separated ? state.srb_sep_progress : 0;
      const spreadX = sepP * 240 * z;
      const dropY = sepP * sepP * 360 * z;
      const srbAlpha = Math.max(0, 1 - sepP * 0.95);

      const leftSrbX = -etW * 0.5 - srbW * 0.35 - spreadX;
      const rightSrbX = etW * 0.5 + srbW * 0.35 + spreadX;
      const srbY = 20 * z + dropY;

      if (state.srb_active) {
        drawExhaustPlume(leftSrbX, srbY + srbH * 0.5 - 6 * z, 38 * z, 165 * z, true);
        drawExhaustPlume(rightSrbX, srbY + srbH * 0.5 - 6 * z, 38 * z, 165 * z, true);
      }

      ctx.save();
      ctx.globalAlpha = srbAlpha;
      ctx.translate(leftSrbX, srbY);
      ctx.rotate(-sepP * 0.55);
      if (ready(images.leftSRB)) {
        ctx.drawImage(images.leftSRB, -srbW * 0.5, -srbH * 0.5, srbW, srbH);
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = srbAlpha;
      ctx.translate(rightSrbX, srbY);
      ctx.rotate(sepP * 0.55);
      if (ready(images.rightSRB)) {
        ctx.drawImage(images.rightSRB, -srbW * 0.5, -srbH * 0.5, srbW, srbH);
      }
      ctx.restore();
    }

    // 3. Space Shuttle Discovery Orbiter (Group 59.png)
    const leoBackoffX = state.hubble_deployed ? -state.fairing_open_progress * 125 * z : 0;
    const leoBackoffY = state.hubble_deployed ? state.fairing_open_progress * 135 * z : 0;
    const orbOffsetY = 38 * z + leoBackoffY;

    if (state.ssme_active) {
      drawExhaustPlume(leoBackoffX, orbOffsetY + orbH * 0.5 - 4 * z, 34 * z, 125 * z, false);
    }

    // Max-Q transonic vapor cone around T+00:00:52 (11 km)
    if (state.time >= 42 && state.time <= 62) {
      const qIntensity = 1 - Math.abs(state.time - 52) / 10;
      ctx.save();
      ctx.strokeStyle = `rgba(202, 240, 248, ${(qIntensity * 0.65).toFixed(2)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, orbOffsetY - orbH * 0.15, orbW * 0.72, 24 * z, 0, 0, Math.PI * 2);
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
      drawFairingAndHubbleDeployment(sp.x, sp.y, z, state);
    }

    // 5. Stage, Camera Zoom & Inclination Status Caption at bottom of viewport
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.font = '300 13px "Google Sans Flex", Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    const caption = state.completed
      ? 'STS-31 HUBBLE DEPLOYED IN 613.5 KM LEO (28.45° INCLINATION) — CLICK TO REPLAY'
      : `STS-31 DISCOVERY  |  STAGE: ${state.phase}  |  PITCH: ${state.pitch_deg.toFixed(0)}°  |  INCLINATION: ${state.inclination_deg}°  |  CAMERA: ${camera.zoom.toFixed(2)}x`;
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
    updateCameraAndDOM(currentState);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawSkyAndEarthHorizon(currentState);
    drawWorldTrajectory(currentState);
    drawLaunchTowerInWorld();
    drawShuttleStack(currentState);

    requestAnimationFrame(animate);
  }

  // Click anywhere after orbital deployment to restart from T-00:00:10 countdown
  window.addEventListener('click', () => {
    if (currentState.completed) {
      currentState = engine.reset();
      updateCameraAndDOM(currentState);
    }
  });

  function handleResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', handleResize);
  handleResize();
  updateCameraAndDOM(currentState);
  requestAnimationFrame(animate);
})();
