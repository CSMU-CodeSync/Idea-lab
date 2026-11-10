/**
 * RocketSimulationEngine.js
 * NASA STS-31 (Space Shuttle Discovery / Hubble Space Telescope)
 * Launch-to-Low-Earth-Orbit (LEO, 613.5 km, 28.45° Inclination) Timeline & Telemetry Engine.
 */
class RocketSimulationEngine {
  static LEO_ALTITUDE_KM = 613.5;
  static LEO_VELOCITY_KMS = 7.59;
  static ORBIT_INCLINATION_DEG = 28.45;

  // Chronological STS-31 Mission Milestones (MET seconds from T-00:00:00 Liftoff)
  static MILESTONES = [
    { time: -10.0,  name: 'GLS AUTO SEQ', next: 'SSME IGNITION', altKm: 0.0,   velKms: 0.0,  downrangeKm: 0.0,     thrustMN: 0.0,   fuelPct: 100.0, pitchDeg: 90.0, trajU: 0.0 },
    { time: -6.6,   name: 'SSME IGNITION', next: 'LIFTOFF',       altKm: 0.0,   velKms: 0.0,  downrangeKm: 0.0,     thrustMN: 5.25,  fuelPct: 99.6,  pitchDeg: 90.0, trajU: 0.0 },
    { time: 0.0,    name: 'LIFTOFF',       next: 'ROLL & PITCH',  altKm: 0.0,   velKms: 0.0,  downrangeKm: 0.0,     thrustMN: 30.16, fuelPct: 99.0,  pitchDeg: 90.0, trajU: 0.0 },
    { time: 7.0,    name: 'ROLL PROGRAM',  next: 'MAX-Q',         altKm: 0.12,  velKms: 0.04, downrangeKm: 0.05,    thrustMN: 30.16, fuelPct: 96.5,  pitchDeg: 80.0, trajU: 0.06 },
    { time: 52.0,   name: 'MAX-Q',         next: 'SRB SEP',       altKm: 11.0,  velKms: 0.45, downrangeKm: 8.2,     thrustMN: 21.50, fuelPct: 79.0,  pitchDeg: 66.0, trajU: 0.22 },
    { time: 124.0,  name: 'SRB SEP',       next: '3G THROTTLE',   altKm: 46.3,  velKms: 1.50, downrangeKm: 62.0,    thrustMN: 5.45,  fuelPct: 54.0,  pitchDeg: 48.0, trajU: 0.42 },
    { time: 455.0,  name: '3G THROTTLE',   next: 'MECO',          altKm: 106.0, velKms: 6.25, downrangeKm: 920.0,   thrustMN: 3.65,  fuelPct: 11.0,  pitchDeg: 22.0, trajU: 0.64 },
    { time: 512.0,  name: 'MECO',          next: 'ET SEP',        altKm: 115.0, velKms: 7.82, downrangeKm: 1310.0,  thrustMN: 0.0,   fuelPct: 0.0,   pitchDeg: 14.0, trajU: 0.72 },
    { time: 530.0,  name: 'ET SEP',        next: 'OMS-2 BURN',    altKm: 119.0, velKms: 7.81, downrangeKm: 1450.0,  thrustMN: 0.0,   fuelPct: 0.0,   pitchDeg: 10.0, trajU: 0.78 },
    { time: 2535.0, name: 'OMS-2 LEO',     next: 'FAIRING OPEN',  altKm: 613.5, velKms: 7.59, downrangeKm: 14800.0, thrustMN: 0.05,  fuelPct: 0.0,   pitchDeg: 0.0,  trajU: 0.94 },
    { time: 2565.0, name: 'FAIRING OPEN',  next: 'HST UNBERTH',   altKm: 613.5, velKms: 7.59, downrangeKm: 15020.0, thrustMN: 0.0,   fuelPct: 0.0,   pitchDeg: 0.0,  trajU: 0.97 },
    { time: 2620.0, name: 'HST DEPLOYED',  next: 'IN LEO ORBIT',  altKm: 613.5, velKms: 7.59, downrangeKm: 15440.0, thrustMN: 0.0,   fuelPct: 0.0,   pitchDeg: 0.0,  trajU: 1.0 }
  ];

  constructor() {
    this.reset();
  }

  reset() {
    this.met = -10.0; // Starts automatically at T-00:00:10 countdown
    this.srbSepElapsed = 0.0;
    this.etSepElapsed = 0.0;
    this.leoArrivalElapsed = 0.0;
    this.completed = false;
    return this.getTelemetryPayload();
  }

