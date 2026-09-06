import * as THREE from 'three';
import { ARButton } from './threejsAddons/ARButton.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FontLoader } from './threejsAddons/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

const appElement = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = null; // transparent for passthrough

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
appElement.appendChild(renderer.domElement);
renderer.setClearColor(0x000000, 0.0); // transparent clear color

// Video texture for box faces
const video = document.createElement('video');
video.src = './assets/PushBreathingSpeed2.mov';
video.crossOrigin = 'anonymous';
video.loop = true;
video.muted = true; // required for autoplay on mobile
video.playsInline = true; // iOS inline playback
video.preload = 'auto';

const videoTexture = new THREE.VideoTexture(video);
videoTexture.colorSpace = THREE.SRGBColorSpace;
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.wrapS = THREE.ClampToEdgeWrapping;
videoTexture.wrapT = THREE.ClampToEdgeWrapping;
videoTexture.repeat = new THREE.Vector2( 1, 1);
videoTexture.generateMipmaps = false;

// Environment for realistic reflections/refractions (helps transparent plastic look)
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const environmentTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.02).texture;
scene.environment = environmentTexture;
pmremGenerator.dispose();

document.body.appendChild(ARButton.createButton(renderer, { optionalFeatures: ['hit-test'], requiredFeatures: [] }));

// Lighting
const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
hemisphereLight.position.set(0, 1, 0);
scene.add(hemisphereLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(3, 10, 10);
scene.add(directionalLight);

// Spinning object
const geometry = new THREE.TorusKnotGeometry(0.4, 0.15, 150, 32);
const material = new THREE.MeshPhysicalMaterial({
	map: videoTexture,
	alphaMap: videoTexture,
	color: 0x88ccff,
	metalness: 0.0,
	roughness: 0.15,
	clearcoat: 0.8,
	clearcoatRoughness: 0.1,
	transmission: 0.9, // physically-based transparency
	thickness: 0.25,
	ior: 1.5,
	envMapIntensity: 1.0,
	transparent: true,
	opacity: 1.0,
	side: THREE.DoubleSide
});

material.onBeforeCompile = (shader) => {
	// Invert alphaMap influence safely using built-in variables (diffuseColor, vUv)
	shader.fragmentShader = shader.fragmentShader.replace(
		'#include <alphamap_fragment>',
		`#ifdef USE_ALPHAMAP
			// invert green channel from alphaMap
			diffuseColor.a = texture2D( alphaMap, vMapUv ).g;
		#endif`
	);
};

const mesh = new THREE.Mesh(geometry, material);
mesh.position.set(0, 1.6, -1.5);
mesh.scale.set(0.5, 0.5, 0.5);
scene.add(mesh);

// Vortex of rotating boxes encircling the user
const initialCameraPos = camera.position.clone();
const vortexGroup = new THREE.Group();
vortexGroup.position.set(initialCameraPos.x, 0, initialCameraPos.z);
scene.add(vortexGroup);

// Text labels that follow cubes
const textLabels = [];
const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();

const boxGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
const baseOrbitAngularSpeed = 0.3; // rad/s (previous group rotation speed)
for (let i = 0; i < 20; i++) {
	const boxMaterial = new THREE.MeshPhysicalMaterial({
		map: videoTexture,
		alphaMap: videoTexture,
		color: 0x0000ff,
		metalness: 0.0,
		roughness: 1.0,
		transmission: 0.9,
		thickness: 0.25, 
		ior: 1.5,
		transparent: true,
		envMapIntensity: 1.0,
		opacity: 1.0,
		side: THREE.DoubleSide
	});
	boxMaterial.onBeforeCompile = (shader) => {
		// Invert alphaMap influence safely using built-in variables (diffuseColor, vUv)
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <alphamap_fragment>',
			`#ifdef USE_ALPHAMAP
				// invert green channel from alphaMap
				diffuseColor.a = clamp(texture2D( alphaMap, vMapUv ).g, 0.0, 1.0);
			#endif`
		);
	};
	const box = new THREE.Mesh(boxGeometry, boxMaterial);
	// distribute around a ring with slight vertical variance
	const radius = 2 + Math.random() * 4; // 2m to 6m
	const angle = Math.random() * Math.PI * 2;
	// random local spin speeds (radians/sec)
	const spinX = (Math.random() * 1.2 - 0.6); // -0.6..0.6
	const spinY = (Math.random() * 1.2 - 0.6);
	const spinZ = (Math.random() * 1.2 - 0.6);
	// orbit speed between 50% and 150% of previous group speed
	const orbitSpeed = baseOrbitAngularSpeed * (0.5 + Math.random());
	box.userData = { angle, radius, orbitSpeed, spinX, spinY, spinZ };
	box.position.set(Math.cos(angle) * radius, (Math.random() * 2.5) - 1.25, Math.sin(angle) * radius);
	box.rotation.set(0, Math.random() * Math.PI * 2, 0);
	vortexGroup.add(box);
}

