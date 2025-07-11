import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import "./style.css";
import vertex from "./shaders/grass/vertex.glsl";
import fragment from "./shaders/grass/fragment.glsl";
import bezier from "./shaders/grass/helpers/bezier.glsl";
import hashFunctions from "./shaders/grass/helpers/hashFunctions.glsl";
import noise2d from "./shaders/grass/helpers/noise2d.glsl";
import noise3d from "./shaders/grass/helpers/noise3d.glsl";
import rotation from "./shaders/grass/helpers/rotation.glsl";
import utils from "./shaders/grass/helpers/utils.glsl";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import Stats from "stats-gl";

class ShaderRenderer {
  static BLADES_NUM = 32000;
  static SEGMENTS = 2;
  static PATCH_SIZE = 0.75;
  static BLADE_HEIGHT = 0.15;
  static BLADE_WIDTH = 0.01;

  constructor() {
    // GUI + scene setup
    this.gui = new GUI();
    this.gui.close();
    this.canvas = document.querySelector("canvas.webgl");
    this.scene = new THREE.Scene();
    this.sizes = { width: window.innerWidth, height: window.innerHeight };
    this.clock = new THREE.Clock();

    // Animation mixer placeholders
    this.mixer = null;
    this.actions = {};
    this.activeAction = null;
    this.sequence = ["Stand_Breathing_01", "Stand_Eating_01"];
    this.seqIndex = 0;

    // Preload toon gradient ramp once
    this.gradientMap = new THREE.TextureLoader().load(
      "/assets/textures/gradients/5.jpg",
      (tex) => {
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
      }
    );

    const grassDiffuse = new THREE.TextureLoader().load(
      "/assets/textures/grass_diffuse.webp"
    );

    grassDiffuse.wrapS = THREE.RepeatWrapping;
    grassDiffuse.wrapT = THREE.RepeatWrapping;
    grassDiffuse.generateMipmaps = true;

    const grassFieldNoiseTexture = new THREE.TextureLoader().load(
      "/assets/textures/grass_displacement_map_3.png"
    );

    grassFieldNoiseTexture.wrapS = THREE.RepeatWrapping;
    grassFieldNoiseTexture.wrapT = THREE.RepeatWrapping;
    grassFieldNoiseTexture.generateMipmaps = true;

    this.grassShaderUniforms = {
      uResolution: {
        value: new THREE.Vector2(this.sizes.width, this.sizes.height),
      },
      uTime: { value: 0.0 },
      uGrassParams: {
        value: new THREE.Vector4(
          ShaderRenderer.SEGMENTS,
          ShaderRenderer.PATCH_SIZE,
          ShaderRenderer.BLADE_WIDTH,
          ShaderRenderer.BLADE_HEIGHT
        ),
      },
      uWindStrength: { value: 0.3 },
      uWindDir: { value: new THREE.Vector2(1, 0) },
      uGrassColorStep: { value: new THREE.Vector2(0.0, 1.0) },
      uBaseColorDarkBlade: { value: new THREE.Color(0x016f22) },
      uTipColorDarkBlade: { value: new THREE.Color(0x70cc14) },
      uBaseColorLightBlade: { value: new THREE.Color(0x68ad00) },
      uTipColorLightBlade: { value: new THREE.Color(0xd4f400) },
      uGrassFieldNoiseTexture: { value: grassFieldNoiseTexture },
    };

    // Init everything
    this.initSceneObjects();
    this.initCamera();
    this.initRenderer();
    this.initControls();
    this.initLights();
    this.initGUI(); //!DEBUG
    this.initEventListeners();
    this.initPerformanceMonitoring();
    this.startAnimationLoop();
  }

  initSceneObjects() {
    this.addFloor();
    this.addGLTF();
    this.addGrass();
  }

  addFloor() {
    this.floorGeometry = new THREE.PlaneGeometry(5, 5);
    this.floorMaterial = new THREE.MeshStandardMaterial({ color: "#c7a85b" });
    this.floorMesh = new THREE.Mesh(this.floorGeometry, this.floorMaterial);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.receiveShadow = true;
    this.scene.add(this.floorMesh);
  }