  /**
   * Advances the STS-31 mission clock with adaptive stage time-scaling.
   * @param {number} [dt=0.016] - Real frame delta in seconds
   */
  update(dt = 0.016) {
    if (dt <= 0) return this.getTelemetryPayload();

    let timeScale = 1.0;
    if (this.met < 8.0) {
      timeScale = 1.0; // Real-time countdown & liftoff
    } else if (this.met < 124.0) {
      timeScale = 7.5; // Roll program & Max-Q to SRB separation
    } else if (this.met < 138.0) {
      timeScale = 2.2; // Slow down at SRB separation
    } else if (this.met < 512.0) {
      timeScale = 25.0; // SSME ascent to MECO
    } else if (this.met < 548.0) {
      timeScale = 3.0; // Slow down at MECO & External Tank separation
    } else if (this.met < 2535.0) {
      timeScale = 155.0; // Coast along inclined orbital transfer ellipse to 613.5 km LEO
    } else if (this.met < 2620.0) {
      timeScale = 7.5; // Fairing opening, Hubble extraction, and Solar/Antenna unfolding
    } else {
      timeScale = 1.0;
      this.completed = true;
    }

    this.met += dt * timeScale;

    if (this.met >= 124.0) {
      this.srbSepElapsed += dt;
    }
    if (this.met >= 530.0) {
      this.etSepElapsed += dt;
    }
    if (this.met >= 2535.0) {
      this.leoArrivalElapsed += dt;
    }

    return this.getTelemetryPayload();
  }

  /**
   * Interpolates between STS-31 milestones and computes pitch angle, trajectory progress,
   * fairing split, and step-by-step Hubble extraction/unfolding progress.
   */
  getTelemetryPayload() {
    const milestones = RocketSimulationEngine.MILESTONES;
    const t = this.met;

    let m0 = milestones[0];
    let m1 = milestones[milestones.length - 1];

    for (let i = 0; i < milestones.length - 1; i++) {
      if (t >= milestones[i].time && t <= milestones[i + 1].time) {
        m0 = milestones[i];
        m1 = milestones[i + 1];
        break;
      }
    }

    let alpha = 0;
    if (t <= milestones[0].time) {
      m0 = milestones[0];
      m1 = milestones[1];
      alpha = 0;
    } else if (t >= milestones[milestones.length - 1].time) {
      m0 = milestones[milestones.length - 1];
      m1 = milestones[milestones.length - 1];
      alpha = 1;
    } else {
      const span = Math.max(0.0001, m1.time - m0.time);
      alpha = Math.min(1, Math.max(0, (t - m0.time) / span));
    }

    const lerp = (a, b, u) => a + (b - a) * u;
    const altitudeKm = t < 0 ? 0.0 : lerp(m0.altKm, m1.altKm, alpha);
    const velocityKms = t < 0 ? 0.0 : lerp(m0.velKms, m1.velKms, alpha);
    const downrangeKm = t < 0 ? 0.0 : lerp(m0.downrangeKm, m1.downrangeKm, alpha);
    const fuelPct = lerp(m0.fuelPct, m1.fuelPct, alpha);
    const pitchDeg = t < 0 ? 90.0 : lerp(m0.pitchDeg, m1.pitchDeg, alpha);
    const trajU = t < 0 ? 0.0 : lerp(m0.trajU, m1.trajU, alpha);

    let thrustMN = 0.0;
    if (t >= -6.6 && t < 0) {
      thrustMN = lerp(0.0, 5.25, (t + 6.6) / 6.6);
    } else if (t >= 0 && t < 512.0) {
      thrustMN = lerp(m0.thrustMN, m1.thrustMN, alpha);
    } else if (t >= 2510.0 && t < 2550.0) {
      thrustMN = 0.053; // OMS-2 circularization burn
    }

    const staticPressureKpa = altitudeKm < 100
      ? 101.325 * Math.exp(-altitudeKm / 7.4)
      : 0.0;
    const rho = 1.225 * Math.exp(-altitudeKm / 7.4);
    const vMs = velocityKms * 1000;
    const dynamicPressureKpa = (0.5 * rho * vMs * vMs) / 1000;
    const totalPressureKpa = t < 0 ? 101.3 : Math.min(135.0, staticPressureKpa + dynamicPressureKpa * 0.25);

    let tempC = 24.0;
    if (altitudeKm <= 12) {
      tempC = 24.0 - altitudeKm * 6.5;
    } else if (altitudeKm <= 48) {
      tempC = -54.0 + ((altitudeKm - 12) / 36) * 49.0;
    } else if (altitudeKm <= 85) {
      tempC = -5.0 - ((altitudeKm - 48) / 37) * 85.0;
    } else {
      tempC = -90.0 - Math.min(20.0, ((altitudeKm - 85) / 500) * 20.0);
    }

    const nextStageTime = m1.time;
    const timeToNext = Math.max(0, nextStageTime - t);

    // 3-Stage LEO Fairing & Hubble Deployment Sequence
    // 1) 0.0s -> 3.5s in LEO: Fairing / Payload Bay doors split open
    // 2) 2.2s -> 6.5s in LEO: Stowed Hubble (Group 64) slides out from inside the fairing
    // 3) 5.8s -> 10.5s in LEO: High-Gain Antennas (Group 63) & Solar Wings (Group 61) unfold
    const fairingOpenProgress = Math.min(1, Math.max(0, this.leoArrivalElapsed / 3.5));
    const hubbleExtractProgress = Math.min(1, Math.max(0, (this.leoArrivalElapsed - 2.2) / 4.3));
    const hubbleUnfoldProgress = Math.min(1, Math.max(0, (this.leoArrivalElapsed - 5.8) / 4.7));

    return {
      time: Number(t.toFixed(2)),
      clock_formatted: RocketSimulationEngine.formatClock(t),
      start_label: t < 0 ? 'T-00:10' : '12:33:51',
      next_stage_label: m0.next,
      duration_label: t >= 2620 ? '28.45° LEO' : RocketSimulationEngine.formatShortDuration(timeToNext),
      phase: m0.name,
      inclination_deg: RocketSimulationEngine.ORBIT_INCLINATION_DEG,
      pitch_deg: Number(pitchDeg.toFixed(2)),
      traj_u: Number(trajU.toFixed(4)),
      thrust_mn: Number(thrustMN.toFixed(2)),
      thrust_display: thrustMN >= 1.0
        ? `${thrustMN.toFixed(1)}M`
        : thrustMN > 0
          ? `${(thrustMN * 1000).toFixed(0)}k`
          : '0.0',
      velocity_kms: Number(velocityKms.toFixed(2)),
      pressure_kpa: Number(totalPressureKpa.toFixed(1)),
      altitude_km: Number(altitudeKm.toFixed(1)),
      downrange_km: Number(downrangeKm.toFixed(1)),
      temperature_c: Math.round(tempC),
      fuel_percent: Math.max(0, Math.round(fuelPct)),
      ssme_active: (t >= -6.6 && t < 512.0) || (t >= 2510.0 && t < 2550.0),
      srb_active: t >= 0.0 && t < 124.0,
      srb_separated: t >= 124.0,
      srb_sep_progress: Math.min(1, this.srbSepElapsed / 5.5),
      et_separated: t >= 530.0,
      et_sep_progress: Math.min(1, this.etSepElapsed / 6.5),
      hubble_deployed: t >= 2535.0,
      fairing_open_progress: Number(fairingOpenProgress.toFixed(3)),
      hubble_extract_progress: Number(hubbleExtractProgress.toFixed(3)),
      hubble_unfold_progress: Number(hubbleUnfoldProgress.toFixed(3)),
      hubble_deploy_progress: Number(hubbleUnfoldProgress.toFixed(3)),
      completed: this.completed
    };
  }