// Load font and create labels for each cube
const fontLoader = new FontLoader();
fontLoader.load('./assets/fonts/Acidic_Normal.json', (loadedFont) => {
	const labelBelowDistance = 0.35; // meters below cube center
	for (let i = 0; i < vortexGroup.children.length; i++) {
		const box = vortexGroup.children[i];
		const text = `Cube ${i}`;
		const textGeometry = new TextGeometry(text, {
			font: loadedFont,
			size: 0.12,
			depth: 0.17,
			height: 0.02,
			curveSegments: 2,
			bevelEnabled: false
		});
		textGeometry.computeBoundingBox();
		textGeometry.center();
		const textMaterial = new THREE.MeshPhysicalMaterial({ color: 0x0000ff, metalness: 0.0, roughness: 0.8, envMapIntensity: 1.0 });
		const textMesh = new THREE.Mesh(textGeometry, textMaterial);
		textMesh.name = `label_${i}`;
		scene.add(textMesh);
		textLabels.push({ box, mesh: textMesh, offsetY: labelBelowDistance });
	}
});

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

// Adjust object height for AR so it's at eye level
renderer.xr.addEventListener('sessionstart', () => {
	mesh.position.y = 0; // in AR, camera Y is ~0, so 0 is eye level
	// center the vortex around the user in AR
	vortexGroup.position.set(0, 0, 0);
	// try to start video when XR session starts (autoplay-friendly)
	video.play().catch(() => {});
});

renderer.xr.addEventListener('sessionend', () => {
	mesh.position.y = 1.6; // restore for non-AR
	// restore the vortex center to the initial camera position
	vortexGroup.position.set(initialCameraPos.x, 0, initialCameraPos.z);
});

// VR animation loop
let previousTimeMs = 0;
renderer.setAnimationLoop((timeMs) => {
	const timeSeconds = timeMs * 0.001;
	const deltaSeconds = previousTimeMs === 0 ? 0 : (timeMs - previousTimeMs) * 0.001;
	previousTimeMs = timeMs;

	// rotate knot
	mesh.rotation.x = timeSeconds * 0.6;
	mesh.rotation.y = timeSeconds * 0.8;

	// update each box: spin locally and orbit around center
	for (const box of vortexGroup.children) {
		const d = box.userData;
		if (!d) continue;
		d.angle += d.orbitSpeed * deltaSeconds;
		box.position.x = Math.cos(d.angle) * d.radius;
		box.position.z = Math.sin(d.angle) * d.radius;
		box.rotation.x += d.spinX * deltaSeconds;
		box.rotation.y += d.spinY * deltaSeconds;
		box.rotation.z += d.spinZ * deltaSeconds;
	}

	// update labels: follow box world position and yaw toward orbit center
	for (const entry of textLabels) {
		const box = entry.box;
		const label = entry.mesh;
		// world position of box
		box.getWorldPosition(tempVecA);
		// place label below by offsetY
		label.position.set(tempVecA.x, tempVecA.y - entry.offsetY, tempVecA.z);
		// compute yaw-only rotation facing the orbit center (vortexGroup position)
		vortexGroup.getWorldPosition(tempVecB);
		tempVecB.sub(label.position); // direction from label to center
		const yaw = Math.atan2(tempVecB.x, tempVecB.z);
		label.rotation.set(0, yaw, 0);
	}

	renderer.render(scene, camera);
});

// Fallback: on first user interaction, start the video if blocked
window.addEventListener('pointerdown', () => {
	if (video.paused) {
		video.play().catch(() => {});
	}
}, { once: true });

