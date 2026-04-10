import { getElevationAt } from "./terrain.js";

export function createSceneController({
  containerId,
  labelsContainerId,
  parsedTerrain,
  terrainGridSize,
  getSpots,
  getCurrentGpx,
  onResize,
  onTick
}) {
  const container = document.getElementById(containerId);
  const labelsContainer = document.getElementById(labelsContainerId);

  let scene, camera, renderer, controls;
  let terrainMesh, routeLine, instancedTrees, baseMesh;
  let runnerGroup = null;
  const runnerVisuals = new Map();
  const runnerMotion = new Map();
  const clock = new THREE.Clock();
  const vUp = new THREE.Vector3(0, 1, 0);
  const vTmp = new THREE.Vector3();
  let cameraMode = "free";
  let cameraTargetRunnerId = null;
  let cinematicTime = 0;
  let trailGroup = null;
  let dustPoints = null;
  let dustPositions = null;
  const dustPool = [];
  let nextDustIndex = 0;

  const TRAIL_POINT_COUNT = 20;
  const DUST_PARTICLE_COUNT = 180;

  const animState = {
    isMoving: false,
    progress: 0,
    startPos: new THREE.Vector3(),
    startLookAt: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    targetLookAt: new THREE.Vector3()
  };

  function elevation(x, y) {
    return getElevationAt(parsedTerrain, terrainGridSize, x, y);
  }

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdbeafe);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 70, 70);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const sun = new THREE.DirectionalLight(0xfff5e6, 0.92);
    sun.position.set(50, 80, 20);
    sun.castShadow = true;
    scene.add(sun);

    createTerrain();
    generateForest();
    initDustSystem();
    setupLabels();

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (onResize) onResize();
    });
  }

  function createTerrain() {
    const geo = new THREE.PlaneGeometry(120, 120, terrainGridSize, terrainGridSize);
    const pos = geo.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const z = elevation(pos.getX(i), pos.getY(i));
      pos.setZ(i, z);

      if (z > 20) color.setHSL(0.33, 0.22, 0.48);
      else if (z > 6) color.setHSL(0.30, 0.30, 0.43);
      else color.setHSL(0.26, 0.38, 0.40);
      colors.push(color.r, color.g, color.b);
    }

    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true }));
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(85, 80, 10, 64), new THREE.MeshStandardMaterial({ color: 0x5b4330 }));
    baseMesh.position.y = -5.1;
    scene.add(baseMesh);
  }

  function generateForest() {
    const count = 3500;
    const geo = new THREE.SphereGeometry(0.8, 6, 6);
    geo.scale(1, 1.35, 1);
    geo.translate(0, 1, 0);

    instancedTrees = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
    instancedTrees.castShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let added = 0;

    for (let i = 0; i < count * 5 && added < count; i++) {
      const x = (Math.random() - 0.5) * 110;
      const y = (Math.random() - 0.5) * 110;
      if (Math.hypot(x, y) > 55) continue;

      const z = elevation(x, y);
      if (z <= 0.5) continue;

      dummy.position.set(x, z, -y);
      const s = 0.5 + Math.random();
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      instancedTrees.setMatrixAt(added, dummy.matrix);

      const h = 0.28 + Math.random() * 0.08;
      color.setHSL(h, 0.38 + Math.random() * 0.2, 0.34 + Math.random() * 0.18);
      instancedTrees.setColorAt(added, color);
      added++;
    }

    instancedTrees.count = added;
    scene.add(instancedTrees);
  }

  function initDustSystem() {
    if (dustPoints) {
      scene.remove(dustPoints);
    }

    dustPositions = new Float32Array(DUST_PARTICLE_COUNT * 3);
    for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
      dustPositions[i * 3] = 0;
      dustPositions[i * 3 + 1] = -999;
      dustPositions[i * 3 + 2] = 0;
      dustPool[i] = {
        active: false,
        life: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0
      };
    }
    nextDustIndex = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.42,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    });
    dustPoints = new THREE.Points(geo, mat);
    dustPoints.frustumCulled = false;
    scene.add(dustPoints);
  }

  function emitDust(position, dir, intensity) {
    const burst = Math.max(1, Math.min(4, Math.floor(intensity * 4)));
    for (let i = 0; i < burst; i++) {
      const id = nextDustIndex;
      nextDustIndex = (nextDustIndex + 1) % DUST_PARTICLE_COUNT;
      const p = dustPool[id];
      p.active = true;
      p.life = 0.2 + Math.random() * 0.28;
      p.x = position.x + (Math.random() - 0.5) * 0.45;
      p.y = position.y + 0.06 + Math.random() * 0.15;
      p.z = position.z + (Math.random() - 0.5) * 0.45;
      p.vx = -dir.x * (0.8 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.3;
      p.vy = 0.35 + Math.random() * 0.4;
      p.vz = -dir.z * (0.8 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.3;
    }
  }

  function updateDust(deltaSec) {
    if (!dustPoints) return;

    for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
      const p = dustPool[i];
      const base = i * 3;

      if (!p.active) {
        dustPositions[base + 1] = -999;
        continue;
      }

      p.life -= deltaSec;
      if (p.life <= 0) {
        p.active = false;
        dustPositions[base + 1] = -999;
        continue;
      }

      p.vy -= deltaSec * 1.9;
      p.vx *= 0.97;
      p.vy *= 0.96;
      p.vz *= 0.97;
      p.x += p.vx * deltaSec;
      p.y += p.vy * deltaSec;
      p.z += p.vz * deltaSec;

      dustPositions[base] = p.x;
      dustPositions[base + 1] = p.y;
      dustPositions[base + 2] = p.z;
    }

    dustPoints.geometry.attributes.position.needsUpdate = true;
  }

  function drawRoute() {
    const data = getCurrentGpx();
    if (!data) return;

    const vectors = data.points.map((pt) => new THREE.Vector3(pt.x, elevation(pt.x, pt.y) + 0.35, -pt.y));
    routeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vectors), new THREE.LineBasicMaterial({ color: 0xdc2626, linewidth: 2 }));
    scene.add(routeLine);
  }

  function setRunners(runners) {
    if (!scene) return;

    if (runnerGroup) {
      scene.remove(runnerGroup);
    }
    if (trailGroup) {
      scene.remove(trailGroup);
    }
    runnerVisuals.clear();
    runnerMotion.clear();
    cameraTargetRunnerId = null;

    runnerGroup = new THREE.Group();
    trailGroup = new THREE.Group();

    runners.forEach((runner, index) => {
      const visual = createRunnerVisual(runner, index);
      runnerGroup.add(visual.root);
      trailGroup.add(visual.trailLine);
      runnerVisuals.set(runner.id, visual);
      runnerMotion.set(runner.id, {
        prev: new THREE.Vector3(),
        current: new THREE.Vector3(),
        dir: new THREE.Vector3(1, 0, 0)
      });
    });

    scene.add(runnerGroup);
    scene.add(trailGroup);
  }

  function createRunnerVisual(runner, index) {
    const root = new THREE.Group();
    const bodyPivot = new THREE.Group();
    root.add(bodyPivot);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: runner.color,
      roughness: 0.35,
      metalness: 0.06
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.2,
      metalness: 0.05
    });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 1.18, 10), bodyMat);
    torso.castShadow = true;
    torso.position.y = 1.35;
    bodyPivot.add(torso);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), bodyMat);
    chest.castShadow = true;
    chest.position.y = 1.95;
    bodyPivot.add(chest);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), accentMat);
    head.castShadow = true;
    head.position.y = 2.45;
    bodyPivot.add(head);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.2, 0.95, 0);
    bodyPivot.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.2, 0.95, 0);
    bodyPivot.add(rightLegPivot);

    const legGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.9, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.04 });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.castShadow = true;
    leftLeg.position.y = -0.45;
    leftLegPivot.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.castShadow = true;
    rightLeg.position.y = -0.45;
    rightLegPivot.add(rightLeg);

    const footGeo = new THREE.SphereGeometry(0.14, 10, 8);
    const leftFoot = new THREE.Mesh(footGeo, accentMat);
    leftFoot.castShadow = true;
    leftFoot.position.set(0, -0.92, 0.14);
    leftLegPivot.add(leftFoot);

    const rightFoot = new THREE.Mesh(footGeo, accentMat);
    rightFoot.castShadow = true;
    rightFoot.position.set(0, -0.92, 0.14);
    rightLegPivot.add(rightFoot);

    const streakGeo = new THREE.ConeGeometry(0.2, 1.2, 8);
    const streakMat = new THREE.MeshBasicMaterial({
      color: runner.color,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    const streak = new THREE.Mesh(streakGeo, streakMat);
    streak.rotation.x = -Math.PI / 2;
    streak.position.set(0, 1.35, -0.9);
    streak.visible = false;
    bodyPivot.add(streak);

    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(TRAIL_POINT_COUNT * 3);
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setDrawRange(0, 0);
    const trailLine = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({
        color: runner.color,
        transparent: true,
        opacity: 0.62
      })
    );
    trailLine.frustumCulled = false;

    return {
      id: runner.id,
      root,
      bodyPivot,
      leftLegPivot,
      rightLegPivot,
      streak,
      trailLine,
      trailPositions,
      trailPoints: [],
      phase: index * 1.35,
      speedNorm: 0
    };
  }

  function updateTrail(visual, worldPos) {
    const point = new THREE.Vector3(worldPos.x, worldPos.y + 0.95, worldPos.z);
    visual.trailPoints.unshift(point);
    if (visual.trailPoints.length > TRAIL_POINT_COUNT) {
      visual.trailPoints.pop();
    }

    const count = visual.trailPoints.length;
    for (let i = 0; i < count; i++) {
      const p = visual.trailPoints[i];
      visual.trailPositions[i * 3] = p.x;
      visual.trailPositions[i * 3 + 1] = p.y;
      visual.trailPositions[i * 3 + 2] = p.z;
    }
    visual.trailLine.geometry.setDrawRange(0, count);
    visual.trailLine.geometry.attributes.position.needsUpdate = true;
  }

  function updateRunnerPositions(positions) {
    positions.forEach((runner) => {
      const visual = runnerVisuals.get(runner.id);
      const motion = runnerMotion.get(runner.id);
      if (!visual) return;

      if (!Number.isFinite(runner.x) || !Number.isFinite(runner.y)) {
        visual.root.visible = false;
        visual.trailLine.visible = false;
        return;
      }

      visual.root.visible = true;
      visual.trailLine.visible = true;
      const z = elevation(runner.x, runner.y);
      visual.root.position.set(runner.x, z + 0.02, -runner.y);

      if (!motion) return;
      motion.prev.copy(motion.current);
      motion.current.copy(visual.root.position);
      vTmp.copy(motion.current).sub(motion.prev);
      vTmp.y = 0;
      if (vTmp.lengthSq() > 0.000001) {
        motion.dir.copy(vTmp.normalize());
      }

      visual.root.rotation.y = Math.atan2(motion.dir.x, motion.dir.z);
      visual.speedNorm = Math.min(1.7, (runner.speedKmh || 0) / 180);
      visual.streak.visible = visual.speedNorm > 0.35;
      visual.streak.scale.set(1, 1, 0.9 + visual.speedNorm * 2.4);
      visual.streak.material.opacity = Math.min(0.78, 0.1 + visual.speedNorm * 0.45);

      updateTrail(visual, visual.root.position);
      if (visual.speedNorm > 0.4) {
        emitDust(visual.root.position, motion.dir, visual.speedNorm);
      }
    });
  }

  function updateRunnerAnimations(deltaSec) {
    runnerVisuals.forEach((visual) => {
      visual.phase += deltaSec * (8 + visual.speedNorm * 16);
      const legSwing = Math.sin(visual.phase) * (0.35 + visual.speedNorm * 0.55);
      const bodyBob = Math.abs(Math.sin(visual.phase * 2)) * (0.04 + visual.speedNorm * 0.11);

      visual.leftLegPivot.rotation.x = legSwing;
      visual.rightLegPivot.rotation.x = -legSwing;
      visual.bodyPivot.rotation.x = -0.08 - visual.speedNorm * 0.22;
      visual.bodyPivot.position.y = bodyBob;
    });
  }

  function setCameraMode(mode) {
    cameraMode = mode;
    if (cameraMode === "free" && controls) {
      controls.enabled = true;
    }
  }

  function setCameraTargetRunner(runnerId) {
    cameraTargetRunnerId = runnerId;
  }

  function updateRaceCamera(deltaSec) {
    if (cameraMode === "free" || animState.isMoving) {
      controls.enabled = true;
      return;
    }

    const targetId = cameraTargetRunnerId || runnerMotion.keys().next().value;
    const motion = runnerMotion.get(targetId);
    if (!motion) return;

    const runnerPos = motion.current;
    const runnerDir = motion.dir.lengthSq() > 0.000001 ? motion.dir : new THREE.Vector3(1, 0, 0);
    const lookAt = runnerPos.clone().addScaledVector(vUp, 1.6);
    let desiredPos = runnerPos.clone();

    controls.enabled = false;

    if (cameraMode === "chase") {
      desiredPos.addScaledVector(runnerDir, -8.8).add(new THREE.Vector3(0, 3.8, 0));
    } else if (cameraMode === "front") {
      desiredPos.addScaledVector(runnerDir, 6.5).add(new THREE.Vector3(0, 2.8, 0));
    } else if (cameraMode === "cinematic") {
      cinematicTime += deltaSec * 0.9;
      const radius = 8.3;
      desiredPos.add(new THREE.Vector3(Math.cos(cinematicTime) * radius, 4.3, Math.sin(cinematicTime) * radius));
    } else {
      controls.enabled = true;
      return;
    }

    camera.position.lerp(desiredPos, 0.08);
    controls.target.lerp(lookAt, 0.12);
  }

  function setupLabels() {
    labelsContainer.innerHTML = "";
    const spots = getSpots();

    spots.forEach((spot, idx) => {
      const el = document.createElement("div");
      el.className = "spot-label group";
      el.innerHTML = `
        <div class="flex flex-col items-center">
          <div class="bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-lg border border-emerald-200 text-sm font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity mb-1">${spot.name}</div>
          <div class="marker ${spot.color} w-8 h-8 rounded-full border-4 border-white shadow-md flex items-center justify-center text-white"><i data-lucide="${spot.icon}" class="w-4 h-4"></i></div>
        </div>`;
      el.onclick = () => flyToSpot(idx);
      labelsContainer.appendChild(el);
      spot.element = el;
      spot.worldPos = new THREE.Vector3(spot.x, elevation(spot.x, spot.y), -spot.y);
    });

    lucide.createIcons();
  }

  function flyToSpot(index) {
    const spot = getSpots()[index];
    if (!spot) return;

    const offset = spot.cameraOffset || { x: 15, y: 15, z: 15 };
    const lookHeight = Number.isFinite(spot.lookHeight) ? spot.lookHeight : 0;
    const lookTarget = spot.worldPos.clone().add(new THREE.Vector3(0, lookHeight, 0));

    animState.isMoving = true;
    animState.progress = 0;
    animState.startPos.copy(camera.position);
    animState.startLookAt.copy(controls.target);
    animState.targetLookAt.copy(lookTarget);
    animState.targetPos.copy(spot.worldPos).add(new THREE.Vector3(offset.x, offset.y, offset.z));
  }

  function rebuild() {
    [terrainMesh, baseMesh, instancedTrees, routeLine].forEach((mesh) => {
      if (mesh) scene.remove(mesh);
    });
    createTerrain();
    generateForest();
    drawRoute();
    setupLabels();
  }

  function updateLabels() {
    const vector = new THREE.Vector3();
    getSpots().forEach((spot) => {
      if (!spot.element || !spot.worldPos) return;
      vector.copy(spot.worldPos).project(camera);
      if (vector.z > 1) {
        spot.element.style.opacity = "0";
        return;
      }
      const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
      const y = (vector.y * -0.5 + 0.5) * window.innerHeight;
      spot.element.style.transform = `translate(-50%, -100%) translate(${x}px,${y}px)`;
      spot.element.style.opacity = "1";
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    const deltaSec = clock.getDelta();

    if (animState.isMoving) {
      animState.progress += 0.02;
      if (animState.progress >= 1) {
        animState.progress = 1;
        animState.isMoving = false;
      }
      const eased = 1 - Math.pow(1 - animState.progress, 3);
      camera.position.lerpVectors(animState.startPos, animState.targetPos, eased);
      controls.target.lerpVectors(animState.startLookAt, animState.targetLookAt, eased);
    }

    if (onTick) {
      onTick(deltaSec);
    }

    updateRaceCamera(deltaSec);
    updateRunnerAnimations(deltaSec);
    updateDust(deltaSec);
    controls.update();
    renderer.render(scene, camera);
    updateLabels();
  }

  return {
    init,
    rebuild,
    animate,
    flyToSpot,
    setRunners,
    updateRunnerPositions,
    setCameraMode,
    setCameraTargetRunner
  };
}