  static formatClock(metSeconds) {
    const abs = Math.abs(Math.floor(metSeconds));
    const hrs = String(Math.floor(abs / 3600)).padStart(2, '0');
    const mins = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
    const secs = String(abs % 60).padStart(2, '0');
    const prefix = metSeconds < 0 ? 'T- ' : '';
    return `${prefix}${hrs} : ${mins} : ${secs}`;
  }

  static formatShortDuration(seconds) {
    const s = Math.ceil(seconds);
    const mins = String(Math.floor(s / 60)).padStart(2, '0');
    const secs = String(s % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }
}

if (typeof window !== 'undefined') {
  window.RocketSimulationEngine = RocketSimulationEngine;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RocketSimulationEngine };
}

// Self-check when executed directly via Node
if (typeof require !== 'undefined' && require.main === module) {
  const assert = require('assert');
  const engine = new RocketSimulationEngine();
  const initial = engine.getTelemetryPayload();
  assert(initial.time === -10, 'Simulation must start automatically at T-00:00:10 countdown');
  assert(initial.pitch_deg === 90, 'Initial launch pitch must be 90 deg vertical');
  assert(initial.inclination_deg === 28.45, 'Orbital inclination must be 28.45 deg');

  let sawPitchOver = false;
  let sawFairingOpen = false;
  let guard = 0;

  while (!engine.completed && guard++ < 25000) {
    const state = engine.update(0.016);
    if (state.pitch_deg < 60 && state.pitch_deg > 10) sawPitchOver = true;
    if (state.fairing_open_progress > 0.5) sawFairingOpen = true;
  }

  // Advance a few more seconds in LEO so unfolding finishes 100%
  for (let i = 0; i < 600; i++) engine.update(0.016);

  const finalState = engine.getTelemetryPayload();
  assert(sawPitchOver, 'Vehicle must pitch over along inclined trajectory curve');
  assert(sawFairingOpen, 'Payload fairing must open in LEO');
  assert(finalState.pitch_deg === 0, 'Final LEO pitch must be 0 deg horizontal');
  assert(finalState.hubble_extract_progress === 1, 'Hubble must fully extract from fairing');
  assert(finalState.hubble_unfold_progress === 1, 'Hubble solar arrays and antennas must fully unfold');
  console.log(
    'STS-31 Inclined Trajectory & Fairing Unfold Self-Check Passed | Pitch:',
    finalState.pitch_deg + '° | Inclination:',
    finalState.inclination_deg + '° | Unfold:',
    finalState.hubble_unfold_progress * 100 + '%'
  );
}
