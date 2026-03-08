import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

let camera: THREE.PerspectiveCamera;
let scene: THREE.Scene;
let renderer: THREE.WebGLRenderer;
let controls: PointerLockControls;

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let moveUp = false;
let moveDown = false;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let isLowSpecMode = false;
let currentResolutionScale = 1;
let frameCount = 0;
let lastFpsSampleTime = performance.now();
let targetFps = 55;
let minResolutionScale = 0.6;
let maxPixelRatio = 1.5;
let perfIndicator: HTMLDivElement | null = null;

// Determine base path for GitHub Pages or local
const basePath = import.meta.env.BASE_URL;
const assetCdnBase = (import.meta.env.VITE_ASSET_CDN_URL as string | undefined)
  ?.trim()
  .replace(/\/+$/, '');

function getAssetUrl(fileName: string, fromCdn = false): string {
  if (fromCdn && assetCdnBase) return `${assetCdnBase}/${fileName}`;
  return `${basePath}assets/${fileName}`;
}

init();
animate();

function detectLowSpecMode(): boolean {
  const queryLowSpec = new URLSearchParams(window.location.search).get('lowSpec');
  if (queryLowSpec === '1' || queryLowSpec === 'true') return true;
  if (queryLowSpec === '0' || queryLowSpec === 'false') return false;

  const canvas = document.createElement('canvas');
  const gl =
    canvas.getContext('webgl') ||
    (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

  if (!gl) return true;

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererString = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)).toLowerCase()
    : '';

  const softwareMarkers = ['swiftshader', 'llvmpipe', 'software', 'softpipe', 'mesa'];
  return softwareMarkers.some((marker) => rendererString.includes(marker));
}

