import { getElevationAt } from "./terrain.js";

export function createSceneController({
  containerId,
  labelsContainerId,
  parsedTerrain,
  terrainGridSize,
  getSpots,
  getCurrentGpx,
  onResize
}) {
  const container = document.getElementById(containerId);
  const labelsContainer = document.getElementById(labelsContainerId);

  let scene, camera, renderer, controls;
  let terrainMesh, routeLine, instancedTrees, baseMesh, petals;

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
    initPetals();
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

      const h = 0.95 + Math.random() * 0.1;
      color.setHSL(h % 1.0, 0.4 + Math.random() * 0.3, 0.68 + Math.random() * 0.2);
      instancedTrees.setColorAt(added, color);
      added++;
    }

    instancedTrees.count = added;
    scene.add(instancedTrees);
  }

  function initPetals() {
    const count = 1000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 150;
      positions[i * 3 + 1] = Math.random() * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 150;
      velocities[i * 3] = (Math.random() - 0.5) * 0.1;
      velocities[i * 3 + 1] = -(0.05 + Math.random() * 0.1);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    petals = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffb7c5, size: 0.4, transparent: true, opacity: 0.8 }));
    petals.userData.velocities = velocities;
    scene.add(petals);
  }

  function updatePetals() {
    if (!petals) return;
    const positions = petals.geometry.attributes.position.array;
    const velocities = petals.userData.velocities;
    const now = Date.now() * 0.001;

    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3] += velocities[i * 3] + Math.sin(now + i) * 0.02;
      positions[i * 3 + 1] += velocities[i * 3 + 1];
      positions[i * 3 + 2] += velocities[i * 3 + 2];
      if (positions[i * 3 + 1] < 0) {
        positions[i * 3 + 1] = 50;
        positions[i * 3] = (Math.random() - 0.5) * 150;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 150;
      }
    }
    petals.geometry.attributes.position.needsUpdate = true;
  }

  function drawRoute() {
    const data = getCurrentGpx();
    if (!data) return;

    const vectors = data.points.map((pt) => new THREE.Vector3(pt.x, elevation(pt.x, pt.y) + 0.35, -pt.y));
    routeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vectors), new THREE.LineBasicMaterial({ color: 0xe11d48, linewidth: 2 }));
    scene.add(routeLine);
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

    animState.isMoving = true;
    animState.progress = 0;
    animState.startPos.copy(camera.position);
    animState.startLookAt.copy(controls.target);
    animState.targetLookAt.copy(spot.worldPos);
    animState.targetPos.copy(spot.worldPos).add(new THREE.Vector3(15, 15, 15));
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

    controls.update();
    updatePetals();
    renderer.render(scene, camera);
    updateLabels();
  }

  return { init, rebuild, animate, flyToSpot };
}
