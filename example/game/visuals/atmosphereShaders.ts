export const SKY_VERTEX_SHADER = /* glsl */`
varying vec3 vWorldDirection;

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

export const SKY_FRAGMENT_SHADER = /* glsl */`
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uFogColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform float uTime;
uniform float uStarStrength;
uniform float uAuroraStrength;
uniform float uCosmosStrength;
uniform float uHazeThickness;
uniform float uSkyFlash;

varying vec3 vWorldDirection;

float hash12(vec2 value) {
    vec3 p = fract(vec3(value.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
        mix(hash12(cell), hash12(cell + vec2(1.0, 0.0)), local.x),
        mix(hash12(cell + vec2(0.0, 1.0)), hash12(cell + vec2(1.0)), local.x),
        local.y
    );
}

float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
    for (int octave = 0; octave < 4; octave += 1) {
        value += amplitude * noise(point);
        point = rotation * point * 2.03 + 17.1;
        amplitude *= 0.5;
    }
    return value;
}

float starField(vec2 skyUv) {
    vec2 cells = skyUv * vec2(900.0, 450.0);
    vec2 cell = floor(cells);
    vec2 local = fract(cells);
    float seed = hash12(cell);
    vec2 starPosition = vec2(hash12(cell + 7.2), hash12(cell + 19.7));
    float distanceToStar = length(local - starPosition);
    float point = (1.0 - smoothstep(0.005, 0.055, distanceToStar)) * step(0.955, seed);
    float twinkle = 0.68 + 0.32 * sin(uTime * (1.2 + seed * 3.0) + seed * 83.0);
    return point * twinkle * mix(0.3, 2.6, pow(seed, 3.0));
}

void main() {
    vec3 direction = normalize(vWorldDirection);
    float upperHeight = clamp(direction.y, 0.0, 1.0);
    float zenithMix = smoothstep(0.0, 0.72, upperHeight);
    vec3 color = mix(uSkyHorizon, uSkyTop, zenithMix);
    color *= mix(0.72, 1.0, smoothstep(-0.3, 0.12, direction.y));

    float horizon = exp(-abs(direction.y) / max(0.025, uHazeThickness));
    float hazeNoise = 0.78 + 0.22 * fbm(vec2(atan(direction.z, direction.x) * 2.0, direction.y * 14.0));
    color = mix(color, mix(uFogColor, uSkyHorizon, 0.5), horizon * hazeNoise * 0.22);

    if (uStarStrength > 0.001) {
        float longitude = atan(direction.z, direction.x) / 6.2831853 + 0.5;
        float latitude = asin(clamp(direction.y, -1.0, 1.0)) / 3.1415926 + 0.5;
        float stars = starField(vec2(longitude, latitude)) * uStarStrength
            * smoothstep(-0.05, 0.2, direction.y);
        color += vec3(0.72, 0.82, 1.0) * stars;
    }

    if (uCosmosStrength > 0.001) {
        vec2 milkyUv = vec2(
            direction.x * 0.82 + direction.z * 0.57,
            direction.y + direction.z * 0.22 - direction.x * 0.16
        );
        float milkyLine = exp(-pow(abs(milkyUv.y + milkyUv.x * 0.28) * 3.8, 2.0));
        float milkyDetail = smoothstep(0.34, 0.9, fbm(milkyUv * vec2(5.0, 8.0) + 12.0));
        color += mix(vec3(0.16, 0.28, 0.62), vec3(0.62, 0.3, 0.72), upperHeight)
            * milkyLine * milkyDetail * uCosmosStrength * 0.62;
    }

    if (uAuroraStrength > 0.001) {
        vec2 auroraUv = vec2(
            direction.x * 5.0 + direction.z * 4.0 + uTime * 0.045,
            direction.y * 2.1
        );
        float warp = fbm(vec2(auroraUv.x * 0.7, uTime * 0.0875)) * 0.34;
        float ribbonA = exp(-abs(auroraUv.y - 1.05 - warp - sin(auroraUv.x * 1.7) * 0.09) * 15.0);
        float ribbonB = exp(-abs(auroraUv.y - 1.28 + warp * 0.4 - sin(auroraUv.x * 2.3 + 1.8) * 0.07) * 18.0);
        float ribbonC = exp(-abs(auroraUv.y - 1.48 - warp * 0.25 - sin(auroraUv.x * 1.2 + 4.0) * 0.1) * 20.0);
        float auroraMask = smoothstep(0.08, 0.48, direction.y) * (1.0 - smoothstep(0.80, 1.05, direction.y));
        float rayNoise = fbm(vec2(direction.z * 6.0 + uTime * 0.04, direction.y * 8.0));
        float rayStructure = 0.6 + 0.4 * (0.5 + 0.5 * sin(direction.x * 40.0 + rayNoise * 6.2831853));
        vec3 auroraColor = vec3(0.16, 1.0, 0.72) * ribbonA
            + vec3(0.38, 0.62, 1.0) * ribbonB
            + vec3(0.82, 0.3, 1.0) * ribbonC;
        color += auroraColor * rayStructure * auroraMask * uAuroraStrength * (0.65 + noise(auroraUv * 2.4) * 0.35);
    }

    float sunDot = dot(direction, normalize(uSunDirection));
    float sunDisc = smoothstep(0.9993, 0.99975, sunDot);
    float sunHalo = pow(max(sunDot, 0.0), 96.0) * 0.75
        + pow(max(sunDot, 0.0), 12.0) * 0.08
        + pow(max(sunDot, 0.0), 3.0) * 0.05;
    color += uSunColor * (sunHalo + sunDisc * 3.6);
    color += vec3(0.6, 0.7, 1.0) * uSkyFlash * 0.7;

    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float dither = (hash12(gl_FragCoord.xy) - 0.5) * mix(2.5, 0.7, clamp(luma, 0.0, 1.0)) / 255.0;
    gl_FragColor = vec4(max(color + dither, 0.0), 1.0);
}
`

export const CLOUD_VERTEX_SHADER = /* glsl */`
varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