function updateRendererResolution() {
  const pixelRatio = Math.min(window.devicePixelRatio * currentResolutionScale, maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  updatePerformanceIndicator();
}

function updatePerformanceIndicator() {
  if (!perfIndicator) return;
  const modeText = isLowSpecMode ? 'LOW-SPEC MODE' : 'NORMAL MODE';
  const scalePercent = Math.round(currentResolutionScale * 100);
  perfIndicator.textContent = `${modeText} | Render Scale: ${scalePercent}%`;
}

function init() {
  scene = new THREE.Scene();
  isLowSpecMode = detectLowSpecMode();
  if (isLowSpecMode) {
    targetFps = 35;
    minResolutionScale = 0.45;
    maxPixelRatio = 1.0;
  }
  // Remove basic background and fog in favor of HDRI
  // scene.background = new THREE.Color(0x87ceeb); 
  // scene.fog = new THREE.Fog(0x87ceeb, 20, 1000); 

  if (!isLowSpecMode) {
    const hdriFile = 'GSG_HC009_A065_UltimateSkies4k0064.hdr';
    const hdriLocalUrl = getAssetUrl(hdriFile);
    const hdriCdnUrl = assetCdnBase ? getAssetUrl(hdriFile, true) : null;
    const envLoader = new RGBELoader().setCrossOrigin('anonymous');

    const applyHdri = (texture: THREE.DataTexture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = texture;
      scene.environment = texture;
    };

    envLoader.load(
      hdriLocalUrl,
      applyHdri,
      undefined,
      () => {
        if (hdriCdnUrl && hdriCdnUrl !== hdriLocalUrl) {
          envLoader.load(hdriCdnUrl, applyHdri, undefined, () => {
            console.warn(`Failed to load HDRI from local and CDN: ${hdriFile}`);
          });
        }
      }
    );
  } else {
    scene.background = new THREE.Color(0xa8c6e8);
  }

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 5, 20); // Initial camera position

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xccddff, isLowSpecMode ? 0.75 : 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, isLowSpecMode ? 0.9 : 1.5);
  directionalLight.position.set(100, 200, 50);
  directionalLight.castShadow = !isLowSpecMode;
  directionalLight.shadow.camera.top = 200;
  directionalLight.shadow.camera.bottom = -200;
  directionalLight.shadow.camera.left = -200;
  directionalLight.shadow.camera.right = 200;
  directionalLight.shadow.camera.near = 1.0;
  directionalLight.shadow.camera.far = 400;
  directionalLight.shadow.mapSize.width = isLowSpecMode ? 1024 : 4096;
  directionalLight.shadow.mapSize.height = isLowSpecMode ? 1024 : 4096;
  directionalLight.shadow.bias = -0.0005; // Slightly negative bias for PCFSoft
  directionalLight.shadow.normalBias = 0.05;
  scene.add(directionalLight);

  // Controls Initialization
  controls = new PointerLockControls(camera, document.body);

  const blocker = document.getElementById('blocker');
  const instructions = document.getElementById('instructions');

  instructions?.addEventListener('click', () => {
    controls.lock();
  });

  controls.addEventListener('lock', () => {
    if (instructions) instructions.style.display = 'none';
    if (blocker) blocker.style.display = 'none';
  });

  controls.addEventListener('unlock', () => {
    if (blocker) blocker.style.display = 'flex';
    if (instructions) instructions.style.display = '';
  });

  scene.add(controls.object);

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        moveForward = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        moveLeft = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        moveBackward = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        moveRight = true;
        break;
      case 'Space':
        moveUp = true;
        break;
      case 'ShiftLeft':
        moveDown = true;
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        moveForward = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        moveLeft = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        moveBackward = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        moveRight = false;
        break;
      case 'Space':
        moveUp = false;
        break;
      case 'ShiftLeft':
        moveDown = false;
        break;
    }
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Load Model
  const manager = new THREE.LoadingManager();
  const loadingElement = document.getElementById('loading');
  const loadingTextElement = document.getElementById('loading-text');

  manager.onProgress = function (_item, loaded, total) {
    if (loadingTextElement) {
      loadingTextElement.innerText = `Loading Campus: ${Math.round((loaded / total) * 100)}%`;
    }
  };

  manager.onLoad = function () {
    if (loadingElement) {
      loadingElement.style.opacity = '0';
      setTimeout(() => {
        loadingElement.style.display = 'none';
        if (blocker) blocker.style.display = 'flex';
      }, 500);
    }
    console.log('Loading complete!');
  };

  manager.onError = function (url) {
    console.error('Error loading item:', url);
    if (loadingTextElement) {
      loadingTextElement.innerText = 'Error loading model...';
    }
  };

  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setCrossOrigin('anonymous');

  const modelFile = 'WebCampus.glb';
  const modelLocalUrl = getAssetUrl(modelFile);
  const modelCdnUrl = assetCdnBase ? getAssetUrl(modelFile, true) : null;

  const onCampusLoaded = (gltf: { scene: THREE.Object3D }) => {
    const object = gltf.scene;
    // Improve material appearance
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = !isLowSpecMode;
        mesh.receiveShadow = !isLowSpecMode;

        // Force front-side rendering to prevent shadow leaking issues
        // and back-side shadow casting to robustly prevent shadow acne
        if (!isLowSpecMode && mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => {
              m.side = THREE.FrontSide;
              m.shadowSide = THREE.BackSide;
            });
          } else {
            mesh.material.side = THREE.FrontSide;
            mesh.material.shadowSide = THREE.BackSide;
          }
        }
      }
    });
    // Add a ground plane
    const groundGeometry = new THREE.PlaneGeometry(2000, 2000);
    const groundMaterial = (isLowSpecMode ? new THREE.MeshLambertMaterial({
      color: 0xcccccc
    }) : new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.8,
      metalness: 0.2
    }));
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate it to lie flat
    ground.position.y = -0.1; // Slightly below 0 to avoid z-fighting with model floors
    ground.receiveShadow = !isLowSpecMode;
    scene.add(ground);

    scene.add(object);
  };

  const onCampusProgress = (xhr: ProgressEvent<EventTarget>) => {
    if (loadingTextElement) {
      loadingTextElement.innerText = `Loading Campus: ${Math.round((xhr.loaded / xhr.total) * 100) || 0}%`;
    }
  };

  const onCampusError = (triedFallback: boolean) => {
    if (!triedFallback && modelCdnUrl && modelCdnUrl !== modelLocalUrl) {
      if (loadingTextElement) {
        loadingTextElement.innerText = 'Local model missing, loading from external storage...';
      }
      gltfLoader.load(modelCdnUrl, onCampusLoaded, onCampusProgress, () => onCampusError(true));
      return;
    }

    if (loadingTextElement) {
      loadingTextElement.innerText = 'Error loading model...';
    }
    console.error(`Failed to load model from local and CDN: ${modelFile}`);
  };

  gltfLoader.load(modelLocalUrl, onCampusLoaded, onCampusProgress, () => onCampusError(false));

  // Renderer Setup
  renderer = new THREE.WebGLRenderer({
    antialias: !isLowSpecMode,
    alpha: false,
    logarithmicDepthBuffer: !isLowSpecMode // Better precision for large scenes
  });
  updateRendererResolution();
  renderer.shadowMap.enabled = !isLowSpecMode;
  renderer.shadowMap.type = isLowSpecMode ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = isLowSpecMode ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const appDiv = document.getElementById('app');
  if (appDiv) {
    appDiv.appendChild(renderer.domElement);
    perfIndicator = document.createElement('div');
    perfIndicator.id = 'perf-indicator';
    if (isLowSpecMode) perfIndicator.classList.add('low-spec');
    appDiv.appendChild(perfIndicator);
    updatePerformanceIndicator();
  }

  // Handle window resize
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  updateRendererResolution();
}

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now();

  if (controls.isLocked === true) {
    const delta = (time - prevTime) / 1000;

    velocity.x -= velocity.x * 10.0 * delta; // Friction
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= velocity.y * 10.0 * delta;

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.y = Number(moveUp) - Number(moveDown);

    direction.normalize(); // this ensures consistent movements in all directions

    const walkSpeed = 200.0; // Increased speed for faster navigation

    if (moveForward || moveBackward) velocity.z -= direction.z * walkSpeed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * walkSpeed * delta;
    if (moveUp || moveDown) velocity.y -= direction.y * walkSpeed * delta;

    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);

    // Move up/down separately since PointerLockControls only handles XZ plane
    camera.position.y -= velocity.y * delta;
  }

  prevTime = time;
  frameCount++;

  if (time - lastFpsSampleTime >= 1000) {
    const fps = (frameCount * 1000) / (time - lastFpsSampleTime);
    if (fps < targetFps - 5 && currentResolutionScale > minResolutionScale) {
      currentResolutionScale = Math.max(minResolutionScale, currentResolutionScale - 0.1);
      updateRendererResolution();
    } else if (fps > targetFps + 8 && currentResolutionScale < 1) {
      currentResolutionScale = Math.min(1, currentResolutionScale + 0.05);
      updateRendererResolution();
    }
    frameCount = 0;
    lastFpsSampleTime = time;
  }

  renderer.render(scene, camera);
}