  addGLTF() {
    new GLTFLoader().load("/assets/models/deer.glb", (gltf) => {
      const model = gltf.scene;
      model.scale.set(0.4, 0.4, 0.4);
      model.rotation.y = -Math.PI / 6;

      // Mixer and actions
      this.mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        this.actions[clip.name] = this.mixer.clipAction(clip);
      });

      // Sequence setup
      this._setupSequence(this.sequence);

      // Material and shadows
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = this._makeToonMaterial(child.material);
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // GUI for manual override
      this._createAnimationGUI();

      this.scene.add(model);
    });
  }

  _setupSequence(names) {
    this.seq = names;
    this.seqIndex = 0;

    this.mixer.addEventListener("finished", () => {
      // advance and wrap around
      this.seqIndex = (this.seqIndex + 1) % this.seq.length;
      this._playClip(this.seq[this.seqIndex]);
    });

    // kick things off
    this._playClip(this.seq[0]);
  }

  _playClip(name) {
    if (this.activeAction) this.activeAction.stop();
    const action = this.actions[name];
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    this.activeAction = action;
  }

  _createAnimationGUI() {
    const animFolder = this.gui.addFolder("Model Animations");
    animFolder
      .add(this, "activeClip", Object.keys(this.actions))
      .name("Active Clip")
      .onChange((name) => {
        if (this.activeAction) this.activeAction.stop();
        this.activeAction = this.actions[name];
        this.activeAction.reset().play();
      });

    animFolder
      .add({ play: () => this.activeAction?.play() }, "play")
      .name("▶ Play");
    animFolder
      .add({ pause: () => (this.activeAction.paused = true) }, "pause")
      .name("⏸ Pause");
  }

  _makeToonMaterial(oldMat) {
    return new THREE.MeshToonMaterial({
      color: oldMat.color,
      map: oldMat.map,
      lightMap: oldMat.lightMap,
      aoMap: oldMat.aoMap,
      emissiveMap: oldMat.emissiveMap,
      emissive: oldMat.emissive,
      normalMap: oldMat.normalMap,
      gradientMap: this.gradientMap,
      toneMapped: false,
    });
  }

  addGrass() {
    this.grassGeometry = this.createGrassGeometry();
    this.grassMaterial = this.createGrassMaterial();

    this.grassMesh = new THREE.Mesh(this.grassGeometry, this.grassMaterial);
    this.grassMesh.position.set(0, 0, 0);
    this.grassMesh.castShadow = true;
    this.grassMesh.receiveShadow = true;
    this.scene.add(this.grassMesh);
  }

  createGrassGeometry() {
    const { SEGMENTS, BLADES_NUM, PATCH_SIZE, BLADE_WIDTH, BLADE_HEIGHT } =
      this.constructor;

    const VERTICES = (SEGMENTS + 1) * 2;
    const INDICES = [];

    for (let i = 0; i < SEGMENTS; i++) {
      const vi = i * 2;
      // -- Front face indices (counter-clockwise winding) --
      // Lower-left, lower-right, upper-left
      INDICES[i * 12 + 0] = vi + 0;
      INDICES[i * 12 + 1] = vi + 1;
      INDICES[i * 12 + 2] = vi + 2;
      // Upper-left, lower-right, upper-right
      INDICES[i * 12 + 3] = vi + 2;
      INDICES[i * 12 + 4] = vi + 1;
      INDICES[i * 12 + 5] = vi + 3;

      // Back face indices (clockwise winding)
      const fi = VERTICES + vi;
      INDICES[i * 12 + 6] = fi + 2;
      INDICES[i * 12 + 7] = fi + 1;
      INDICES[i * 12 + 8] = fi + 0;
      INDICES[i * 12 + 9] = fi + 3;
      INDICES[i * 12 + 10] = fi + 1;
      INDICES[i * 12 + 11] = fi + 2;
    }

    const grassGeo = new THREE.InstancedBufferGeometry();
    grassGeo.instanceCount = BLADES_NUM;
    grassGeo.setIndex(INDICES);
    grassGeo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      1 + PATCH_SIZE * 2
    );

    return grassGeo;
  }

  createGrassMaterial() {
    const { SEGMENTS, BLADES_NUM, PATCH_SIZE, BLADE_WIDTH, BLADE_HEIGHT } =
      this.constructor;

    const grassMaterial = new THREE.MeshToonMaterial({
      gradientMap: this.gradientMap,
      toneMapped: false,
      side: THREE.FrontSide,
    });

    const helperFunctions = `
      ${bezier}
      ${hashFunctions}
      ${noise2d}
      ${noise3d}
      ${rotation}
      ${utils}
    `;

    grassMaterial.onBeforeCompile = (shaders) => {
      // Add uniforms to the material
      Object.assign(shaders.uniforms, this.grassShaderUniforms);

      const vertexPreamble = `
        uniform vec2 uResolution;
        uniform float uTime;
        uniform vec4 uGrassParams;
        uniform float uWindStrength;
        uniform vec2 uWindDir;

        varying vec4 vGrassData;
        varying float vHeightPercentage;
        varying vec2 vUv;
        varying vec2 vMapUv;
        varying vec3 vDebugColor;

        const float PI = 3.14159265359;

        ${helperFunctions}
      `;
      shaders.vertexShader = vertexPreamble + shaders.vertexShader;

      const fragmentPreamble = `
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uGrassColorStep;
        uniform vec3 uBaseColorDarkBlade;
        uniform vec3 uTipColorDarkBlade;
        uniform vec3 uBaseColorLightBlade;
        uniform vec3 uTipColorLightBlade;
        uniform vec4 uGrassParams;
        uniform sampler2D uGrassTextureDiffuse;
        uniform sampler2D uGrassFieldNoiseTexture;

        varying float vHeightPercentage;
        varying vec2 vUv;
        varying vec2 vMapUv;
        varying vec3 vDebugColor;
        varying vec4 vGrassData;

        ${helperFunctions}
      `;

      shaders.fragmentShader = fragmentPreamble + shaders.fragmentShader;

      // Replace the vertex transformation
      shaders.vertexShader = shaders.vertexShader.replace(
        "#include <begin_vertex>",
        ` ${vertex}`
      );

      shaders.fragmentShader = shaders.fragmentShader.replace(
        "#include <map_fragment>",
        `${fragment}`
      );
    };

    return grassMaterial;
  }

  initCamera() {
    // Base camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.sizes.width / this.sizes.height,
      0.1,
      1000
    );
    this.camera.position.set(1.0, 0.75, 1.0);
    this.scene.add(this.camera);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; // enable shadows
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
  }

  initLights() {
    // Ambient light for general illumination
    this.hemiLight = new THREE.HemisphereLight("#e5f6ff", "#e2ffb3", 0.7);
    this.scene.add(this.hemiLight);

    // Directional light to cast shadows
    this.directionalLight = new THREE.DirectionalLight(0xfafffd, 5.0);
    this.directionalLight.position.set(1.75, 1, -1.0);
    this.directionalLight.castShadow = true;
    this.drHelper = new THREE.DirectionalLightHelper(this.directionalLight);
    // this.scene.add(this.drHelper);

    // Configure shadow map size and camera for better quality
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.bias = -0.002;

    this.scene.add(this.directionalLight);

    new RGBELoader().load("/assets/environments/clouds.hdr", (hdri) => {
      hdri.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.background = hdri;
      this.scene.environment = hdri;
      this.scene.environmentIntensity = 0.25;
    });
  }

  // Add this method to your ShaderRenderer class, call it after initSceneObjects()
  initGUI() {
    // Grass Geometry Parameters
    const grassGeometryFolder = this.gui.addFolder("Grass Geometry");

    // Store original values for recreation
    this.grassParams = {
      bladesNum: ShaderRenderer.BLADES_NUM,
      segments: ShaderRenderer.SEGMENTS,
      patchSize: ShaderRenderer.PATCH_SIZE,
      bladeHeight: ShaderRenderer.BLADE_HEIGHT,
      bladeWidth: ShaderRenderer.BLADE_WIDTH,
    };

    grassGeometryFolder
      .add(this.grassParams, "bladesNum", 512, 1024 * 1024, 512)
      .name("Blade Count")
      .onChange(() => this.recreateGrass());

    grassGeometryFolder
      .add(this.grassParams, "segments", 2, 10, 1)
      .name("Segments")
      .onChange(() => this.recreateGrass());

    grassGeometryFolder
      .add(this.grassParams, "patchSize", 0.1, 10.0, 0.05)
      .name("Patch Size")
      .onChange(() => {
        this.grassShaderUniforms.uGrassParams.value.y =
          this.grassParams.patchSize;
      });

    grassGeometryFolder
      .add(this.grassParams, "bladeHeight", 0.05, 1.0, 0.01)
      .name("Blade Height")
      .onChange(() => {
        this.grassShaderUniforms.uGrassParams.value.w =
          this.grassParams.bladeHeight;
      });

    grassGeometryFolder
      .add(this.grassParams, "bladeWidth", 0.005, 0.05, 0.001)
      .name("Blade Width")
      .onChange(() => {
        this.grassShaderUniforms.uGrassParams.value.z =
          this.grassParams.bladeWidth;
      });

    // Wind Parameters
    const windFolder = this.gui.addFolder("Wind");
    this.windParams = {
      strength: this.grassShaderUniforms.uWindStrength.value,
      directionX: this.grassShaderUniforms.uWindDir.value.x,
      directionZ: this.grassShaderUniforms.uWindDir.value.y,
    };

    windFolder
      .add(this.windParams, "strength", 0.0, 2.0, 0.01)
      .name("Wind Strength")
      .onChange((value) => {
        this.grassShaderUniforms.uWindStrength.value = value;
      });

    windFolder
      .add(this.windParams, "directionX", -1.0, 1.0, 0.01)
      .name("Wind Dir X")
      .onChange(() => {
        this.grassShaderUniforms.uWindDir.value.set(
          this.windParams.directionX,
          this.windParams.directionZ
        );
      });

    windFolder
      .add(this.windParams, "directionZ", -1.0, 1.0, 0.01)
      .name("Wind Dir Z")
      .onChange(() => {
        this.grassShaderUniforms.uWindDir.value.set(
          this.windParams.directionX,
          this.windParams.directionZ
        );
      });

    // Grass Colors
    const colorsFolder = this.gui.addFolder("Grass Colors");

    // Dark Blade Colors
    const darkBladeFolder = colorsFolder.addFolder("Dark Blades");

    this.colorParams = {
      tipColorDark:
        "#" + this.grassShaderUniforms.uTipColorDarkBlade.value.getHexString(),
      baseColorDark:
        "#" + this.grassShaderUniforms.uBaseColorDarkBlade.value.getHexString(),
      tipColorLight:
        "#" + this.grassShaderUniforms.uTipColorLightBlade.value.getHexString(),
      baseColorLight:
        "#" +
        this.grassShaderUniforms.uBaseColorLightBlade.value.getHexString(),
    };

    darkBladeFolder
      .addColor(this.colorParams, "tipColorDark")
      .name("Tip Color")
      .onChange((value) => {
        this.grassShaderUniforms.uTipColorDarkBlade.value.setHex(
          value.replace("#", "0x")
        );
      });

    darkBladeFolder
      .addColor(this.colorParams, "baseColorDark")
      .name("Base Color")
      .onChange((value) => {
        this.grassShaderUniforms.uBaseColorDarkBlade.value.setHex(
          value.replace("#", "0x")
        );
      });

    // Light Blade Colors
    const lightBladeFolder = colorsFolder.addFolder("Light Blades");

    lightBladeFolder
      .addColor(this.colorParams, "tipColorLight")
      .name("Tip Color")
      .onChange((value) => {
        this.grassShaderUniforms.uTipColorLightBlade.value.setHex(
          value.replace("#", "0x")
        );
      });

    lightBladeFolder
      .addColor(this.colorParams, "baseColorLight")
      .name("Base Color")
      .onChange((value) => {
        this.grassShaderUniforms.uBaseColorLightBlade.value.setHex(
          value.replace("#", "0x")
        );
      });

    // Color Mixing
    this.colorMixParams = {
      colorStepMin: this.grassShaderUniforms.uGrassColorStep.value.x,
      colorStepMax: this.grassShaderUniforms.uGrassColorStep.value.y,
    };

    colorsFolder
      .add(this.colorMixParams, "colorStepMin", 0.0, 1.0, 0.01)
      .name("Color Step Min")
      .onChange(() => {
        this.grassShaderUniforms.uGrassColorStep.value.set(
          this.colorMixParams.colorStepMin,
          this.colorMixParams.colorStepMax
        );
      });

    colorsFolder
      .add(this.colorMixParams, "colorStepMax", 0.0, 1.0, 0.01)
      .name("Color Step Max")
      .onChange(() => {
        this.grassShaderUniforms.uGrassColorStep.value.set(
          this.colorMixParams.colorStepMin,
          this.colorMixParams.colorStepMax
        );
      });

    // Lighting
    const lightingFolder = this.gui.addFolder("Lighting");

    // Hemisphere Light
    this.lightParams = {
      hemiSkyColor: "#" + this.hemiLight.color.getHexString(),
      hemiGroundColor: "#" + this.hemiLight.groundColor.getHexString(),
      hemiIntensity: this.hemiLight.intensity,
    };
    const hemiFolder = lightingFolder.addFolder("Hemisphere Light");
    hemiFolder
      .addColor(this.lightParams, "hemiSkyColor")
      .name("Sky Color")
      .onChange((v) => this.hemiLight.color.set(v));
    hemiFolder
      .addColor(this.lightParams, "hemiGroundColor")
      .name("Ground Color")
      .onChange((v) => this.hemiLight.groundColor.set(v));
    hemiFolder
      .add(this.lightParams, "hemiIntensity", 0, 2, 0.01)
      .name("Intensity")
      .onChange((v) => (this.hemiLight.intensity = v));

    // Directional Light
    Object.assign(this.lightParams, {
      dirColor: "#" + this.directionalLight.color.getHexString(),
      dirIntensity: this.directionalLight.intensity,
      dirX: this.directionalLight.position.x,
      dirY: this.directionalLight.position.y,
      dirZ: this.directionalLight.position.z,
      dirCastShadow: this.directionalLight.castShadow,
    });
    const dirFolder = lightingFolder.addFolder("Directional Light");
    dirFolder
      .addColor(this.lightParams, "dirColor")
      .name("Color")
      .onChange((v) => this.directionalLight.color.set(v));
    dirFolder
      .add(this.lightParams, "dirIntensity", 0, 2, 0.01)
      .name("Intensity")
      .onChange((v) => (this.directionalLight.intensity = v));
    dirFolder
      .add(this.lightParams, "dirX", -10, 10, 0.1)
      .name("Position X")
      .onChange((v) => (this.directionalLight.position.x = v));
    dirFolder
      .add(this.lightParams, "dirY", -10, 10, 0.1)
      .name("Position Y")
      .onChange((v) => (this.directionalLight.position.y = v));
    dirFolder
      .add(this.lightParams, "dirZ", -10, 10, 0.1)
      .name("Position Z")
      .onChange((v) => (this.directionalLight.position.z = v));
    dirFolder
      .add(this.lightParams, "dirCastShadow")
      .name("Cast Shadow")
      .onChange((v) => (this.directionalLight.castShadow = v));

    // Show/hide helper
    dirFolder
      .add({ showHelper: true }, "showHelper")
      .name("Helper Visible")
      .onChange((v) => (this.drHelper.visible = v));

    // Floor
    const floorFolder = this.gui.addFolder("Floor");

    this.floorParams = {
      color: "#" + this.floorMaterial.color.getHexString(),
      visible: this.floorMesh.visible,
    };

    floorFolder
      .addColor(this.floorParams, "color")
      .name("Floor Color")
      .onChange((value) => {
        this.floorMaterial.color.setHex(value.replace("#", "0x"));
      });

    floorFolder
      .add(this.floorParams, "visible")
      .name("Show Floor")
      .onChange((value) => {
        this.floorMesh.visible = value;
      });

    // Camera Controls
    const cameraFolder = this.gui.addFolder("Camera");

    this.cameraParams = {
      fov: this.camera.fov,
      resetPosition: () => {
        this.camera.position.set(1.0, 0.75, 1.0);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      },
    };

    cameraFolder
      .add(this.cameraParams, "fov", 30, 120, 1)
      .name("Field of View")
      .onChange((value) => {
        this.camera.fov = value;
        this.camera.updateProjectionMatrix();
      });

    cameraFolder.add(this.cameraParams, "resetPosition").name("Reset Position");

    // Performance
    const performanceFolder = this.gui.addFolder("Performance");

    this.performanceParams = {
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      showStats: false,
    };

    performanceFolder
      .add(this.performanceParams, "pixelRatio", 0.5, 3.0, 0.1)
      .name("Pixel Ratio")
      .onChange((value) => {
        this.renderer.setPixelRatio(value);
      });

    // Animation Controls
    const animationFolder = this.gui.addFolder("Animation");

    this.animationParams = {
      timeScale: 1.0,
      pauseTime: false,
      resetTime: () => {
        this.clock = new THREE.Clock();
      },
    };

    animationFolder
      .add(this.animationParams, "timeScale", 0.0, 3.0, 0.1)
      .name("Time Scale");

    animationFolder.add(this.animationParams, "pauseTime").name("Pause Time");
  }

  // Helper method to recreate grass geometry when parameters change
  recreateGrass() {
    // Remove old grass
    this.scene.remove(this.grassMesh);
    this.grassGeometry.dispose();

    // Update static values temporarily
    const originalValues = {
      BLADES_NUM: ShaderRenderer.BLADES_NUM,
      SEGMENTS: ShaderRenderer.SEGMENTS,
      PATCH_SIZE: ShaderRenderer.PATCH_SIZE,
      BLADE_HEIGHT: ShaderRenderer.BLADE_HEIGHT,
      BLADE_WIDTH: ShaderRenderer.BLADE_WIDTH,
    };

    ShaderRenderer.BLADES_NUM = this.grassParams.bladesNum;
    ShaderRenderer.SEGMENTS = this.grassParams.segments;
    ShaderRenderer.PATCH_SIZE = this.grassParams.patchSize;
    ShaderRenderer.BLADE_HEIGHT = this.grassParams.bladeHeight;
    ShaderRenderer.BLADE_WIDTH = this.grassParams.bladeWidth;

    // Create new grass
    this.grassGeometry = this.createGrassGeometry();
    this.grassMesh = new THREE.Mesh(this.grassGeometry, this.grassMaterial);
    this.grassMesh.position.set(0, 0, 0);
    this.scene.add(this.grassMesh);

    // Update material uniforms
    this.grassShaderUniforms.uGrassParams.value.set(
      this.grassParams.segments,
      this.grassParams.patchSize,
      this.grassParams.bladeWidth,
      this.grassParams.bladeHeight
    );

    // Restore original static values
    Object.assign(ShaderRenderer, originalValues);
  }

  initEventListeners() {
    window.addEventListener("resize", () => this.handleResize());
  }

  handleResize() {
    // Update sizes
    this.sizes.width = window.innerWidth;
    this.sizes.height = window.innerHeight;

    // Update camera
    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    // Update renderer
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.grassShaderUniforms.uResolution.value.set(
      this.sizes.width,
      this.sizes.height
    );
  }

  animate() {
    this.stats.begin();

    // Handle time controls
    let deltaTime = this.clock.getDelta();
    this.grassShaderUniforms.uTime.value += deltaTime;

    if (this.mixer)
      this.mixer.update(deltaTime * (this.animationParams?.timeScale || 1));

    this.controls.update();

    this.renderer.render(this.scene, this.camera);

    window.requestAnimationFrame(() => this.animate());

    this.stats.end();
    this.stats.update();
  }

  initPerformanceMonitoring() {
    this.stats = new Stats({
      trackGPU: true,
      trackHz: true,
      trackCPT: true,
      logsPerSecond: 4,
      graphsPerSecond: 30,
      samplesLog: 40,
      samplesGraph: 10,
      precision: 2,
      horizontal: false,
      minimal: false,
      mode: 0,
    });

    this.stats.init(this.renderer.domElement);
    document.body.appendChild(this.stats.dom);
  }

  startAnimationLoop() {
    this.animate();
  }
}

new ShaderRenderer();
