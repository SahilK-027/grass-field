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

#include ./helpers/utils;
#include ./helpers/hashFunctions;
#include ./helpers/noise3d;
#include ./helpers/noise2d;

void main() {
    float grassX = vGrassData.x;
    float grassY = vGrassData.y;

    // float noiseSample = noise2d(vMapUv, 1.25);
    // noiseSample = remap(noiseSample, -1.0, 1.0, -0.5, 1.0);

    float noiseSample = texture2D(uGrassFieldNoiseTexture, vMapUv).r;
    noiseSample = remap(noiseSample, -1.0, 1.0, -0.25, 1.0);

    // Texture mask
    float maskRaw = noiseSample;
    float mask = smoothstep(uGrassColorStep.x, uGrassColorStep.y, maskRaw);
    vec3 c1 = mix(uBaseColorDarkBlade, uTipColorDarkBlade, vHeightPercentage);
    vec3 c2 = mix(uBaseColorLightBlade, uTipColorLightBlade, vHeightPercentage);
    vec3 grassMixColor = mix(c1, c2, mask);

    vec3 baseColor = mix(grassMixColor, grassMixColor, smoothstep(0.009, 0.0009, abs(grassX)));

    // Shadow drop
    float ao = remap(pow(vHeightPercentage, 1.0), 0.0, 1.0, 0.8, 1.0);

    vec3 finalColor = vec3(baseColor);
    gl_FragColor = vec4(finalColor, 1.0) * ao;

    // Using texture as color for across field map
    // vec4 grassTexture = texture2D(uGrassTextureDiffuse, vMapUv);

    // Using texture as color
    // vec4 grassTexture = texture2D(uGrassTexture, vUv) * mask;
    // // Alpha test
    // if (grassTexture.w < 0.5) { discard; }
    // gl_FragColor = grassTexture;

    // gl_FragColor = vec4(vec3(maskRaw), 1.0); // ! DEBUG
    // gl_FragColor = vec4(vDebugColor, 1.0); // ! DEBUG
}
