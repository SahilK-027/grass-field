int GRASS_SEGMENTS = int(uGrassParams.x);
int GRASS_VERTICES = (GRASS_SEGMENTS + 1) * 2;
float GRASS_PATCH_SIZE = uGrassParams.y;
float GRASS_WIDTH = uGrassParams.z;
float GRASS_HEIGHT = uGrassParams.w;

/* ===== Grass blade offset =====*/
vec2 hashedInstanceID = hash21(float(gl_InstanceID)) * 2.0 - 1.0;
vec3 grassOffset = vec3(hashedInstanceID.x, 0.0, hashedInstanceID.y) * GRASS_PATCH_SIZE;

/* ===== Randomized rotation to grass blades =====*/
vec3 grassBladeWorldPos = (modelMatrix * vec4(grassOffset, 1.0)).xyz;
vec3 hashVal = hash(grassBladeWorldPos);
float angle = remap(hashVal.x, -1.0, 1.0, -PI, PI);

/* ===== Figuring out Vertex IDs =====*/
int verFB_ID = gl_VertexID % (GRASS_VERTICES * 2);
int verID = verFB_ID % GRASS_VERTICES;

int xTest = verID & 1;
int zTest = (verFB_ID >= GRASS_VERTICES) ? 1 : -1;
float xSide = float(xTest);
float zSide = float(zTest);
float heighPercent = float(verID - xTest) / (float(GRASS_SEGMENTS) * 2.0);
float width = GRASS_WIDTH * easeOut(1.0 - heighPercent, 2.0);
float height = GRASS_HEIGHT;

/* ===== Compute the actual vertex position in blade-local space ===== */
float x = (xSide - 0.5) * width;
float y = heighPercent * height;
float z = 0.0;

/* ===== Bend the grass based on bezier curve =====*/
vec2 flowOffset = uWindDir * (uTime * uWindStrength);
float noiseSample = noise3d(
        vec3(
            grassBladeWorldPos.xz * 1.5 + flowOffset,
            uTime * 0.2
        )
    );
float windStrengthMultiplier = noiseSample * uWindStrength;
vec3 windAxis = normalize(vec3(uWindDir.x, 0.0, uWindDir.y));
float windLeanAngle = windStrengthMultiplier * 1.5 * heighPercent;

float randomLeanAnimation = noise3d(vec3(grassBladeWorldPos.xz * 10.0, uTime)) * windStrengthMultiplier;
float leanFactor = remap(hashVal.y, -1.0, 1.0, -0.25, 0.25) + randomLeanAnimation * 0.75 * windStrengthMultiplier;

vec3 p1 = vec3(0.0);
vec3 p2 = vec3(0.0, 0.33, 0.0);
vec3 p3 = vec3(0.0, 0.66, 0.0);
vec3 p4 = vec3(0.0, cos(leanFactor), sin(leanFactor));
vec3 curve = bezier(p1, p2, p3, p4, heighPercent);

y = curve . y * height;
z = curve . z * height;

/* ===== Generate grass matrix after randomized rotation along Y-Axis ===== */
mat3 grassMat = rotateAxis(windAxis, windLeanAngle) * rotateY(angle);
vec3 grassLocalPosition = grassMat * vec3(x, y, z) + grassOffset;

/* ===== Making grass blade appear thicker ===== */
vec3 grassViewDir = normalize(cameraPosition - grassBladeWorldPos);
vec3 grassFaceNormalVec = (grassMat * vec3(0.0, 0.0, -zSide));

float grassViewDotNormal = saturate(dot(grassFaceNormalVec, grassViewDir));
float thickenMultiplier = easeOut(1.0 - grassViewDotNormal, 4.0) * smoothstep(0.0, 0.2, grassViewDotNormal);

grassLocalPosition . x += thickenMultiplier * ( xSide - 0.5 ) * width * 0.5 * - zSide;

vec3 transformed = grassLocalPosition;

// Set up varyings
vGrassData = vec4(x, 0.0, 0.0, 0.0);
vHeightPercentage = heighPercent;
vMapUv = ( grassOffset . xz / GRASS_PATCH_SIZE ) + 0.5 ;
vUv = vec2(xSide, heighPercent);
vDebugColor = vec3(vMapUv, 0.0);
