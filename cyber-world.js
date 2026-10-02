import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;

const CITIES = [
  { name: 'Vancouver', lat: 49.3, lon: -123.1 },
  { name: 'San Francisco', lat: 37.8, lon: -122.4 },
  { name: 'Los Angeles', lat: 34.1, lon: -118.2 },
  { name: 'Mexico City', lat: 19.4, lon: -99.1 },
  { name: 'New York', lat: 40.7, lon: -74.0 },
  { name: 'Toronto', lat: 43.7, lon: -79.4 },
  { name: 'Sao Paulo', lat: -23.5, lon: -46.6 },
  { name: 'Buenos Aires', lat: -34.6, lon: -58.4 },
  { name: 'Reykjavik', lat: 64.1, lon: -21.9 },
  { name: 'London', lat: 51.5, lon: -0.1 },
  { name: 'Paris', lat: 48.9, lon: 2.4 },
  { name: 'Istanbul', lat: 41.0, lon: 29.0 },
  { name: 'Cairo', lat: 30.0, lon: 31.2 },
  { name: 'Lagos', lat: 6.5, lon: 3.4 },
  { name: 'Johannesburg', lat: -26.2, lon: 28.0 },
  { name: 'Nairobi', lat: -1.3, lon: 36.8 },
  { name: 'Dubai', lat: 25.2, lon: 55.3 },
  { name: 'Mumbai', lat: 19.1, lon: 72.9 },
  { name: 'Delhi', lat: 28.6, lon: 77.2 },
  { name: 'Singapore', lat: 1.3, lon: 103.8 },
  { name: 'Hong Kong', lat: 22.3, lon: 114.2 },
  { name: 'Seoul', lat: 37.6, lon: 127.0 },
  { name: 'Tokyo', lat: 35.7, lon: 139.7 },
  { name: 'Sydney', lat: -33.9, lon: 151.2 },
  { name: 'Perth', lat: -31.9, lon: 115.9 }
];

const ROUTES = [
  [1, 4], [4, 9], [9, 10], [10, 12], [12, 16], [16, 17], [17, 19], [19, 22],
  [22, 23], [4, 6], [6, 7], [9, 13], [13, 14], [14, 15], [10, 18], [18, 19],
  [2, 21], [20, 22], [0, 9], [3, 17], [11, 16], [5, 21], [24, 23]
];

const LANDMASSES = [
  [[-168, 70], [-150, 72], [-137, 61], [-127, 56], [-124, 47], [-117, 32], [-108, 24], [-98, 19], [-88, 21], [-82, 27], [-80, 34], [-73, 42], [-61, 47], [-55, 54], [-65, 60], [-82, 58], [-94, 62], [-108, 67], [-128, 70], [-145, 72]],
  [[-52, 60], [-43, 60], [-30, 70], [-38, 82], [-55, 84], [-63, 75]],
  [[-81, 12], [-73, 9], [-66, 8], [-60, 4], [-52, -2], [-49, -11], [-55, -19], [-60, -28], [-67, -39], [-73, -54], [-77, -42], [-79, -22], [-80, -4]],
  [[-12, 36], [3, 37], [17, 33], [31, 30], [36, 19], [43, 10], [50, 1], [42, -12], [33, -25], [22, -35], [15, -34], [8, -27], [1, -16], [-8, -1], [-16, 13]],
  [[-11, 72], [3, 72], [16, 67], [28, 69], [40, 63], [54, 60], [69, 58], [80, 54], [91, 55], [105, 51], [119, 54], [134, 48], [146, 44], [158, 58], [177, 62], [169, 48], [157, 44], [146, 38], [137, 34], [129, 35], [121, 25], [112, 21], [105, 8], [99, 6], [91, 20], [81, 8], [75, 10], [69, 24], [58, 26], [49, 39], [39, 42], [29, 47], [19, 54], [8, 58], [-2, 58]],
  [[43, -12], [50, -14], [51, -24], [44, -26], [43, -18]],
  [[112, -11], [130, -10], [143, -16], [153, -27], [145, -39], [131, -44], [116, -35], [113, -22]],
  [[-8, 59], [-3, 58], [-2, 54], [-6, 50], [-10, 52]],
  [[-180, 66], [-169, 66], [-165, 58], [-174, 53], [-180, 56]]
];

