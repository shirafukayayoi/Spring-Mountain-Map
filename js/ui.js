export function setLoading(show, message) {
  const loader = document.getElementById("loading");
  if (message) {
    document.getElementById("loading-text").textContent = message;
  }
  loader.style.opacity = show ? "1" : "0";
  loader.style.pointerEvents = show ? "auto" : "none";
}

export function setStatus(message, isError = false) {
  document.getElementById("status-text").textContent = message;
  const chip = document.getElementById("status-chip");
  chip.className = `flex items-center gap-1.5 text-[10px] md:text-xs font-medium pl-1 ${isError ? "text-rose-700" : "text-emerald-700"}`;
}

export function showDefaultError(message) {
  document.getElementById("default-gpx-error-text").textContent = message;
  document.getElementById("default-gpx-error").classList.remove("hidden");
}

export function hideDefaultError() {
  document.getElementById("default-gpx-error").classList.add("hidden");
}

export function renderSpotList(spots, onClickSpot) {
  const container = document.getElementById("spot-list-container");
  container.innerHTML = "";

  spots.forEach((spot, index) => {
    const button = document.createElement("button");
    button.className = `flex-none w-56 bg-white/82 backdrop-blur-md p-2 rounded-xl shadow-sm border border-emerald-50 ${spot.hover || "hover:border-emerald-300"} transition-all text-left snap-center`;
    button.onclick = () => onClickSpot(index);
    button.innerHTML = `<div class="flex items-center gap-2">
      <div class="${spot.bg} p-1.5 rounded-lg ${spot.iconColor}"><i data-lucide="${spot.icon}" class="w-4 h-4"></i></div>
      <div class="overflow-hidden"><h3 class="font-bold text-slate-800 text-xs truncate">${spot.name}</h3><p class="text-[10px] text-slate-500 truncate">${spot.desc}</p></div>
    </div>`;
    container.appendChild(button);
  });

  lucide.createIcons();
}

export function updateInfoPanel(data) {
  const set = (id, value) => {
    document.getElementById(id).textContent = value;
  };

  if (!data) {
    set("info-start", "-");
    set("info-summit", "-");
    set("info-end", "-");
    set("info-distance", "-");
    set("info-ele-range", "-");
    set("info-ele-gain", "-");
    set("info-track-name", "トラック名: -");
    return;
  }

  const points = data.rawPoints;
  const s = data.stats;
  const start = points[s.startIndex];
  const summit = points[s.summitIndex];
  const end = points[s.endIndex];

  set("info-start", `標高 ${Math.round(start.ele)}m`);
  set("info-summit", `標高 ${Math.round(summit.ele)}m`);
  set("info-end", `標高 ${Math.round(end.ele)}m`);
  set("info-distance", `${(s.totalDistance / 1000).toFixed(2)} km`);
  set("info-ele-range", `${Math.round(s.minEle)}m - ${Math.round(s.maxEle)}m`);
  set("info-ele-gain", `+${Math.round(s.ascent)}m / -${Math.round(s.descent)}m`);
  set("info-track-name", `トラック名: ${data.trackName}`);
}

function formatTime(seconds) {
  const sec = Math.max(0, Math.floor(seconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function setRaceControlsEnabled(enabled) {
  document.getElementById("race-start").disabled = !enabled;
  document.getElementById("race-pause").disabled = !enabled;
  document.getElementById("race-reset").disabled = !enabled;
}

export function setRaceStatus(text) {
  document.getElementById("race-status").textContent = text;
}

export function renderRaceBoard(leaderboard) {
  const board = document.getElementById("race-board");
  board.innerHTML = "";

  leaderboard.forEach((runner) => {
    const row = document.createElement("div");
    row.className = "race-row";

    const speedText = Number.isFinite(runner.speedKmh) ? `${runner.speedKmh.toFixed(1)} km/h` : "- km/h";
    const timeText = runner.finished && Number.isFinite(runner.finishTime)
      ? `GOAL ${formatTime(runner.finishTime)}`
      : `${speedText} | 残り ${(runner.remaining / 1000).toFixed(2)}km`;

    row.innerHTML = `
      <span class="race-place">${runner.place}</span>
      <span class="race-name-wrap">
        <span class="race-name">${runner.name}</span>
        <span class="race-style">${runner.style || "標準"}</span>
      </span>
      <span class="race-meta">${timeText}</span>
    `;
    row.style.borderLeft = `4px solid ${runner.color}`;
    board.appendChild(row);
  });
}
