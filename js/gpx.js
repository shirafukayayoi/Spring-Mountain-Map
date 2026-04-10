function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function extractTrackName(xmlDoc) {
  const trk = xmlDoc.getElementsByTagNameNS("*", "trk")[0];
  if (!trk) return "";
  const nameNode = trk.getElementsByTagNameNS("*", "name")[0];
  return nameNode ? nameNode.textContent.trim() : "";
}

function computeStats(rawPoints, summitIndex, minEle, maxEle) {
  let totalDistance = 0;
  let ascent = 0;
  let descent = 0;

  for (let i = 1; i < rawPoints.length; i++) {
    const prev = rawPoints[i - 1];
    const curr = rawPoints[i];

    totalDistance += haversineMeters(prev.lat, prev.lon, curr.lat, curr.lon);
    const diff = curr.ele - prev.ele;
    if (diff > 0) {
      ascent += diff;
    } else {
      descent += Math.abs(diff);
    }
  }

  return {
    totalDistance,
    ascent,
    descent,
    minEle,
    maxEle,
    summitIndex,
    startIndex: 0,
    endIndex: rawPoints.length - 1
  };
}

export function parseGPX(xmlText, meta = {}) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");
  if (xmlDoc.querySelector("parsererror")) {
    throw new Error("Invalid XML");
  }

  const trkpts = Array.from(xmlDoc.getElementsByTagNameNS("*", "trkpt"));
  if (trkpts.length === 0) {
    throw new Error("No track points");
  }

  const rawPoints = [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minEle = Infinity;
  let maxEle = -Infinity;
  let summitIndex = 0;

  trkpts.forEach((pt) => {
    const lat = parseFloat(pt.getAttribute("lat"));
    const lon = parseFloat(pt.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const eleNode = pt.getElementsByTagNameNS("*", "ele")[0];
    const eleRaw = eleNode ? parseFloat(eleNode.textContent) : 0;
    const ele = Number.isFinite(eleRaw) ? eleRaw : 0;

    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minEle = Math.min(minEle, ele);

    if (ele > maxEle) {
      maxEle = ele;
      summitIndex = rawPoints.length;
    }

    rawPoints.push({ lat, lon, ele });
  });

  if (rawPoints.length < 2) {
    throw new Error("Not enough points");
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const maxDiff = Math.max(maxLat - minLat, maxLon - minLon, 0.000001);
  const scale = 110 / maxDiff;
  const eleScale = 30 / Math.max(maxEle - minEle, 0.000001);

  const points = rawPoints.map((pt, index) => ({
    x: (pt.lon - centerLon) * scale,
    y: (pt.lat - centerLat) * scale,
    z: (pt.ele - minEle) * eleScale,
    rawEle: Math.round(pt.ele),
    lat: pt.lat,
    lon: pt.lon,
    index
  }));

  return {
    source: meta.source || "unknown",
    fileName: meta.fileName || "unknown.gpx",
    displayName: meta.displayName || "GPX Track",
    trackName: extractTrackName(xmlDoc) || meta.displayName || "GPX Track",
    rawPoints,
    points,
    stats: computeStats(rawPoints, summitIndex, minEle, maxEle)
  };
}

export function createSpotsFromData(data) {
  const pts = data.points;
  const s = data.stats;
  const start = pts[s.startIndex];
  const summit = pts[s.summitIndex];
  const end = pts[s.endIndex];

  return [
    { id: "start", name: "開始点", desc: `標高 ${start.rawEle}m`, x: start.x, y: start.y, lat: start.lat, lon: start.lon, rawEle: start.rawEle, icon: "play", color: "bg-emerald-500", iconColor: "text-emerald-600", bg: "bg-emerald-50", hover: "hover:border-emerald-300", index: s.startIndex },
    { id: "summit", name: "最高点", desc: `標高 ${summit.rawEle}m`, x: summit.x, y: summit.y, lat: summit.lat, lon: summit.lon, rawEle: summit.rawEle, icon: "flag", color: "bg-rose-500", iconColor: "text-rose-600", bg: "bg-rose-50", hover: "hover:border-rose-300", index: s.summitIndex },
    { id: "end", name: "終了点", desc: `標高 ${end.rawEle}m`, x: end.x, y: end.y, lat: end.lat, lon: end.lon, rawEle: end.rawEle, icon: "square", color: "bg-amber-500", iconColor: "text-amber-600", bg: "bg-amber-50", hover: "hover:border-amber-300", index: s.endIndex }
  ].sort((a, b) => a.index - b.index);
}

export function createDummySpots() {
  return [{
    id: "sample",
    name: "待機中",
    desc: "GPXを読み込むとルート情報が表示されます。",
    x: 0,
    y: 0,
    lat: null,
    lon: null,
    rawEle: 0,
    icon: "map-pin",
    color: "bg-emerald-500",
    iconColor: "text-emerald-600",
    bg: "bg-emerald-50",
    hover: "hover:border-emerald-300",
    index: 0
  }];
}