function drawMapTexture() {
  const width = 1024;
  const height = 512;
  const mapCanvas = document.createElement('canvas');
  const lightCanvas = document.createElement('canvas');
  mapCanvas.width = lightCanvas.width = width;
  mapCanvas.height = lightCanvas.height = height;

  const mapContext = mapCanvas.getContext('2d');
  const lightContext = lightCanvas.getContext('2d');
  const ocean = mapContext.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, '#0b1926');
  ocean.addColorStop(0.5, '#07131e');
  ocean.addColorStop(1, '#0b1b28');
  mapContext.fillStyle = ocean;
  mapContext.fillRect(0, 0, width, height);

  mapContext.strokeStyle = 'rgba(82, 173, 190, 0.10)';
  mapContext.lineWidth = 1;
  for (let longitude = -180; longitude <= 180; longitude += 20) {
    const x = ((longitude + 180) / 360) * width;
    mapContext.beginPath();
    mapContext.moveTo(x, 0);
    mapContext.lineTo(x, height);
    mapContext.stroke();
  }
  for (let latitude = -80; latitude <= 80; latitude += 20) {
    const y = ((90 - latitude) / 180) * height;
    mapContext.beginPath();
    mapContext.moveTo(0, y);
    mapContext.lineTo(width, y);
    mapContext.stroke();
  }

  for (const [index, polygon] of LANDMASSES.entries()) {
    const points = polygon.map(([longitude, latitude]) => [
      ((longitude + 180) / 360) * width,
      ((90 - latitude) / 180) * height
    ]);
    const land = mapContext.createLinearGradient(0, points[0][1], 0, points[Math.floor(points.length / 2)][1]);
    land.addColorStop(0, index % 2 ? '#163341' : '#102d3a');
    land.addColorStop(1, '#0b222e');
    mapContext.beginPath();
    mapContext.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) mapContext.lineTo(x, y);
    mapContext.closePath();
    mapContext.fillStyle = land;
    mapContext.fill();
    mapContext.strokeStyle = 'rgba(98, 203, 207, 0.30)';
    mapContext.lineWidth = 1.2;
    mapContext.stroke();
  }

  lightContext.clearRect(0, 0, width, height);
  for (const city of CITIES) {
    const x = ((city.lon + 180) / 360) * width;
    const y = ((90 - city.lat) / 180) * height;
    const glow = lightContext.createRadialGradient(x, y, 1, x, y, 20);
    glow.addColorStop(0, 'rgba(132, 246, 235, 0.95)');
    glow.addColorStop(0.12, 'rgba(74, 203, 221, 0.46)');
    glow.addColorStop(1, 'rgba(38, 154, 201, 0)');
    lightContext.fillStyle = glow;
    lightContext.fillRect(x - 20, y - 20, 40, 40);
    lightContext.fillStyle = 'rgba(176, 255, 239, 0.85)';
    lightContext.fillRect(x - 1, y - 1, 2, 2);
  }

  const mapTexture = new THREE.CanvasTexture(mapCanvas);
  const lightTexture = new THREE.CanvasTexture(lightCanvas);
  mapTexture.colorSpace = THREE.SRGBColorSpace;
  mapTexture.anisotropy = 4;
  lightTexture.anisotropy = 4;
  return { mapTexture, lightTexture };
}

function pointOnGlobe(latitude, longitude, radius) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.sin(lon)
  );
}

