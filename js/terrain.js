export function generateDummyTerrain(parsedTerrain, terrainGridSize) {
  parsedTerrain.length = 0;
  for (let py = 0; py < terrainGridSize; py++) {
    const row = [];
    for (let px = 0; px < terrainGridSize; px++) {
      const wx = (px / (terrainGridSize - 1)) * 120 - 60;
      const wy = (py / (terrainGridSize - 1)) * 120 - 60;
      let ele = Math.max(0, 16 - Math.hypot(wx, wy) * 0.2);
      ele += Math.sin(wx * 0.2) * Math.cos(wy * 0.2) * 1.5;
      row.push(Math.max(0, ele));
    }
    parsedTerrain.push(row);
  }
}

export function buildTerrainFromGPX(parsedTerrain, points, terrainGridSize) {
  const sampleStep = Math.max(1, Math.floor(points.length / 220));
  const samples = points.filter((_, idx) => idx % sampleStep === 0);

  parsedTerrain.length = 0;
  for (let py = 0; py < terrainGridSize; py++) {
    const row = [];
    for (let px = 0; px < terrainGridSize; px++) {
      const wx = (px / (terrainGridSize - 1)) * 120 - 60;
      const wy = (py / (terrainGridSize - 1)) * 120 - 60;

      let nearest = samples[0];
      let minDist = Infinity;
      for (const s of samples) {
        const d = Math.hypot(wx - s.x, wy - s.y);
        if (d < minDist) {
          minDist = d;
          nearest = s;
        }
      }

      let elevation = nearest.z - minDist * 0.45;
      elevation += Math.sin(wx * 0.2) * Math.cos(wy * 0.2) * 1.5;
      row.push(Math.max(0, elevation));
    }
    parsedTerrain.push(row);
  }
}

export function getElevationAt(parsedTerrain, terrainGridSize, x, y) {
  const maxIndex = terrainGridSize - 1;
  const px = Math.round(((x + 60) / 120) * maxIndex);
  const py = Math.round(((y + 60) / 120) * maxIndex);
  if (px < 0 || px > maxIndex || py < 0 || py > maxIndex) {
    return 0;
  }
  return parsedTerrain[py]?.[px] || 0;
}
