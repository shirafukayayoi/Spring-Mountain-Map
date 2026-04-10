import { BUNDLED_GPX_SAMPLES, DEFAULT_GPX_PATH, TERRAIN_SIZE_GRID } from "./constants.js";
import { parseGPX, createSpotsFromData, createDummySpots } from "./gpx.js";
import { generateDummyTerrain, buildTerrainFromGPX } from "./terrain.js";
import {
  setLoading,
  setStatus,
  showDefaultError,
  hideDefaultError,
  renderSpotList,
  updateInfoPanel,
  setRaceControlsEnabled,
  setRaceStatus,
  renderRaceBoard
} from "./ui.js";
import { createMapController } from "./map2d.js";
import { createSceneController } from "./scene3d.js";
import { createRaceController } from "./race.js";

const state = {
  parsedTerrain: [],
  spots: createDummySpots(),
  currentGpxData: null,
  raceUiElapsed: 0,
  raceStatusMode: "idle",
  cameraMode: "free"
};

const raceController = createRaceController();
const mapController = createMapController("map");

const sceneController = createSceneController({
  containerId: "canvas-container",
  labelsContainerId: "labels-container",
  parsedTerrain: state.parsedTerrain,
  terrainGridSize: TERRAIN_SIZE_GRID,
  getSpots: () => state.spots,
  getCurrentGpx: () => state.currentGpxData,
  onResize: () => mapController.resize(),
  onTick: handleFrameTick
});

const gpxInput = document.getElementById("gpx-input");
const sampleGpxSelect = document.getElementById("sample-gpx-select");
document.getElementById("gpx-button").addEventListener("click", () => gpxInput.click());
document.getElementById("gpx-button-fallback").addEventListener("click", () => gpxInput.click());
gpxInput.addEventListener("change", handleGPXUpload);
sampleGpxSelect.addEventListener("change", handleBundledSampleChange);

const raceStartButton = document.getElementById("race-start");
const racePauseButton = document.getElementById("race-pause");
const raceResetButton = document.getElementById("race-reset");
const cameraButtons = {
  free: document.getElementById("camera-free"),
  chase: document.getElementById("camera-chase"),
  front: document.getElementById("camera-front"),
  cinematic: document.getElementById("camera-cinematic")
};

const supportRunnerSelect = document.getElementById("support-runner-select");
const supportSpeedSlider = document.getElementById("support-speed-slider");
const supportFinishSlider = document.getElementById("support-finish-slider");
const supportSpeedValue = document.getElementById("support-speed-value");
const supportFinishValue = document.getElementById("support-finish-value");
const cheerButton = document.getElementById("cheer-button");
const cheerMeterFill = document.getElementById("cheer-meter-fill");
const cheerPercent = document.getElementById("cheer-percent");
const cheerEnergyFill = document.getElementById("cheer-energy-fill");
const cheerEnergyPercent = document.getElementById("cheer-energy-percent");
const overheatFill = document.getElementById("overheat-fill");
const overheatPercent = document.getElementById("overheat-percent");
const supportStatusText = document.getElementById("support-status-text");
const supportBudgetText = document.getElementById("support-budget-text");

Object.entries(cameraButtons).forEach(([mode, button]) => {
  button.addEventListener("click", () => {
    setCameraMode(mode);
  });
});

supportRunnerSelect.addEventListener("change", () => {
  applySupportRunnerFromUI();
});

supportRunnerSelect.addEventListener("input", () => {
  applySupportRunnerFromUI();
});

function applySupportRunnerFromUI() {
  const ok = raceController.setSupportRunner(supportRunnerSelect.value);
  if (!ok) {
    const fallback = raceController.getSupportState().runnerId;
    if (fallback) {
      supportRunnerSelect.value = fallback;
    }
    return;
  }
  refreshSupportUI();
  refreshRunnerViews();
}

supportSpeedSlider.addEventListener("input", () => {
  applySupportParamsFromUI();
});

