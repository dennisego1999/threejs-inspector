import { ref } from 'vue';
import { gsap } from 'gsap';
import { Lensflare, LensflareElement } from 'three/addons';
import {
	AmbientLight,
	BackSide,
	BoxGeometry,
	ClampToEdgeWrapping,
	Color,
	DirectionalLight,
	DoubleSide,
	EquirectangularReflectionMapping,
	LinearFilter,
	LinearMipMapLinearFilter,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	PointLight,
	ShaderMaterial,
	SphereGeometry,
	Uniform,
	Vector2,
	Vector3
} from 'three';
import ThreeManager from '@js/Classes/ThreeManager.js';
import oceanVertexShader from '@shaders/OceanSurface/Vertex.glsl';
import oceanFragmentShader from '@shaders/OceanSurface/Fragment.glsl';
import underwaterVertexShader from '@shaders/Underwater/Vertex.glsl';
import underwaterFragmentShader from '@shaders/Underwater/Fragment.glsl';

class Scene extends ThreeManager {
	constructor() {
		super();

		this.isReady = ref(false);
		this.progress = ref(0);
		this.fish = null;
		this.boat = null;
		this.oceanSurfaceMaterial = null;
		this.underwaterMaterial = null;
		this.textureFlareParticle = null;

		// Configuration for ocean, sky, and underwater visuals
		this.config = {
			surface: {
				surfaceColor: '#9bd8ff',
				depthColor: '#186691'
			},
			underwater: {
				surfaceColor: '#95c5e0',
				depthColor: '#186691'
			},
			fogColor: '#ffffff',
			foamColor: '#ffffff',
			dimensions: {
				surface: {
					height: 350,
					width: 500
				},
				underwater: {
					height: 40, // Depth of the ocean
					width: 350,
					depth: 200
				}
			},
			skyEXRPath: '/assets/images/sky/sky.exr'
		};
	}

	init(canvasId) {
		// Init three scene
		this.initThree(canvasId);

		// Setup scene
		this.setupScene();

		// Set render action
		this.setRenderAction(() => {
			if (this.oceanSurfaceMaterial) {
				// Update the uniforms
				this.oceanSurfaceMaterial.uniforms.uTime.value = this.clock.getElapsedTime();
			}

			// Update the boat's position and rotation
			if (this.boat) {
				const boatX = this.boat.position.x;
				const boatZ = this.boat.position.z;

				// Compute wave elevation for position
				this.boat.position.y = this.getWaveElevation(boatX, boatZ);

				// Compute wave gradient for rotation
				const gradient = this.getWaveGradient(boatX, boatZ);

				// Adjust boat rotation to simulate tilting
				this.boat.rotation.x = -gradient.z * 1.25;
				this.boat.rotation.z = gradient.x * 1.25;
			}

			// Set the audio muted states
			this.handleAudio();
		});

		// Start animation loop
		this.animate();
	}

	setupScene() {
		// Add lights
		this.addLighting();

		// Set up the scene
		this.addModels();
		this.addOcean();
		this.addSky();
	}

	addModels() {
		// Add fish
		this.gltfLoader.load('/assets/models/school_of_herring/scene.gltf', (gltf) => {
			// Assign
			this.fish = gltf.scene;

			// Add animation
			this.addAnimation(this.fish, gltf.animations[0]);

			// Update model
			this.fish.scale.set(2.5, 2.5, 2.5);
			this.fish.rotation.set(0, Math.PI, 0);
			this.fish.position.set(0, -3, 0);

			// Add to scene
			this.scene.add(this.fish);
		});

		// Add boat
		this.gltfLoader.load('/assets/models/sailboat/scene.gltf', (gltf) => {
			// Assign
			this.boat = gltf.scene;

			// Add animation
			this.addAnimation(this.boat, gltf.animations[0]);

			// Update model
			this.boat.scale.set(5, 5, 5);
			this.boat.rotation.set(0, Math.PI * 0.73, 0);
			this.boat.position.set(0, -0.35, 0);

			// Add to scene
			this.scene.add(this.boat);
		});
	}