function createAtmosphere(radius) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float edge = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.7);
        float glow = smoothstep(0.04, 0.92, edge);
        gl_FragColor = vec4(0.11, 0.57, 0.78, glow * 0.46);
      }
    `
  });
}

function createGlobeLines(group, radius) {
  const material = new THREE.LineBasicMaterial({
    color: 0x58c8dc,
    transparent: true,
    opacity: 0.13,
    depthWrite: false
  });

  for (let latitude = -60; latitude <= 60; latitude += 20) {
    const points = [];
    for (let longitude = -180; longitude <= 180; longitude += 4) {
      points.push(pointOnGlobe(latitude, longitude, radius));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  for (let longitude = -180; longitude < 180; longitude += 20) {
    const points = [];
    for (let latitude = -88; latitude <= 88; latitude += 4) {
      points.push(pointOnGlobe(latitude, longitude, radius));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }
}

function createParticleField(scene, count) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const alphas = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * 34;
    positions[index * 3 + 1] = (Math.random() - 0.5) * 22;
    positions[index * 3 + 2] = -23 + Math.random() * 30;
    speeds[index] = 0.12 + Math.random() * 0.38;
    sizes[index] = 0.07 + Math.random() * 0.2;
    phases[index] = Math.random() * TAU;
    alphas[index] = 0.15 + Math.random() * 0.45;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMotion: { value: 1 } },
    vertexShader: `
      attribute float aSpeed;
      attribute float aSize;
      attribute float aPhase;
      attribute float aAlpha;
      uniform float uTime;
      uniform float uMotion;
      varying float vAlpha;
      void main() {
        vec3 drift = position;
        drift.y = mod(position.y - uTime * aSpeed * uMotion + 11.0, 22.0) - 11.0;
        drift.x += sin(uTime * 0.12 + aPhase) * 0.14;
        vec4 viewPosition = modelViewMatrix * vec4(drift, 1.0);
        gl_PointSize = clamp(aSize * 250.0 / max(-viewPosition.z, 1.0), 1.0, 5.0);
        gl_Position = projectionMatrix * viewPosition;
        vAlpha = aAlpha;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float glow = 1.0 - smoothstep(0.08, 0.5, radius);
        gl_FragColor = vec4(0.38, 0.78, 0.86, glow * vAlpha);
      }
    `
  });
  const particles = new THREE.Points(geometry, material);
  scene.add(particles);
  return material;
}

function createGlyphAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const symbols = ['01', 'A4', 'C7', '::', '0x', 'F1', '7E', '//', 'D9', '+>', 'E3', '1F', 'B0', '04', '>>', 'C2'];
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = 'bold 26px monospace';
  for (let row = 0; row < 16; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      const index = (row * 16 + column) % symbols.length;
      const alpha = 0.55 + Math.random() * 0.45;
      context.fillStyle = `rgba(187, 247, 241, ${alpha})`;
      context.fillText(symbols[index], column * 32 + 16, row * 32 + 17, 29);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createDataStreams(scene, count) {
  const positions = [];
  const speeds = [];
  const sizes = [];
  const phases = [];
  const alphas = [];
  const glyphs = [];
  const columns = Math.max(12, Math.floor(count / 8));

  for (let column = 0; column < columns; column += 1) {
    const x = (Math.random() - 0.5) * 32;
    const z = -20 + Math.random() * 27;
    const streamSpeed = 0.35 + Math.random() * 0.75;
    const glyphCount = Math.max(3, Math.floor(count / columns));
    for (let row = 0; row < glyphCount; row += 1) {
      positions.push(x + (Math.random() - 0.5) * 0.14, 10 - row * (0.35 + Math.random() * 0.23) - Math.random() * 0.45, z + (Math.random() - 0.5) * 0.5);
      speeds.push(streamSpeed * (0.88 + Math.random() * 0.24));
      sizes.push(7 + Math.random() * 9);
      phases.push(Math.random() * TAU);
      alphas.push(0.12 + Math.random() * 0.4);
      const glyph = Math.floor(Math.random() * 256);
      const u = (glyph % 16) / 16;
      const v = 1 - Math.floor(glyph / 16) / 16 - 1 / 16;
      glyphs.push(u, v);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speeds, 1));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setAttribute('aGlyph', new THREE.Float32BufferAttribute(glyphs, 2));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMotion: { value: 1 }, uGlyphAtlas: { value: createGlyphAtlas() } },
    vertexShader: `
      attribute float aSpeed;
      attribute float aSize;
      attribute float aPhase;
      attribute float aAlpha;
      attribute vec2 aGlyph;
      uniform float uTime;
      uniform float uMotion;
      varying float vAlpha;
      varying vec2 vGlyph;
      void main() {
        vec3 stream = position;
        stream.y = mod(position.y - uTime * aSpeed * uMotion + 11.0, 22.0) - 11.0;
        stream.x += sin(uTime * 0.11 + aPhase) * 0.055;
        vec4 viewPosition = modelViewMatrix * vec4(stream, 1.0);
        gl_PointSize = clamp(aSize * 310.0 / max(-viewPosition.z, 1.0), 4.0, 20.0);
        gl_Position = projectionMatrix * viewPosition;
        vAlpha = aAlpha;
        vGlyph = aGlyph;
      }
    `,
    fragmentShader: `
      uniform sampler2D uGlyphAtlas;
      varying float vAlpha;
      varying vec2 vGlyph;
      void main() {
        vec4 glyph = texture2D(uGlyphAtlas, vGlyph + gl_PointCoord * vec2(0.0625));
        if (glyph.a < 0.15) discard;
        gl_FragColor = vec4(0.40, 0.88, 0.84, glyph.a * vAlpha);
      }
    `
  });
  scene.add(new THREE.Points(geometry, material));
  return material;
}

function createPerspectiveGrid(scene) {
  const geometry = new THREE.PlaneGeometry(64, 48);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 grid = vUv * vec2(82.0, 64.0);
        grid.y += uTime * 1.15;
        vec2 lineDistance = min(fract(grid), 1.0 - fract(grid));
        float line = 1.0 - smoothstep(0.018, 0.065, min(lineDistance.x, lineDistance.y));
        float horizon = smoothstep(0.0, 0.78, vUv.y);
        float fade = smoothstep(0.0, 0.16, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
        float alpha = line * horizon * fade * 0.18;
        gl_FragColor = vec4(0.22, 0.62, 0.72, alpha);
      }
    `
  });
  const grid = new THREE.Mesh(geometry, material);
  grid.rotation.x = -Math.PI / 2;
  grid.position.set(0, -6.6, -6.5);
  scene.add(grid);
  return material;
}