supportFinishSlider.addEventListener("input", () => {
  applySupportParamsFromUI();
});

cheerButton.addEventListener("click", () => {
  raceController.cheer();
  refreshSupportUI();
});

raceStartButton.addEventListener("click", () => {
  raceController.start();
  state.raceStatusMode = "running";
  setRaceStatus("レース中");
  if (state.cameraMode === "free") {
    setCameraMode("chase");
  }
});

racePauseButton.addEventListener("click", () => {
  raceController.pause();
  state.raceStatusMode = "paused";
  setRaceStatus("一時停止");
});

raceResetButton.addEventListener("click", () => {
  raceController.reset();
  state.raceStatusMode = "idle";
  setRaceStatus("待機中");
  refreshSupportUI();
  refreshRunnerViews();
});

window.onload = async () => {
  lucide.createIcons();

  initBundledSampleSelector();
  setRaceControlsEnabled(false);
  setRaceStatus("GPX読込待ち");
  renderRaceBoard([]);
  setCameraMode("free");

  setSupportControlsEnabled(false);
  refreshSupportUI();

  generateDummyTerrain(state.parsedTerrain, TERRAIN_SIZE_GRID);
  updateInfoPanel(null);

  sceneController.init();
  renderSpotList(state.spots, focusSpot);
  sceneController.animate();

  await loadDefaultGPX();
};

function initBundledSampleSelector() {
  sampleGpxSelect.innerHTML = "";

  BUNDLED_GPX_SAMPLES.forEach((sample) => {
    const option = document.createElement("option");
    option.value = sample.id;
    option.textContent = sample.name;
    sampleGpxSelect.appendChild(option);
  });
}

function setSupportControlsEnabled(enabled) {
  supportRunnerSelect.disabled = !enabled;
  supportSpeedSlider.disabled = !enabled;
  supportFinishSlider.disabled = !enabled;
  if (!enabled) {
    cheerButton.disabled = true;
  }
}

function initSupportRunnerSelector(runnerConfigs) {
  supportRunnerSelect.innerHTML = "";
  runnerConfigs.forEach((runner) => {
    const option = document.createElement("option");
    option.value = runner.id;
    option.textContent = `${runner.name} (${runner.style})`;
    supportRunnerSelect.appendChild(option);
  });

  const supportState = raceController.getSupportState();
  if (supportState.runnerId) {
    supportRunnerSelect.value = supportState.runnerId;
  }
}

function applySupportParamsFromUI() {
  const speedPct = Number(supportSpeedSlider.value);
  const finishPct = Number(supportFinishSlider.value);
  raceController.setSupportParams({
    speedMultiplier: speedPct / 100,
    finishMultiplier: finishPct / 100
  });
  refreshSupportUI();
}