	addOcean() {
		// Create ocean
		this.addOceanSurface();
		this.addUnderwaterBox();
	}

	addLighting() {
		// Add ambient light
		const light = new AmbientLight(0xffffff, 7);
		this.scene.add(light);

		// Load texture
		this.textureFlareParticle = this.textureLoader.load('/assets/images/lensflare/lensflare-particle.png');
		this.textureFlareParticle.minFilter = LinearMipMapLinearFilter;
		this.textureFlareParticle.magFilter = LinearFilter;
		this.textureFlareParticle.wrapS = ClampToEdgeWrapping;
		this.textureFlareParticle.wrapT = ClampToEdgeWrapping;

		// Add directional light
		const dirLight = new DirectionalLight(new Color('orange'), 10);
		dirLight.position.set(0, 1, -10);
		this.scene.add(dirLight);
	}

	addOceanSurface() {
		// Create a ShaderMaterial for the ocean surface
		this.oceanSurfaceMaterial = new ShaderMaterial({
			vertexShader: oceanVertexShader,
			fragmentShader: oceanFragmentShader,
			uniforms: {
				uTime: new Uniform(0),

				uBigWavesElevation: new Uniform(0.05),
				uBigWavesFrequency: new Uniform(new Vector2(0.8, 4.2)),
				uBigWavesSpeed: new Uniform(0.75),

				uSmallWavesElevation: new Uniform(0.15),
				uSmallWavesFrequency: new Uniform(3.0),
				uSmallWavesSpeed: new Uniform(0.2),
				uSmallIterations: new Uniform(4.0),

				uDepthColor: new Uniform(new Color(this.config.surface.depthColor)),
				uSurfaceColor: new Uniform(new Color(this.config.surface.surfaceColor)),
				uColorOffset: new Uniform(0.08),
				uColorMultiplier: new Uniform(2.1),

				uFogColor: new Uniform(new Color(this.config.fogColor)),
				uFogIntensity: new Uniform(0.5),

				uFoamColor: new Uniform(new Color(this.config.foamColor)),
				uFoamIntensity: new Uniform(1.0)
			},
			side: DoubleSide
		});

		if (import.meta.env.VITE_ENABLE_DEBUG === 'true') {
			// Add debug controls
			this.addDebugControls(() => {
				const surfaceFolder = this.gui.addFolder('Surface Settings');
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uBigWavesElevation, 'value')
					.min(0)
					.max(1)
					.step(0.001)
					.name('uBigWavesElevation');
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uBigWavesFrequency.value, 'x')
					.min(0)
					.max(10)
					.step(0.001)
					.name('uBigWavesFrequencyX');
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uBigWavesFrequency.value, 'y')
					.min(0)
					.max(10)
					.step(0.001)
					.name('uBigWavesFrequencyY');
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uBigWavesSpeed, 'value')
					.min(0)
					.max(4)
					.step(0.001)
					.name('uBigWavesSpeed');

				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uSmallWavesElevation, 'value')
					.min(0)
					.max(1)
					.step(0.001)
					.name('uSmallWavesElevation');
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uSmallWavesFrequency, 'value')
					.min(0)
					.max(30)
					.step(0.001)
					.name('uSmallWavesFrequency');
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uSmallWavesSpeed, 'value')
					.min(0)
					.max(4)
					.step(0.001)
					.name('uSmallWavesSpeed');
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uSmallIterations, 'value')
					.min(0)
					.max(5)
					.step(1)
					.name('uSmallIterations');

				surfaceFolder.addColor(this.config.surface, 'depthColor').onChange(() => {
					this.oceanSurfaceMaterial.uniforms.uDepthColor.value.set(this.config.surface.depthColor);
				});
				surfaceFolder.addColor(this.config.surface, 'surfaceColor').onChange(() => {
					this.oceanSurfaceMaterial.uniforms.uSurfaceColor.value.set(this.config.surface.surfaceColor);
				});
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uColorOffset, 'value')
					.min(0)
					.max(1)
					.step(0.001)
					.name('uColorOffset');
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uColorMultiplier, 'value')
					.min(0)
					.max(10)
					.step(0.001)
					.name('uColorMultiplier');
				surfaceFolder.addColor(this.config, 'fogColor').onChange(() => {
					this.oceanSurfaceMaterial.uniforms.uFogColor.value.set(this.config.fogColor);
				});
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uFogIntensity, 'value')
					.min(0)
					.max(10)
					.step(0.001)
					.name('uFogIntensity');
				surfaceFolder.addColor(this.config, 'foamColor').onChange(() => {
					this.oceanSurfaceMaterial.uniforms.uFoamColor.value.set(this.config.foamColor);
				});
				surfaceFolder
					.add(this.oceanSurfaceMaterial.uniforms.uFoamIntensity, 'value')
					.min(0)
					.max(1)
					.step(0.001)
					.name('uFoamIntensity');
			});
		}

		// Create ocean geometry
		const oceanSurfaceGeometry = new PlaneGeometry(
			this.config.dimensions.surface.width,
			this.config.dimensions.surface.height,
			1024,
			1024
		);

		// Create ocean surface mesh
		const oceanSurface = new Mesh(oceanSurfaceGeometry, this.oceanSurfaceMaterial);

		// Rotate to lay flat
		oceanSurface.rotation.x = -Math.PI / 2;

		// Add to scene
		this.scene.add(oceanSurface);
	}

	addUnderwaterBox() {
		// Create a ShaderMaterial for the underwater environment
		this.underwaterMaterial = new ShaderMaterial({
			vertexShader: underwaterVertexShader,
			fragmentShader: underwaterFragmentShader,
			uniforms: {
				uSurfaceColor: new Uniform(new Color(this.config.underwater.surfaceColor)),
				uDepthColor: new Uniform(new Color(this.config.underwater.depthColor)),
				uFogColor: new Uniform(new Color(this.config.fogColor)),
				uFogIntensity: new Uniform(0.5),
				uLightScattering: new Uniform(1.0)
			},
			side: DoubleSide,
			transparent: true
		});

		if (import.meta.env.VITE_ENABLE_DEBUG === 'true') {
			// Add structured debug controls
			this.addDebugControls(() => {
				const underwaterFolder = this.gui.addFolder('Underwater Settings');
				underwaterFolder.addColor(this.config.underwater, 'surfaceColor').onChange(() => {
					this.underwaterMaterial.uniforms.uSurfaceColor.value.set(this.config.underwater.surfaceColor);
				});
				underwaterFolder.addColor(this.config.underwater, 'depthColor').onChange(() => {
					this.underwaterMaterial.uniforms.uDepthColor.value.set(this.config.underwater.depthColor);
				});
				underwaterFolder.addColor(this.config, 'fogColor').onChange(() => {
					this.underwaterMaterial.uniforms.uFogColor.value.set(this.config.fogColor);
				});
				underwaterFolder
					.add(this.underwaterMaterial.uniforms.uFogIntensity, 'value')
					.min(0)
					.max(5)
					.step(0.001)
					.name('uFogIntensity');
				underwaterFolder
					.add(this.underwaterMaterial.uniforms.uLightScattering, 'value')
					.min(0)
					.max(10)
					.step(0.001)
					.name('uLightScattering');
			});
		}

		// Create a large box geometry to encompass the underwater area
		const underwaterBoxGeometry = new BoxGeometry(
			this.config.dimensions.underwater.width,
			this.config.dimensions.underwater.height,
			this.config.dimensions.underwater.depth
		);

		// Position underwater box
		underwaterBoxGeometry.translate(0, -this.config.dimensions.underwater.height / 2, 0);

		// Create a mesh with the underwater box geometry and material
		const underwaterBox = new Mesh(underwaterBoxGeometry, this.underwaterMaterial);

		// Add the underwater box to the scene
		this.scene.add(underwaterBox);
	}

	addSky() {
		// Load the EXR sky texture
		this.EXRLoader.load(this.config.skyEXRPath, (texture) => {
			// Set texture mapping
			texture.mapping = EquirectangularReflectionMapping;

			// Create a sphere geometry and apply the texture to it
			const geometry = new SphereGeometry(800, 100, 100);
			const material = new MeshBasicMaterial({
				map: texture,
				side: BackSide // Render the inside of the sphere
			});

			// Create mesh
			const skyMesh = new Mesh(geometry, material);

			// Rotate the mesh to adjust the sun's position
			skyMesh.rotation.y = Math.PI * 1.25;

			// Add the sky mesh to the scene
			this.scene.add(skyMesh);
		});
	}

	handleAudio() {
		const submergeAudio = document.getElementById('submerge-audio');
		const oceanAudio = document.getElementById('ocean-audio');
		const underwaterAudio = document.getElementById('underwater-bg-audio');

		if (this.camera.position.y <= 0) {
			if (submergeAudio.paused) {
				// Play submerge audio
				submergeAudio.pause();
				submergeAudio.muted = false;
				submergeAudio.currentTime = 0;
				submergeAudio.volume = 0.1;
				submergeAudio.play();
			}

			// Unmute underwater audio
			underwaterAudio.muted = false;

			// Mute ocean audio
			oceanAudio.muted = true;

			return;
		}

		// Mute submerge and reset
		submergeAudio.pause();
		submergeAudio.muted = true;
		submergeAudio.currentTime = 0;

		// Mute underwater audio
		underwaterAudio.muted = true;

		// Unmute ocean audio
		oceanAudio.muted = false;
	}

	getWaveElevation(x, z) {
		if (!this.oceanSurfaceMaterial) {
			return 0;
		}

		const uTime = this.oceanSurfaceMaterial.uniforms.uTime.value;

		// Big waves
		const bigWavesX = this.oceanSurfaceMaterial.uniforms.uBigWavesFrequency.value.x;
		const bigWavesZ = this.oceanSurfaceMaterial.uniforms.uBigWavesFrequency.value.y;
		const bigWavesElevation = this.oceanSurfaceMaterial.uniforms.uBigWavesElevation.value;
		const bigWavesSpeed = this.oceanSurfaceMaterial.uniforms.uBigWavesSpeed.value;

		const bigWaveHeight =
			Math.sin(bigWavesX * x + uTime * bigWavesSpeed) *
			Math.sin(bigWavesZ * z + uTime * bigWavesSpeed) *
			bigWavesElevation;

		// Small waves
		const smallWavesElevation = this.oceanSurfaceMaterial.uniforms.uSmallWavesElevation.value;
		const smallWavesFrequency = this.oceanSurfaceMaterial.uniforms.uSmallWavesFrequency.value;
		const smallWavesSpeed = this.oceanSurfaceMaterial.uniforms.uSmallWavesSpeed.value;
		const smallIterations = this.oceanSurfaceMaterial.uniforms.uSmallIterations.value;

		let smallWaveHeight = 0;
		for (let i = 0; i < smallIterations; i++) {
			smallWaveHeight +=
				(Math.cos(smallWavesFrequency * (x + z) + uTime * smallWavesSpeed) * smallWavesElevation) / smallIterations;
		}

		// Define offset
		const offset = 0.36;

		// Combine wave heights
		return bigWaveHeight + smallWaveHeight - offset;
	}

	getWaveGradient(x, z) {
		const delta = 0.1; // Small step for finite difference approximation

		// Compute the gradient in X and Z directions
		const elevationX = this.getWaveElevation(x + delta, z) - this.getWaveElevation(x - delta, z);
		const elevationZ = this.getWaveElevation(x, z + delta) - this.getWaveElevation(x, z - delta);

		return { x: elevationX, z: elevationZ };
	}

	dive(targetY) {
		// Dive to specific depth
		gsap.to(this.camera.position, {
			y: targetY,
			duration: 2,
			ease: 'power1.inOut',
			onUpdate: () => {
				// Update scene progress
				this.updateProgress();
			},
			onComplete: () => {
				// Set ready state
				this.isReady.value = true;
			}
		});
	}

	updateProgress() {
		if (this.camera.position.y >= 0) {
			return;
		}

		// Update scene's progress
		this.progress.value = (this.camera.position.y / -this.config.dimensions.underwater.height) * 100;
	}
}

export default new Scene();
