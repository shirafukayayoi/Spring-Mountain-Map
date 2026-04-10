import { DEFAULT_GPX_PATH, TERRAIN_SIZE_GRID } from "./constants.js";
import { parseGPX, createSpotsFromData, createDummySpots } from "./gpx.js";
import { generateDummyTerrain, buildTerrainFromGPX } from "./terrain.js";
import { setLoading, setStatus, showDefaultError, hideDefaultError, renderSpotList, updateInfoPanel } from "./ui.js";
import { createMapController } from "./map2d.js";
import { createSceneController } from "./scene3d.js";

const state = {
  parsedTerrain: [],
  spots: createDummySpots(),
  currentGpxData: null
};

const mapController = createMapController("map");
const sceneController = createSceneController({
  containerId: "canvas-container",
  labelsContainerId: "labels-container",
  parsedTerrain: state.parsedTerrain,
  terrainGridSize: TERRAIN_SIZE_GRID,
  getSpots: () => state.spots,
  getCurrentGpx: () => state.currentGpxData,
  onResize: () => mapController.resize()
});

const gpxInput = document.getElementById("gpx-input");
document.getElementById("gpx-button").addEventListener("click", () => gpxInput.click());
document.getElementById("gpx-button-fallback").addEventListener("click", () => gpxInput.click());
gpxInput.addEventListener("change", handleGPXUpload);

window.onload = async () => {
  lucide.createIcons();

  generateDummyTerrain(state.parsedTerrain, TERRAIN_SIZE_GRID);
  updateInfoPanel(null);

  sceneController.init();
  renderSpotList(state.spots, focusSpot);
  sceneController.animate();

  await loadDefaultGPX();
};

async function loadDefaultGPX() {
  setLoading(true, "既定サンプルを読み込み中...");
  setStatus("既定サンプルを読み込み中...");
  hideDefaultError();

  try {
    const response = await fetch(DEFAULT_GPX_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xmlText = await response.text();
    const data = parseGPX(xmlText, {
      source: "default",
      fileName: "koruldi-lakes.gpx",
      displayName: "Koruldi Lakes Hike"
    });

    applyData(data);
    setStatus("既定サンプルを表示中（Koruldi Lakes Hike）");
  } catch (error) {
    console.error(error);
    setStatus("既定GPXの読込失敗。GPX選択で手動ロードできます。", true);
    showDefaultError("既定GPX (data/koruldi-lakes.gpx) の読み込みに失敗しました。GPX選択から手動で読み込んでください。");

    state.currentGpxData = null;
    state.spots = createDummySpots();
    generateDummyTerrain(state.parsedTerrain, TERRAIN_SIZE_GRID);

    sceneController.rebuild();
    mapController.update(null, state.spots);
    updateInfoPanel(null);
    renderSpotList(state.spots, focusSpot);
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
}

function focusSpot(index) {
  const spot = state.spots[index];
  if (!spot) return;

  sceneController.flyToSpot(index);
  mapController.flyToSpot(spot);
}