function addHud(root) {
  const hud = document.createElement('div');
  hud.className = 'cyber-hud';
  hud.setAttribute('aria-hidden', 'true');
  for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const corner = document.createElement('span');
    corner.className = `hud-bracket ${position}`;
    hud.append(corner);
  }
  root.append(hud);
}

export function initCyberWorld(root) {
  if (!root || root.querySelector('.cyber-world-canvas')) return;

  let renderer;
  try {
    const isMobile = window.matchMedia('(max-width: 620px)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !isMobile, powerPreference: 'low-power' });
    renderer.domElement.className = 'cyber-world-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.setClearColor(0x02070d, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.15 : 1.5));
    root.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02070d, 0.014);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 90);
    camera.position.set(0, 0, 17);
    camera.lookAt(0, 0, -4.5);

    scene.add(new THREE.AmbientLight(0x598399, 1.2));
    const keyLight = new THREE.DirectionalLight(0x7cdbed, 2.1);
    keyLight.position.set(-7, 5, 9);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x176a91, 1.4);
    rimLight.position.set(7, -2, -7);
    scene.add(rimLight);
    const violetLight = new THREE.PointLight(0x514c95, 0.62, 30, 1.8);
    violetLight.position.set(-7, 3, 4);
    scene.add(violetLight);

    const earth = new THREE.Group();
    scene.add(earth);
    const radius = 3.75;
    const textures = drawMapTexture();
    const earthMaterial = new THREE.MeshStandardMaterial({
      map: textures.mapTexture,
      emissiveMap: textures.lightTexture,
      emissive: new THREE.Color(0x5fc2cf),
      emissiveIntensity: 1.1,
      roughness: 0.92,
      metalness: 0.12
    });
    earth.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), earthMaterial));
    earth.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.045, 64, 48), createAtmosphere(radius)));
    createGlobeLines(earth, radius * 1.008);

    const cityGeometry = new THREE.SphereGeometry(0.045, 8, 6);
    const cityMaterial = new THREE.MeshBasicMaterial({
      color: 0x9dfff0,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const cityMarkers = new THREE.InstancedMesh(cityGeometry, cityMaterial, CITIES.length);
    const markerMatrix = new THREE.Matrix4();
    const markerScale = new THREE.Vector3(1, 1, 1);
    CITIES.forEach((city, index) => {
      markerMatrix.compose(pointOnGlobe(city.lat, city.lon, radius * 1.012), new THREE.Quaternion(), markerScale);
      cityMarkers.setMatrixAt(index, markerMatrix);
    });
    earth.add(cityMarkers);

    const arcCurves = [];
    const arcMaterial = new THREE.LineBasicMaterial({ color: 0x58d5e7, transparent: true, opacity: 0.42, depthWrite: false });
    for (const [startIndex, endIndex] of ROUTES) {
      const start = pointOnGlobe(CITIES[startIndex].lat, CITIES[startIndex].lon, radius * 1.018);
      const end = pointOnGlobe(CITIES[endIndex].lat, CITIES[endIndex].lon, radius * 1.018);
      const control = start.clone().add(end).normalize().multiplyScalar(radius * (1.12 + Math.random() * 0.09));
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const points = curve.getPoints(40);
      earth.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), arcMaterial));
      arcCurves.push(curve);
    }

    const packetGeometry = new THREE.SphereGeometry(0.035, 7, 5);
    const packetMaterial = new THREE.MeshBasicMaterial({ color: 0xb2fff0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const packets = new THREE.InstancedMesh(packetGeometry, packetMaterial, arcCurves.length);
    earth.add(packets);

    const orbitGroup = new THREE.Group();
    earth.add(orbitGroup);
    const orbitMaterial = new THREE.MeshBasicMaterial({ color: 0x43b9d3, transparent: true, opacity: 0.24, depthWrite: false });
    const orbitConfigurations = [
      { rotation: [0.42, 0.12, 0.18], scale: [1, 0.82, 1] },
      { rotation: [-0.54, 0.22, -0.2], scale: [0.84, 1, 1] }
    ];
    for (const orbit of orbitConfigurations) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.28, 0.008, 3, 180), orbitMaterial);
      ring.rotation.set(...orbit.rotation);
      ring.scale.set(...orbit.scale);
      orbitGroup.add(ring);
    }

    const orbiterGeometry = new THREE.SphereGeometry(0.04, 7, 5);
    const orbiterMaterial = new THREE.MeshBasicMaterial({ color: 0x7cece0, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false });
    const orbiterCount = isMobile ? 8 : 14;
    const orbiters = new THREE.InstancedMesh(orbiterGeometry, orbiterMaterial, orbiterCount);
    orbitGroup.add(orbiters);

    const threatRings = [];
    for (const [index, cityIndex] of [4, 9, 22].entries()) {
      const city = CITIES[cityIndex];
      const position = pointOnGlobe(city.lat, city.lon, radius * 1.025);
      const normal = position.clone().normalize();
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: index === 2 ? 0xff687e : 0x68e8d9,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 4, 48), ringMaterial);
      ring.position.copy(position);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      earth.add(ring);
      threatRings.push({ ring, material: ringMaterial, phase: index * 1.9 });
    }

    const particleMaterial = createParticleField(scene, isMobile ? 170 : 390);
    const glyphMaterial = createDataStreams(scene, isMobile ? 92 : 220);
    const gridMaterial = createPerspectiveGrid(scene);
    addHud(root);
    document.body.classList.add('cyber-world-active');
    document.body.classList.remove('cyber-world-fallback');

    const pointerTarget = new THREE.Vector2();
    const pointer = new THREE.Vector2();
    const scrollTarget = new THREE.Vector2();
    const scroll = new THREE.Vector2();
    let earthBaseX = 2.65;
    let earthBaseY = 0.05;
    const onPointerMove = (event) => {
      pointerTarget.x = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      pointerTarget.y = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
    };
    const onScroll = () => {
      const scrollRange = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      scrollTarget.y = THREE.MathUtils.clamp(window.scrollY / scrollRange, 0, 1);
    };
    const onResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      const narrow = width < 760;
      earthBaseX = narrow ? 0.45 : 2.65;
      earthBaseY = narrow ? 0.6 : 0.05;
      earth.position.set(earthBaseX, earthBaseY, -5.6);
      earth.scale.setScalar(width < 620 ? 0.76 : 1);
      camera.fov = width < 620 ? 43 : 38;
      camera.updateProjectionMatrix();
    };
    onResize();
    onScroll();
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    const dummy = new THREE.Object3D();
    const motion = prefersReducedMotion ? 0.24 : 1;
    const startTime = performance.now();
    let lastRender = startTime;
    let animationFrame = 0;

    const renderFrame = (now) => {
      if (document.hidden) {
        animationFrame = 0;
        return;
      }
      animationFrame = requestAnimationFrame(renderFrame);
      const minimumFrameTime = isMobile ? 1000 / 30 : 0;
      if (now - lastRender < minimumFrameTime) return;
      const delta = Math.min((now - lastRender) / 1000, 0.05);
      lastRender = now;
      const time = (now - startTime) / 1000;

      earth.rotation.y += delta * 0.035 * motion;
      earth.rotation.x = -0.08 + Math.sin(time * 0.11) * 0.018 * motion;
      orbitGroup.rotation.y = time * 0.018 * motion;
      orbitGroup.rotation.z = Math.sin(time * 0.09) * 0.025 * motion;
      particleMaterial.uniforms.uTime.value = time;
      glyphMaterial.uniforms.uTime.value = time;
      particleMaterial.uniforms.uMotion.value = motion;
      glyphMaterial.uniforms.uMotion.value = motion;
      gridMaterial.uniforms.uTime.value = time * motion;

      arcCurves.forEach((curve, index) => {
        const progress = (time * (0.055 + (index % 4) * 0.009) + index * 0.137) % 1;
        dummy.position.copy(curve.getPointAt(progress));
        dummy.scale.setScalar(0.72 + 0.28 * Math.sin(time * 4 + index));
        dummy.updateMatrix();
        packets.setMatrixAt(index, dummy.matrix);
      });
      packets.instanceMatrix.needsUpdate = true;

      for (let index = 0; index < orbiterCount; index += 1) {
        const angle = time * (0.22 + (index % 3) * 0.045) * motion + index * TAU / orbiterCount;
        const orbitRadius = radius * 1.28;
        dummy.position.set(Math.cos(angle) * orbitRadius, Math.sin(angle) * orbitRadius * 0.82, Math.sin(angle) * orbitRadius * 0.34);
        dummy.scale.setScalar(0.65 + 0.35 * Math.sin(time * 2.3 + index));
        dummy.updateMatrix();
        orbiters.setMatrixAt(index, dummy.matrix);
      }
      orbiters.instanceMatrix.needsUpdate = true;

      for (const { ring, material, phase } of threatRings) {
        const pulse = (Math.sin(time * 1.5 * motion + phase) + 1) * 0.5;
        ring.scale.setScalar(0.8 + pulse * 0.75);
        material.opacity = 0.22 + pulse * 0.4;
      }

      pointer.lerp(pointerTarget, 0.018);
      scroll.lerp(scrollTarget, 0.014);
      earth.position.x = earthBaseX + Math.sin(scroll.y * Math.PI) * 0.18 * motion;
      earth.position.y = earthBaseY + scroll.y * 0.42 * motion;
      camera.position.x += (pointer.x * 0.42 + Math.sin(time * 0.12) * 0.13 - camera.position.x) * 0.008;
      camera.position.y += (-pointer.y * 0.2 + scroll.y * 0.12 * motion + Math.sin(time * 0.15) * 0.08 - camera.position.y) * 0.008;
      camera.position.z = 17 + Math.sin(time * 0.12) * 0.09;
      violetLight.position.set(-7 + Math.sin(time * 0.055) * 1.6 + pointer.x * 0.35, 3 + Math.cos(time * 0.07) * 1.1 - pointer.y * 0.25, 4);
      violetLight.intensity = 0.58 + Math.sin(time * 0.2) * 0.035 + scroll.y * 0.06 * motion;
      camera.lookAt(0, 0, -4.4);
      renderer.render(scene, camera);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else if (!animationFrame) {
        lastRender = performance.now();
        animationFrame = requestAnimationFrame(renderFrame);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      document.body.classList.remove('cyber-world-active');
      document.body.classList.add('cyber-world-fallback');
    });
    animationFrame = requestAnimationFrame(renderFrame);
  } catch {
    renderer?.dispose();
    root.querySelector('.cyber-world-canvas')?.remove();
    document.body.classList.remove('cyber-world-active');
    document.body.classList.add('cyber-world-fallback');
  }
}