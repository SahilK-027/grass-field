import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import "./style.css";
import vertex from "./shaders/grass/vertex.glsl";
import fragment from "./shaders/grass/fragment.glsl";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

class ShaderRenderer {
  static BLADES_NUM = 16000;
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
            0.2784313725490196,
            0.6431372549019608,
            0.0392156862745098
          ),
        },
        uBaseColorDarkBlade: {
          value: new THREE.Color(0.0, 0.47843137254901963, 0.29411764705882354),
        },
        uTipColorLightBlade: {
          value: new THREE.Color(0.6588235294117647, 0.9019607843137255, 0.0),
        },
        uBaseColorLightBlade: {
          value: new THREE.Color(0.40784313725490196, 0.7411764705882353, 0.0),
        },
        uGrassColorStep: {
          value: new THREE.Vector2(0.0, 1.0),
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
    // Update uniforms
    this.grassMaterial.uniforms.uTime.value = this.clock.getElapsedTime();

    this.controls.update();

    this.renderer.render(this.scene, this.camera);

    window.requestAnimationFrame(() => this.animate());
  }

  startAnimationLoop() {
    this.animate();
  }
}

new ShaderRenderer();