function refreshSupportUI({ syncControls = true } = {}) {
  const supportState = raceController.getSupportState();

  const speedPct = Math.round((supportState.speedMultiplier || 1) * 100);
  const finishPct = Math.round((supportState.finishMultiplier || 1) * 100);

  if (syncControls && document.activeElement !== supportSpeedSlider) {
    supportSpeedSlider.value = String(speedPct);
  }
  if (syncControls && document.activeElement !== supportFinishSlider) {
    supportFinishSlider.value = String(finishPct);
  }
  supportSpeedValue.textContent = `${speedPct}%`;
  supportFinishValue.textContent = `${finishPct}%`;

  const cheer = supportState.cheerPercent || 0;
  cheerMeterFill.style.width = `${cheer}%`;
  cheerPercent.textContent = `${cheer}%`;

  const energy = supportState.cheerEnergyPercent || 0;
  cheerEnergyFill.style.width = `${energy}%`;
  cheerEnergyPercent.textContent = `${energy}%`;

  const overheat = supportState.overheatPercent || 0;
  overheatFill.style.width = `${overheat}%`;
  overheatPercent.textContent = `${overheat}%`;

  supportBudgetText.textContent = `配分 ${supportState.combinedPercent || 0}%`;

  if (
    syncControls &&
    supportState.runnerId &&
    document.activeElement !== supportRunnerSelect &&
    supportRunnerSelect.value !== supportState.runnerId
  ) {
    supportRunnerSelect.value = supportState.runnerId;
  }

  const controlsEnabled = !supportRunnerSelect.disabled;
  if (!controlsEnabled) {
    cheerButton.disabled = true;
    cheerButton.textContent = "応援ブースト";
    supportStatusText.textContent = "推し設定で応援可能";
    return;
  }

  if (supportState.canCheer) {
    cheerButton.disabled = false;
    cheerButton.textContent = "応援ブースト";
    if (supportState.isOverheated) {
      supportStatusText.textContent = `過熱中: 出力 ${supportState.overheatPenaltyPercent}%`;
    } else {
      supportStatusText.textContent = "応援可能";
    }
  } else if (supportState.isOverheated && (supportState.cheerCooldown || 0) <= 0) {
    cheerButton.disabled = true;
    cheerButton.textContent = "過熱中";
    supportStatusText.textContent = `失速ペナルティ中 (${supportState.overheatPenaltyPercent}%)`;
  } else if ((supportState.cheerCooldown || 0) > 0) {
    cheerButton.disabled = true;
    cheerButton.textContent = `CT ${supportState.cheerCooldown.toFixed(1)}s`;
    supportStatusText.textContent = "クールダウン中";
  } else {
    cheerButton.disabled = true;
    cheerButton.textContent = "EN不足";
    supportStatusText.textContent = "応援エネルギー回復待ち";
  }
}

function getBundledSampleById(sampleId) {
  return BUNDLED_GPX_SAMPLES.find((sample) => sample.id === sampleId) || null;
}

function getDefaultBundledSample() {
  return BUNDLED_GPX_SAMPLES.find((sample) => sample.path === DEFAULT_GPX_PATH) || BUNDLED_GPX_SAMPLES[0] || null;
}

function setCameraMode(mode) {
  state.cameraMode = mode;
  sceneController.setCameraMode(mode);
  Object.entries(cameraButtons).forEach(([key, button]) => {
    button.classList.toggle("camera-btn-active", key === mode);
  });
}

async function loadDefaultGPX() {
  const defaultSample = getDefaultBundledSample();
  if (!defaultSample) {
    clearRouteState();
    return;
  }

  sampleGpxSelect.value = defaultSample.id;
  await loadBundledSample(defaultSample, true);
}

async function handleBundledSampleChange(event) {
  const sample = getBundledSampleById(event.target.value);
  if (!sample) {
    return;
  }
  await loadBundledSample(sample, false);
}

async function loadBundledSample(sample, isStartup) {
  const loadingMessage = isStartup ? "既定サンプルを読み込み中..." : `テンプレート読込中: ${sample.name}`;
  setLoading(true, loadingMessage);
  setStatus(loadingMessage);
  hideDefaultError();

  try {
    const response = await fetch(sample.path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xmlText = await response.text();
    const fileName = sample.path.split("/").pop() || `${sample.id}.gpx`;
    const data = parseGPX(xmlText, {
      source: "bundled",
      fileName,
      displayName: sample.name
    });

    applyData(data);
    sampleGpxSelect.value = sample.id;
    setStatus(`テンプレートを表示中（${sample.name}）`);
  } catch (error) {
    console.error(error);
    setStatus("テンプレートGPXの読込失敗。GPX選択で手動ロードできます。", true);
    showDefaultError(`テンプレートGPX (${sample.path}) の読み込みに失敗しました。GPX選択から手動で読み込んでください。`);
    clearRouteState();
  } finally {
    setLoading(false);
    lucide.createIcons();
  }
}

function handleGPXUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  setLoading(true, "選択したGPXを読み込み中...");

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = parseGPX(e.target.result, {
        source: "upload",
        fileName: file.name,
        displayName: file.name
      });
      applyData(data);
      setStatus(`アップロードしたGPXを表示中（${file.name}）`);
      hideDefaultError();
    } catch (error) {
      console.error(error);
      setStatus("GPX読込エラー。別のファイルを選択してください。", true);
      alert("GPXデータの読み込みに失敗しました。ファイル形式を確認してください。");
    } finally {
      setLoading(false);
      event.target.value = "";
      lucide.createIcons();
    }
  };

  reader.onerror = () => {
    setLoading(false);
    setStatus("ファイル読込に失敗しました。", true);
    alert("ファイルの読み込みに失敗しました。");
    event.target.value = "";
  };

  reader.readAsText(file);
}

