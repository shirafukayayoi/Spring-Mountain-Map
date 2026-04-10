export function createMapController(mapElementId) {
  const map = L.map(mapElementId, { zoomControl: true, attributionControl: true }).setView([43.042, 42.704], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const spotLayer = L.layerGroup().addTo(map);
  const runnerLayer = L.layerGroup().addTo(map);
  const runnerMarkers = new Map();
  let routeLayer = null;

  function update(data, spots) {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    spotLayer.clearLayers();

    if (!data) {
      runnerLayer.clearLayers();
      runnerMarkers.clear();
      return;
    }

    const latLngs = data.rawPoints.map((pt) => [pt.lat, pt.lon]);
    routeLayer = L.polyline(latLngs, { color: "#dc2626", weight: 4, opacity: 0.9 }).addTo(map);
    const bounds = routeLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    spots.forEach((spot) => {
      if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lon)) return;
      const color = spot.id === "start" ? "#10b981" : spot.id === "summit" ? "#dc2626" : "#f59e0b";
      const marker = L.circleMarker([spot.lat, spot.lon], {
        radius: 6,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2
      });
      marker.bindTooltip(`${spot.name} (${spot.rawEle}m)`);
      marker.addTo(spotLayer);
    });
  }

  function setRunners(runners) {
    runnerLayer.clearLayers();
    runnerMarkers.clear();

    runners.forEach((runner) => {
      const marker = L.circleMarker([0, 0], {
        radius: 5,
        color: runner.color,
        fillColor: runner.color,
        fillOpacity: 0.95,
        weight: 2
      });
      marker.bindTooltip(runner.name);
      marker.addTo(runnerLayer);
      runnerMarkers.set(runner.id, marker);
    });
  }

  function updateRunnerPositions(runners) {
    runners.forEach((runner) => {
      const marker = runnerMarkers.get(runner.id);
      if (!marker) return;
      if (!Number.isFinite(runner.lat) || !Number.isFinite(runner.lon)) return;
      marker.setLatLng([runner.lat, runner.lon]);
    });
  }

  function flyToSpot(spot) {
    if (!spot || !Number.isFinite(spot.lat) || !Number.isFinite(spot.lon)) return;
    map.flyTo([spot.lat, spot.lon], Math.max(map.getZoom(), 13), { duration: 0.8 });
  }

  function resize() {
    map.invalidateSize();
  }

  return { update, flyToSpot, resize, setRunners, updateRunnerPositions };
}