export const CLOUD_FRAGMENT_SHADER = /* glsl */`
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uLayerY;
uniform float uPhase;
uniform float uSkyFlash;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec2 vUv;
varying vec3 vWorldPosition;

float hash12(vec2 value) {
    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
        mix(hash12(cell), hash12(cell + vec2(1.0, 0.0)), local.x),
        mix(hash12(cell + vec2(0.0, 1.0)), hash12(cell + vec2(1.0)), local.x),
        local.y
    );
}

float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.52;
    for (int octave = 0; octave < 4; octave += 1) {
        value += noise(point) * amplitude;
        point = point * 2.07 + vec2(13.1, 7.7);
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec2 centered = vUv - 0.5;
    float speedScale = mix(3.0, 4.0, fract(uPhase * 0.13));
    vec2 flow = vec2(uTime * 0.0035 * speedScale + uPhase, uTime * -0.0022 * speedScale + uPhase * 0.37);
    float broad = fbm(vUv * 6.0 + flow);
    float detail = noise(vUv * 18.0 - flow * 1.7);
    float cloud = smoothstep(0.43, 0.78, broad * 0.82 + detail * 0.25);
    float radialFade = 1.0 - smoothstep(0.36, 0.495, length(centered));
    float crossingFade = smoothstep(3.0, 12.0, abs(cameraPosition.y - uLayerY));
    float alpha = cloud * radialFade * crossingFade * uOpacity;
    vec3 litColor = uColor * (0.78 + detail * 0.42);
    litColor += vec3(0.58, 0.68, 1.0) * uSkyFlash * 0.65;
    float viewDepth = length(vWorldPosition - cameraPosition);
    float pmFogFactor = clamp((viewDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
    litColor = mix(litColor, uFogColor, pmFogFactor);
    gl_FragColor = vec4(litColor, alpha);
}
`

export const CUMULUS_VERTEX_SHADER = /* glsl */`
attribute float aPhase;
attribute vec2 aDrift;

uniform float uTime;

varying vec2 vUv;
varying float vShade;
varying float vViewDepth;

void main() {
    vUv = uv;
    vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    center.xz += aDrift * sin(uTime * 0.035 + aPhase);
    float width = length(instanceMatrix[0].xyz);
    float height = length(instanceMatrix[1].xyz);
    vec4 mvPosition = viewMatrix * vec4(center, 1.0);
    mvPosition.xy += position.xy * vec2(width, height);
    vShade = 0.82 + 0.18 * sin(aPhase + uTime * 0.08);
    vViewDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
}
`

export const CUMULUS_FRAGMENT_SHADER = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uSkyFlash;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec2 vUv;
varying float vShade;
varying float vViewDepth;

float hash12(vec2 value) {
    return fract(sin(dot(value, vec2(41.3, 289.1))) * 45758.5453);
}

float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
        mix(hash12(cell), hash12(cell + vec2(1.0, 0.0)), local.x),
        mix(hash12(cell + vec2(0.0, 1.0)), hash12(cell + vec2(1.0)), local.x),
        local.y
    );
}

float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int octave = 0; octave < 4; octave += 1) {
        value += noise(point) * amplitude;
        point = point * 2.08 + 9.3;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec2 p = (vUv - 0.5) * vec2(1.3, 1.15);
    float body = 1.0 - smoothstep(0.28, 0.72, length(p));
    float billow = fbm(vUv * 5.2 + vec2(uTime * 0.006, 0.0));
    float baseFade = smoothstep(-0.48, -0.12, p.y);
    float edgeFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, vUv.y)
        * smoothstep(0.0, 0.08, 1.0 - vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.y);
    float alpha = smoothstep(0.24, 0.68, body * 0.72 + billow * 0.48) * baseFade * edgeFade * uOpacity;
    vec3 color = uColor * (vShade + billow * 0.18);
    color += vec3(0.58, 0.68, 1.0) * uSkyFlash * 0.55;
    float pmFogFactor = clamp((vViewDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
    color = mix(color, uFogColor, pmFogFactor);
    gl_FragColor = vec4(color, alpha);
}
`