function applyData(data) {
  state.currentGpxData = data;
  state.spots = createSpotsFromData(data);

  buildTerrainFromGPX(state.parsedTerrain, data.points, TERRAIN_SIZE_GRID);

  sceneController.rebuild();
  mapController.update(data, state.spots);
  updateInfoPanel(data);
  renderSpotList(state.spots, focusSpot);

  raceController.loadTrack(data);
  const runnerConfigs = raceController.getRunnerConfigs();
  initSupportRunnerSelector(runnerConfigs);
  sceneController.setRunners(runnerConfigs);
  mapController.setRunners(runnerConfigs);

  state.raceStatusMode = "idle";
  state.raceUiElapsed = 0;
  setRaceControlsEnabled(true);
  setRaceStatus("待機中");
  setSupportControlsEnabled(true);

  refreshSupportUI();
  refreshRunnerViews();
}

function clearRouteState() {
  state.currentGpxData = null;
  state.spots = createDummySpots();
  generateDummyTerrain(state.parsedTerrain, TERRAIN_SIZE_GRID);

  sceneController.rebuild();
  mapController.update(null, state.spots);
  updateInfoPanel(null);
  renderSpotList(state.spots, focusSpot);

  raceController.clearTrack();
  sceneController.setRunners([]);
  mapController.setRunners([]);
  setCameraMode("free");

  state.raceStatusMode = "empty";
  setRaceControlsEnabled(false);
  setRaceStatus("GPX読込待ち");
  renderRaceBoard([]);

  setSupportControlsEnabled(false);
  supportRunnerSelect.innerHTML = "";
  refreshSupportUI();
}

function focusSpot(index) {
  const spot = state.spots[index];
  if (!spot) return;

  sceneController.flyToSpot(index);
  mapController.flyToSpot(spot);
}

function refreshRunnerViews(updateBoard = true) {
  const positions = raceController.getRunnerPositions();
  const leaderboard = raceController.getLeaderboard();
  sceneController.updateRunnerPositions(positions);
  mapController.updateRunnerPositions(positions);
  if (leaderboard.length > 0) {
    sceneController.setCameraTargetRunner(leaderboard[0].id);
  }
  if (updateBoard) {
    renderRaceBoard(leaderboard);
  }
  return leaderboard;
}

function handleFrameTick(deltaSec) {
  raceController.step(deltaSec);
  const leaderboard = refreshRunnerViews(false);

  const meta = raceController.getMeta();
  if (!meta.ready) {
    return;
  }

  state.raceUiElapsed += deltaSec;
  if (state.raceUiElapsed < 0.12) {
    return;
  }
  state.raceUiElapsed = 0;
  refreshSupportUI({ syncControls: false });
  renderRaceBoard(leaderboard);

  if (meta.allFinished && state.raceStatusMode !== "finished") {
    state.raceStatusMode = "finished";
    setRaceStatus("レース終了");
  } else if (meta.running && state.raceStatusMode !== "running") {
    state.raceStatusMode = "running";
    setRaceStatus("レース中");
  }
}
