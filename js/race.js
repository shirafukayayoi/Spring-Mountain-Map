const RUNNER_PRESETS = [
  {
    id: "runner-a",
    name: "Spring Dash",
    color: "#ef4444",
    style: "先行",
    baseSpeed: 7.35,
    earlyBoost: 1.11,
    lateBoost: 0.98,
    uphillPower: 0.95,
    rhythmAmp: 0.12
  },
  {
    id: "runner-b",
    name: "Lake Wind",
    color: "#3b82f6",
    style: "登り型",
    baseSpeed: 7.0,
    earlyBoost: 0.98,
    lateBoost: 1.04,
    uphillPower: 1.22,
    rhythmAmp: 0.08
  },
  {
    id: "runner-c",
    name: "Hill Star",
    color: "#10b981",
    style: "持久",
    baseSpeed: 7.18,
    earlyBoost: 1.03,
    lateBoost: 1.03,
    uphillPower: 1.05,
    rhythmAmp: 0.07
  },
  {
    id: "runner-d",
    name: "Snow Flash",
    color: "#f59e0b",
    style: "差し",
    baseSpeed: 6.92,
    earlyBoost: 0.94,
    lateBoost: 1.18,
    uphillPower: 0.9,
    rhythmAmp: 0.13
  }
];

const GLOBAL_SPEED_MULTIPLIER = 16.2;
const SUPPORT_MAX_COMBINED = 2.35;
const SUPPORT_MIN_MULTIPLIER = 0.8;
const SUPPORT_MAX_MULTIPLIER = 1.8;

const CHEER_DECAY_PER_SEC = 0.72;
const CHEER_GAIN_ON_TAP = 0.75;
const MAX_CHEER_LEVEL = 2.4;
const CHEER_ENERGY_COST = 24;
const CHEER_ENERGY_REGEN_PER_SEC = 14;
const CHEER_COOLDOWN_SEC = 1.6;

