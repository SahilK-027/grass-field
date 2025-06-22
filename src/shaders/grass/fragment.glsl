float grassX = vGrassData.x;

float noiseSample = texture2D(uGrassFieldNoiseTexture, vMapUv).r;
noiseSample = remap(noiseSample, 0.0, 1.0, -0.25, 1.0);

// Texture mask
float maskRaw = noiseSample;
float mask = smoothstep(uGrassColorStep.x, uGrassColorStep.y, maskRaw);
vec3 c1 = mix(uBaseColorDarkBlade, uTipColorDarkBlade, vHeightPercentage);
vec3 c2 = mix(uBaseColorLightBlade, uTipColorLightBlade, vHeightPercentage);
vec3 grassMixColor = mix(c1, c2, mask);

vec3 baseColor = mix(grassMixColor, grassMixColor, smoothstep(0.009, 0.0009, abs(grassX)));

// Shadow drop
float ao = remap(pow(vHeightPercentage, 1.0), 0.0, 1.0, 0.8, 1.0);

diffuseColor.rgb = baseColor;
diffuseColor.a = 1.0;
// diffuseColor . rgb = vec3(vDebugColor); // ! DEBUG
