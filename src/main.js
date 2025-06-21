import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import "./style.css";
import vertex from "./shaders/grass/vertex.glsl";
import fragment from "./shaders/grass/fragment.glsl";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

class ShaderRenderer {
  static BLADES_NUM = 2048 * 8;
  static SEGMENTS = 4;
  static PATCH_SIZE = 0.5; // Note: 0.5 patch size will corresponds 1 square unit on grid
  static BLADE_HEIGHT = 0.2;
  static BLADE_WIDTH = 0.01;

  constructor() {
    this.gui = new GUI();
    this.canvas = document.querySelector("canvas.webgl");
    this.scene = new THREE.Scene();
    this.sizes = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    this.clock = new THREE.Clock();

    this.initSceneObjects();
    this.initCamera();
    this.initRenderer();
    this.initControls();
    this.initLights();
    this.initGUI();
    this.initEventListeners();
    this.startAnimationLoop();
  }

  initSceneObjects() {
    this.addFloor();
    this.addGrass();
  }

  addFloor() {
    this.floorGeometry = new THREE.PlaneGeometry(5, 5, 1, 1);
    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: "#121316",
    });

    this.floorMesh = new THREE.Mesh(this.floorGeometry, this.floorMaterial);
    this.floorMesh.rotation.x = (-1.0 * Math.PI) / 2;
    this.scene.add(this.floorMesh);
  }

  addGrass() {
    this.grassGeometry = this.createGrassGeometry();
    this.grassMaterial = this.createGrassMaterial();

    this.grassMesh = new THREE.Mesh(this.grassGeometry, this.grassMaterial);
    this.grassMesh.position.set(0, 0, 0);
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

      // -- Back face indices (clockwise winding) duplicates same vertices but flips winding
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

    const grassDiffuse = new THREE.TextureLoader().load(
      "/assets/textures/grass_diffuse.webp"
    );

    grassDiffuse.wrapS = THREE.RepeatWrapping;
    grassDiffuse.wrapT = THREE.RepeatWrapping;
    grassDiffuse.generateMipmaps = true;

    const grassMaterial = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0.0 },
        uResolution: { value: new THREE.Vector2() },
        uWindStrength: { value: 0.3 },
        uWindDir: { value: new THREE.Vector2(1, 0) },
        uGrassParams: {
          value: new THREE.Vector4(
            SEGMENTS,
            PATCH_SIZE,
            BLADE_WIDTH,
            BLADE_HEIGHT
          ),
        },
        uTipColorDarkBlade: {
          value: new THREE.Color(
            0x08ba5e
          ),
        },
        uBaseColorDarkBlade: {
          value: new THREE.Color(0x00a331),
        },
        uTipColorLightBlade: {
          value: new THREE.Color(0xd4f400),
        },
        uBaseColorLightBlade: {
          value: new THREE.Color(0x7acc00),
        },
        uGrassColorStep: {
          value: new THREE.Vector2(0.0, 1.0),
        },
        uGrassTextureDiffuse: {
          value: grassDiffuse,
        },
      },
    });

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
  }

  initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
  }

  initLights() {
    this.ambientLight = new THREE.AmbientLight(0xcecece, 10);
    this.scene.add(this.ambientLight);

    new RGBELoader().load("/assets/environments/clouds.hdr", (hdri) => {
      hdri.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.background = hdri;
      this.scene.environment = hdri;
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
      .add(this.grassParams, "bladesNum", 512, 32768, 512)
      .name("Blade Count")
      .onChange(() => this.recreateGrass());

    grassGeometryFolder
      .add(this.grassParams, "segments", 2, 10, 1)
      .name("Segments")
      .onChange(() => this.recreateGrass());

    grassGeometryFolder
      .add(this.grassParams, "patchSize", 0.1, 2.0, 0.05)
      .name("Patch Size")
      .onChange(() => {
        this.grassMaterial.uniforms.uGrassParams.value.y =
          this.grassParams.patchSize;
      });

    grassGeometryFolder
      .add(this.grassParams, "bladeHeight", 0.05, 1.0, 0.01)
      .name("Blade Height")
      .onChange(() => {
        this.grassMaterial.uniforms.uGrassParams.value.w =
          this.grassParams.bladeHeight;
      });

    grassGeometryFolder
      .add(this.grassParams, "bladeWidth", 0.005, 0.05, 0.001)
      .name("Blade Width")
      .onChange(() => {
        this.grassMaterial.uniforms.uGrassParams.value.z =
          this.grassParams.bladeWidth;
      });

    // Wind Parameters
    const windFolder = this.gui.addFolder("Wind");

    this.windParams = {
      strength: this.grassMaterial.uniforms.uWindStrength.value,
      directionX: this.grassMaterial.uniforms.uWindDir.value.x,
      directionZ: this.grassMaterial.uniforms.uWindDir.value.y,
    };

    windFolder
      .add(this.windParams, "strength", 0.0, 2.0, 0.01)
      .name("Wind Strength")
      .onChange((value) => {
        this.grassMaterial.uniforms.uWindStrength.value = value;
      });

    windFolder
      .add(this.windParams, "directionX", -1.0, 1.0, 0.01)
      .name("Wind Dir X")
      .onChange(() => {
        this.grassMaterial.uniforms.uWindDir.value.set(
          this.windParams.directionX,
          this.windParams.directionZ
        );
      });

    windFolder
      .add(this.windParams, "directionZ", -1.0, 1.0, 0.01)
      .name("Wind Dir Z")
      .onChange(() => {
        this.grassMaterial.uniforms.uWindDir.value.set(
          this.windParams.directionX,
          this.windParams.directionZ
        );
      });

    windFolder.close();

    // Grass Colors
    const colorsFolder = this.gui.addFolder("Grass Colors");

    // Dark Blade Colors
    const darkBladeFolder = colorsFolder.addFolder("Dark Blades");

    this.colorParams = {
      tipColorDark:
        "#" +
        this.grassMaterial.uniforms.uTipColorDarkBlade.value.getHexString(),
      baseColorDark:
        "#" +
        this.grassMaterial.uniforms.uBaseColorDarkBlade.value.getHexString(),
      tipColorLight:
        "#" +
        this.grassMaterial.uniforms.uTipColorLightBlade.value.getHexString(),
      baseColorLight:
        "#" +
        this.grassMaterial.uniforms.uBaseColorLightBlade.value.getHexString(),
    };

    darkBladeFolder
      .addColor(this.colorParams, "tipColorDark")
      .name("Tip Color")
      .onChange((value) => {
        this.grassMaterial.uniforms.uTipColorDarkBlade.value.setHex(
          value.replace("#", "0x")
        );
      });

    darkBladeFolder
      .addColor(this.colorParams, "baseColorDark")
      .name("Base Color")
      .onChange((value) => {
        this.grassMaterial.uniforms.uBaseColorDarkBlade.value.setHex(
          value.replace("#", "0x")
        );
      });

    // Light Blade Colors
    const lightBladeFolder = colorsFolder.addFolder("Light Blades");

    lightBladeFolder
      .addColor(this.colorParams, "tipColorLight")
      .name("Tip Color")
      .onChange((value) => {
        this.grassMaterial.uniforms.uTipColorLightBlade.value.setHex(
          value.replace("#", "0x")
        );
      });

    lightBladeFolder
      .addColor(this.colorParams, "baseColorLight")
      .name("Base Color")
      .onChange((value) => {
        this.grassMaterial.uniforms.uBaseColorLightBlade.value.setHex(
          value.replace("#", "0x")
        );
      });

    // Color Mixing
    this.colorMixParams = {
      colorStepMin: this.grassMaterial.uniforms.uGrassColorStep.value.x,
      colorStepMax: this.grassMaterial.uniforms.uGrassColorStep.value.y,
    };

    colorsFolder
      .add(this.colorMixParams, "colorStepMin", 0.0, 1.0, 0.01)
      .name("Color Step Min")
      .onChange(() => {
        this.grassMaterial.uniforms.uGrassColorStep.value.set(
          this.colorMixParams.colorStepMin,
          this.colorMixParams.colorStepMax
        );
      });

    colorsFolder
      .add(this.colorMixParams, "colorStepMax", 0.0, 1.0, 0.01)
      .name("Color Step Max")
      .onChange(() => {
        this.grassMaterial.uniforms.uGrassColorStep.value.set(
          this.colorMixParams.colorStepMin,
          this.colorMixParams.colorStepMax
        );
      });

    // Lighting
    const lightingFolder = this.gui.addFolder("Lighting");

    this.lightingParams = {
      ambientIntensity: this.ambientLight.intensity,
      ambientColor: "#" + this.ambientLight.color.getHexString(),
    };

    lightingFolder
      .add(this.lightingParams, "ambientIntensity", 0.0, 20.0, 0.1)
      .name("Ambient Intensity")
      .onChange((value) => {
        this.ambientLight.intensity = value;
      });

    lightingFolder
      .addColor(this.lightingParams, "ambientColor")
      .name("Ambient Color")
      .onChange((value) => {
        this.ambientLight.color.setHex(value.replace("#", "0x"));
      });

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

    animationFolder.add(this.animationParams, "resetTime").name("Reset Time");

    // Presets
    const presetsFolder = this.gui.addFolder("Presets");

    this.presetParams = {
      savePreset: () => {
        const preset = {
          grassParams: { ...this.grassParams },
          windParams: { ...this.windParams },
          colorParams: { ...this.colorParams },
          colorMixParams: { ...this.colorMixParams },
        };
        console.log("Grass Preset:", JSON.stringify(preset, null, 2));
      },
      lushGrass: () => this.applyLushGrassPreset(),
      driedGrass: () => this.applyDriedGrassPreset(),
      windyField: () => this.applyWindyFieldPreset(),
    };

    presetsFolder.add(this.presetParams, "savePreset").name("Save Current");
    presetsFolder.add(this.presetParams, "lushGrass").name("Lush Grass");
    presetsFolder.add(this.presetParams, "driedGrass").name("Dried Grass");
    presetsFolder.add(this.presetParams, "windyField").name("Windy Field");

    // Initially close some folders
    grassGeometryFolder.close();
    colorsFolder.close();
    lightingFolder.close();
    floorFolder.close();
    cameraFolder.close();
    performanceFolder.close();
    animationFolder.close();
    presetsFolder.close();
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
    this.grassMaterial.uniforms.uGrassParams.value.set(
      this.grassParams.segments,
      this.grassParams.patchSize,
      this.grassParams.bladeWidth,
      this.grassParams.bladeHeight
    );

    // Restore original static values
    Object.assign(ShaderRenderer, originalValues);
  }

  // Preset methods
  applyLushGrassPreset() {
    // Lush green grass
    this.colorParams.tipColorLight = "#a8e600";
    this.colorParams.baseColorLight = "#68bd00";
    this.colorParams.tipColorDark = "#478a10";
    this.colorParams.baseColorDark = "#007a4b";

    this.windParams.strength = 0.1;
    this.grassParams.bladeHeight = 0.25;

    this.updateFromPreset();
  }

  applyDriedGrassPreset() {
    // Dried yellowish grass
    this.colorParams.tipColorLight = "#d4a574";
    this.colorParams.baseColorLight = "#8b6914";
    this.colorParams.tipColorDark = "#6b4423";
    this.colorParams.baseColorDark = "#4a2c14";

    this.windParams.strength = 0.4;
    this.grassParams.bladeHeight = 0.15;

    this.updateFromPreset();
  }

  applyWindyFieldPreset() {
    // Strong wind effect
    this.windParams.strength = 1.2;
    this.windParams.directionX = 0.8;
    this.windParams.directionZ = 0.6;

    this.grassParams.bladesNum = 16384;
    this.grassParams.bladeHeight = 0.3;

    this.updateFromPreset();
  }

  updateFromPreset() {
    // Update all uniforms and GUI
    this.grassMaterial.uniforms.uTipColorLightBlade.value.setHex(
      this.colorParams.tipColorLight.replace("#", "0x")
    );
    this.grassMaterial.uniforms.uBaseColorLightBlade.value.setHex(
      this.colorParams.baseColorLight.replace("#", "0x")
    );
    this.grassMaterial.uniforms.uTipColorDarkBlade.value.setHex(
      this.colorParams.tipColorDark.replace("#", "0x")
    );
    this.grassMaterial.uniforms.uBaseColorDarkBlade.value.setHex(
      this.colorParams.baseColorDark.replace("#", "0x")
    );

    this.grassMaterial.uniforms.uWindStrength.value = this.windParams.strength;
    this.grassMaterial.uniforms.uWindDir.value.set(
      this.windParams.directionX,
      this.windParams.directionZ
    );

    this.grassMaterial.uniforms.uGrassParams.value.w =
      this.grassParams.bladeHeight;

    // Refresh GUI
    this.gui.updateDisplay();

    // Recreate grass if needed
    this.recreateGrass();
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

    this.grassMaterial.uniforms.uResolution.value.set(
      this.sizes.width,
      this.sizes.height
    );
  }

  animate() {
    // Handle time controls
    let deltaTime = this.clock.getDelta();
    if (!this.animationParams.pauseTime) {
      this.grassMaterial.uniforms.uTime.value +=
        deltaTime * this.animationParams.timeScale;
    }

    this.controls.update();

    this.renderer.render(this.scene, this.camera);

    window.requestAnimationFrame(() => this.animate());
  }

  startAnimationLoop() {
    this.animate();
  }
}

new ShaderRenderer();