const OVERHEAT_COOL_PER_SEC = 0.24;
const OVERHEAT_MAX = 2.2;
const OVERHEAT_SOFT_THRESHOLD = 0.9;
const OVERHEAT_HARD_THRESHOLD = 1.35;
const CHEER_STREAK_WINDOW_SEC = 4.0;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function interpolate(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createRaceController() {
  let data = null;
  let cumulative = [];
  let totalDistance = 0;
  let isRunning = false;
  let elapsedTime = 0;
  let runners = [];

  const support = {
    runnerId: null,
    speedMultiplier: 1.0,
    finishMultiplier: 1.0,
    cheerLevel: 0,
    cheerEnergy: 100,
    cheerCooldown: 0,
    overheat: 0,
    cheerStreak: 0,
    lastCheerTime: -999
  };

  function loadTrack(trackData) {
    data = trackData;
    cumulative = [0];
    totalDistance = 0;

    for (let i = 1; i < data.rawPoints.length; i++) {
      const prev = data.rawPoints[i - 1];
      const curr = data.rawPoints[i];
      totalDistance += haversineMeters(prev.lat, prev.lon, curr.lat, curr.lon);
      cumulative.push(totalDistance);
    }

    runners = RUNNER_PRESETS.map((preset, index) => ({
      ...preset,
      seed: index * 1.37 + 0.5,
      distance: 0,
      speed: preset.baseSpeed,
      finished: false,
      finishTime: null
    }));

    support.runnerId = runners[0]?.id ?? null;
    support.speedMultiplier = 1.0;
    support.finishMultiplier = 1.0;
    support.cheerLevel = 0;
    support.cheerEnergy = 100;
    support.cheerCooldown = 0;
    support.overheat = 0;
    support.cheerStreak = 0;
    support.lastCheerTime = -999;

    elapsedTime = 0;
    isRunning = false;
  }

  function clearTrack() {
    data = null;
    cumulative = [];
    totalDistance = 0;
    elapsedTime = 0;
    isRunning = false;
    runners = [];

    support.runnerId = null;
    support.speedMultiplier = 1.0;
    support.finishMultiplier = 1.0;
    support.cheerLevel = 0;
    support.cheerEnergy = 100;
    support.cheerCooldown = 0;
    support.overheat = 0;
    support.cheerStreak = 0;
    support.lastCheerTime = -999;
  }

  function start() {
    if (!data || runners.length === 0) return;
    isRunning = true;
  }

  function pause() {
    isRunning = false;
  }

  function reset() {
    if (!data) return;
    elapsedTime = 0;
    isRunning = false;

    support.cheerLevel = 0;
    support.cheerEnergy = 100;
    support.cheerCooldown = 0;
    support.overheat = 0;
    support.cheerStreak = 0;
    support.lastCheerTime = -999;

    runners.forEach((runner) => {
      runner.distance = 0;
      runner.speed = runner.baseSpeed;
      runner.finished = false;
      runner.finishTime = null;
    });
  }

  function setSupportRunner(runnerId) {
    const exists = runners.some((runner) => runner.id === runnerId);
    if (!exists) return false;
    support.runnerId = runnerId;
    return true;
  }

  function setSupportParams({ speedMultiplier, finishMultiplier }) {
    if (Number.isFinite(speedMultiplier)) {
      support.speedMultiplier = clamp(speedMultiplier, SUPPORT_MIN_MULTIPLIER, SUPPORT_MAX_MULTIPLIER);
    }
    if (Number.isFinite(finishMultiplier)) {
      support.finishMultiplier = clamp(finishMultiplier, SUPPORT_MIN_MULTIPLIER, SUPPORT_MAX_MULTIPLIER);
    }

    const sum = support.speedMultiplier + support.finishMultiplier;
    if (sum > SUPPORT_MAX_COMBINED) {
      const ratio = SUPPORT_MAX_COMBINED / sum;
      support.speedMultiplier *= ratio;
      support.finishMultiplier *= ratio;
    }
  }

  function cheer() {
    if (!support.runnerId) return false;
    if (support.cheerCooldown > 0) return false;
    if (support.cheerEnergy < CHEER_ENERGY_COST) return false;

    const sinceLastCheer = elapsedTime - support.lastCheerTime;
    if (sinceLastCheer <= CHEER_STREAK_WINDOW_SEC) {
      support.cheerStreak += 1;
    } else {
      support.cheerStreak = 0;
    }

    support.cheerLevel = Math.min(MAX_CHEER_LEVEL, support.cheerLevel + CHEER_GAIN_ON_TAP);
    support.cheerEnergy = Math.max(0, support.cheerEnergy - CHEER_ENERGY_COST);
    support.cheerCooldown = CHEER_COOLDOWN_SEC;
    support.overheat = Math.min(
      OVERHEAT_MAX,
      support.overheat + 0.22 + Math.min(0.55, support.cheerStreak * 0.16)
    );
    support.lastCheerTime = elapsedTime;
    return true;
  }

  function getSupportState() {
    const combined = support.speedMultiplier + support.finishMultiplier;
    const canCheer = !!support.runnerId && support.cheerCooldown <= 0 && support.cheerEnergy >= CHEER_ENERGY_COST;
    return {
      runnerId: support.runnerId,
      speedMultiplier: support.speedMultiplier,
      finishMultiplier: support.finishMultiplier,
      cheerLevel: support.cheerLevel,
      cheerPercent: Math.round((support.cheerLevel / MAX_CHEER_LEVEL) * 100),
      cheerEnergy: support.cheerEnergy,
      cheerEnergyPercent: Math.round(clamp(support.cheerEnergy, 0, 100)),
      cheerCooldown: support.cheerCooldown,
      overheat: support.overheat,
      overheatPercent: Math.round((support.overheat / OVERHEAT_MAX) * 100),
      overheatPenaltyPercent: Math.round(computeOverheatPenalty(support.overheat) * 100),
      isOverheated: support.overheat >= OVERHEAT_SOFT_THRESHOLD,
      canCheer,
      combined,
      combinedPercent: Math.round((combined / SUPPORT_MAX_COMBINED) * 100)
    };
  }

  function findSegmentIndex(distance) {
    let left = 0;
    let right = cumulative.length - 1;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (cumulative[mid] < distance) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return Math.max(1, left);
  }

  function pointAtDistance(distance) {
    if (!data || data.rawPoints.length < 2) return null;

    const clamped = Math.max(0, Math.min(distance, totalDistance));
    const segIndex = findSegmentIndex(clamped);
    const d0 = cumulative[segIndex - 1];
    const d1 = cumulative[segIndex];
    const t = d1 - d0 > 0 ? (clamped - d0) / (d1 - d0) : 0;

    const rawA = data.rawPoints[segIndex - 1];
    const rawB = data.rawPoints[segIndex];
    const normA = data.points[segIndex - 1];
    const normB = data.points[segIndex];

    return {
      lat: interpolate(rawA.lat, rawB.lat, t),
      lon: interpolate(rawA.lon, rawB.lon, t),
      ele: interpolate(rawA.ele, rawB.ele, t),
      x: interpolate(normA.x, normB.x, t),
      y: interpolate(normA.y, normB.y, t)
    };
  }

  function computeOverheatPenalty(overheat) {
    const softRatio = clamp(
      (overheat - OVERHEAT_SOFT_THRESHOLD) / (OVERHEAT_HARD_THRESHOLD - OVERHEAT_SOFT_THRESHOLD),
      0,
      1
    );
    const hardRatio = clamp(
      (overheat - OVERHEAT_HARD_THRESHOLD) / (OVERHEAT_MAX - OVERHEAT_HARD_THRESHOLD),
      0,
      1
    );

    const softPenalty = 1 - softRatio * 0.45;
    const hardPenalty = 1 - hardRatio * 0.65;
    return softPenalty * hardPenalty;
  }

  function computeSupportBoost(runner, progress, isLeader, leadGap) {
    if (runner.id !== support.runnerId) {
      return 1.0;
    }

    const latePhase = progress > 0.65 ? (progress - 0.65) / 0.35 : 0;
    const finishBoost = 1 + (support.finishMultiplier - 1) * clamp(latePhase, 0, 1);
    const hardRatio = clamp(
      (support.overheat - OVERHEAT_HARD_THRESHOLD) / (OVERHEAT_MAX - OVERHEAT_HARD_THRESHOLD),
      0,
      1
    );
    const cheerBoost = 1 + support.cheerLevel * 0.22 * (1 - hardRatio * 0.8);

    support.overheat = clamp(
      support.overheat + Math.max(0, (support.speedMultiplier * finishBoost * cheerBoost) - 1) * 0.24,
      0,
      OVERHEAT_MAX
    );

    const overheatPenalty = computeOverheatPenalty(support.overheat);
    const leadPressurePenalty = isLeader ? 1 - Math.min(0.18, Math.max(0, leadGap) / 1300) : 1;

    return support.speedMultiplier * finishBoost * cheerBoost * overheatPenalty * leadPressurePenalty;
  }

  function step(deltaSec) {
    if (!data || runners.length === 0) return;

    const dt = Math.min(deltaSec, 0.06);

    support.cheerLevel = Math.max(0, support.cheerLevel - CHEER_DECAY_PER_SEC * dt);
    support.cheerEnergy = Math.min(100, support.cheerEnergy + CHEER_ENERGY_REGEN_PER_SEC * dt);
    support.cheerCooldown = Math.max(0, support.cheerCooldown - dt);
    support.overheat = Math.max(0, support.overheat - OVERHEAT_COOL_PER_SEC * dt);

    if (!isRunning) {
      return;
    }

    elapsedTime += dt;

    const ordered = [...runners].sort((a, b) => b.distance - a.distance);
    const leaderId = ordered[0]?.id ?? null;
    const leaderDistance = ordered[0]?.distance ?? 0;
    const secondDistance = ordered[1]?.distance ?? leaderDistance;

    runners.forEach((runner) => {
      if (runner.finished) return;

      const point = pointAtDistance(runner.distance);
      const nextPoint = pointAtDistance(Math.min(totalDistance, runner.distance + 10));
      let slope = 0;
      if (point && nextPoint) {
        slope = (nextPoint.ele - point.ele) / 10;
      }

      const progress = totalDistance > 0 ? runner.distance / totalDistance : 0;
      const phaseBoost =
        progress < 0.35 ? runner.earlyBoost :
        progress > 0.75 ? runner.lateBoost :
        1.0;

      const uphillScale = 2.15 / runner.uphillPower;
      const downhillScale = 1.55 * runner.uphillPower;
      const terrainBoost = slope > 0
        ? Math.max(0.74, 1 - slope * uphillScale)
        : Math.min(1.25, 1 + Math.abs(slope) * downhillScale);

      const rhythm = 1 + Math.sin(elapsedTime * 1.25 + runner.seed) * runner.rhythmAmp;
      const fatigue = 1 - progress * 0.05;

      const catchupGap = Math.max(0, leaderDistance - runner.distance);
      const catchupBoost = 1 + Math.min(0.22, catchupGap / 2200);

      const isLeader = runner.id === leaderId;
      const leadGap = isLeader ? (runner.distance - secondDistance) : 0;
      const supportBoost = computeSupportBoost(runner, progress, isLeader, leadGap);

      const targetSpeed = runner.baseSpeed * phaseBoost * terrainBoost * rhythm * fatigue * catchupBoost * supportBoost * GLOBAL_SPEED_MULTIPLIER;

      runner.speed = runner.speed * 0.84 + targetSpeed * 0.16;
      runner.distance += Math.max(0.2, runner.speed) * dt;

      if (runner.distance >= totalDistance) {
        runner.distance = totalDistance;
        runner.finished = true;
        if (runner.finishTime == null) {
          runner.finishTime = elapsedTime;
        }
      }
    });

    if (runners.every((runner) => runner.finished)) {
      isRunning = false;
    }
  }

  function getRunnerPositions() {
    return runners.map((runner) => {
      const point = pointAtDistance(runner.distance);
      return {
        id: runner.id,
        name: runner.name,
        color: runner.color,
        lat: point ? point.lat : null,
        lon: point ? point.lon : null,
        x: point ? point.x : 0,
        y: point ? point.y : 0,
        style: runner.style,
        speedMps: runner.speed,
        speedKmh: runner.speed * 3.6,
        distance: runner.distance,
        remaining: Math.max(0, totalDistance - runner.distance),
        finished: runner.finished,
        finishTime: runner.finishTime,
        isSupported: runner.id === support.runnerId
      };
    });
  }

  function getLeaderboard() {
    return getRunnerPositions()
      .sort((a, b) => b.distance - a.distance)
      .map((runner, index) => ({ ...runner, place: index + 1 }));
  }

  function getMeta() {
    return {
      ready: !!data,
      running: isRunning,
      elapsedTime,
      totalDistance,
      allFinished: runners.length > 0 && runners.every((runner) => runner.finished)
    };
  }

  function getRunnerConfigs() {
    return runners.map((runner) => ({
      id: runner.id,
      name: runner.name,
      color: runner.color,
      style: runner.style
    }));
  }

  return {
    loadTrack,
    clearTrack,
    start,
    pause,
    reset,
    step,
    getMeta,
    getLeaderboard,
    getRunnerPositions,
    getRunnerConfigs,
    setSupportRunner,
    setSupportParams,
    cheer,
    getSupportState
  };
}
