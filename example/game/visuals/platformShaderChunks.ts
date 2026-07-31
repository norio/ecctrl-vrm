import type { MaterialKind } from './platformMaterials'

export interface PlatformShaderChunks {
    vertexPars: string
    vertexNormal: string
    vertexPosition: string
    fragmentPars: string
    albedo: string
    roughness: string
    normalPerturb: string
    emissive: string
}

const SHARED_FRAGMENT = /* glsl */ `
uniform float uPmTime;
uniform vec3 uPmBase[5];
uniform vec3 uPmAccent[5];
uniform vec3 uPmEmissive[5];
uniform vec4 uPmBoundaries;
varying vec3 vPmWorldPos;
varying vec3 vPmLocalPos;
varying float vPmWorldNormalY;
varying float vPmPillarTaper;

float pmHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float pmValueNoise(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = pmHash(cell);
    float n100 = pmHash(cell + vec3(1.0, 0.0, 0.0));
    float n010 = pmHash(cell + vec3(0.0, 1.0, 0.0));
    float n110 = pmHash(cell + vec3(1.0, 1.0, 0.0));
    float n001 = pmHash(cell + vec3(0.0, 0.0, 1.0));
    float n101 = pmHash(cell + vec3(1.0, 0.0, 1.0));
    float n011 = pmHash(cell + vec3(0.0, 1.0, 1.0));
    float n111 = pmHash(cell + vec3(1.0));
    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

float pmFbm(vec3 p) {
    float value = pmValueNoise(p) * 0.57;
    value += pmValueNoise(p * 2.03 + 9.7) * 0.29;
    value += pmValueNoise(p * 4.11 + 21.3) * 0.14;
    return value;
}

void pmAltitudePalette(float y, out vec3 base, out vec3 accent, out vec3 glow, out float depth) {
    float b0 = smoothstep(uPmBoundaries.x - 14.0, uPmBoundaries.x + 14.0, y);
    float b1 = smoothstep(uPmBoundaries.y - 14.0, uPmBoundaries.y + 14.0, y);
    float b2 = smoothstep(uPmBoundaries.z - 14.0, uPmBoundaries.z + 14.0, y);
    float b3 = smoothstep(uPmBoundaries.w - 14.0, uPmBoundaries.w + 14.0, y);
    base = mix(mix(mix(mix(uPmBase[0], uPmBase[1], b0), uPmBase[2], b1), uPmBase[3], b2), uPmBase[4], b3);
    accent = mix(mix(mix(mix(uPmAccent[0], uPmAccent[1], b0), uPmAccent[2], b1), uPmAccent[3], b2), uPmAccent[4], b3);
    glow = mix(mix(mix(mix(uPmEmissive[0], uPmEmissive[1], b0), uPmEmissive[2], b1), uPmEmissive[3], b2), uPmEmissive[4], b3);
    depth = 0.25 * (b0 + b1 + b2 + b3);
}

float pmFresnel(vec3 surfaceNormal, vec3 viewPosition, float power) {
    vec3 viewDir = normalize(viewPosition);
    // clamp: interpolated unit vectors can dot to 1.0 + epsilon, and
    // pow(negative, fractional) is NaN — which bloom smears into black boxes.
    return pow(clamp(1.0 - dot(normalize(surfaceNormal), viewDir), 0.0, 1.0), power);
}
`

const ROCK_ALBEDO = /* glsl */ `
float pmStrata = 0.5 + 0.5 * sin(vPmWorldPos.y * 4.6 + pmNoise * 7.0);
pmKindColor *= mix(0.76, 1.14, smoothstep(0.2, 0.82, pmStrata));
float pmTop = smoothstep(0.7, 0.9, vPmWorldNormalY);
float pmMeadow = 1.0 - smoothstep(uPmBoundaries.x - 14.0, uPmBoundaries.x + 14.0, vPmWorldPos.y);
vec3 pmDust = mix(vec3(1.16, 1.1, 0.94), vec3(0.72, 1.08, 0.67), pmMeadow);
pmKindColor *= mix(vec3(1.0), pmDust, pmTop * 0.34);
`

function kindAlbedo(kind: MaterialKind): string {
    switch (kind) {
        case 'rock':
        case 'accent':
        case 'startisle':
            return ROCK_ALBEDO
        case 'ice':
            return /* glsl */ `
pmKindColor = mix(vec3(0.12, 0.42, 0.58), pmAccent * vec3(0.72, 0.95, 1.16), 0.58 + 0.22 * pmDepth);
pmKindColor += vec3(0.12, 0.2, 0.24) * smoothstep(0.62, 0.94, pmNoise);
`
        case 'grip':
            return /* glsl */ `pmKindColor = mix(vec3(0.025, 0.018, 0.02), pmBase * 0.22, 0.28) * mix(0.72, 1.15, pmNoise);`
        case 'cloud':
            return /* glsl */ `pmKindColor = mix(pmAccent, vec3(1.0, 0.93, 0.88), 0.72) * mix(0.9, 1.12, pmNoise);`
        case 'mover':
        case 'spinner':
            return /* glsl */ `
float pmBrush = 0.5 + 0.5 * sin(vPmWorldPos.x * 19.0 + vPmWorldPos.z * 3.0 + pmNoise * 5.0);
pmKindColor = mix(pmBase * 0.58, pmAccent * 1.08, 0.35 + pmBrush * 0.22);
`
        case 'planet':
            return /* glsl */ `
float pmLatitude = 0.5 + 0.5 * sin(vPmLocalPos.y * 8.0 + pmFbm(vPmLocalPos * 2.4) * 4.0);
pmKindColor = mix(uPmBase[3] * vec3(0.52, 0.62, 1.18), uPmAccent[3] * vec3(1.12, 0.72, 1.16), smoothstep(0.2, 0.82, pmLatitude));
vec3 pmCraterGrid = vPmLocalPos * 5.0;
vec3 pmCraterCell = floor(pmCraterGrid);
float pmCraterSeed = pmHash(pmCraterCell + 43.0);
float pmCrater = (1.0 - smoothstep(0.13, 0.32, length(fract(pmCraterGrid) - 0.5))) * step(0.72, pmCraterSeed);
pmKindColor *= mix(1.0, 0.48, pmCrater);
`
        case 'pillar':
            return /* glsl */ `
float pmStarMetal = pow(pmFbm(vPmWorldPos * vec3(0.16, 0.055, 0.16)), 2.0);
pmKindColor = mix(vec3(0.015, 0.018, 0.055), pmAccent * 0.76, pmStarMetal);
`
        case 'checkpoint':
        case 'checkpointBeam':
            return /* glsl */ `pmKindColor = mix(pmAccent, pmGlow, 0.7) * (0.82 + pmNoise * 0.26);`
        case 'goal':
            return /* glsl */ `pmKindColor = mix(pmAccent, pmGlow, 0.86) * (0.95 + pmNoise * 0.22);`
    }
}

function kindRoughness(kind: MaterialKind): string {
    if (kind === 'ice') return 'roughnessFactor = clamp(0.035 + pmNoise * 0.045, 0.035, 0.09);'
    if (kind === 'grip') return 'roughnessFactor = clamp(0.82 + pmNoise * 0.16, 0.0, 1.0);'
    if (kind === 'cloud') return 'roughnessFactor = clamp(0.62 + pmNoise * 0.22, 0.0, 1.0);'
    if (kind === 'mover' || kind === 'spinner') return 'roughnessFactor = clamp(0.24 + pmNoise * 0.24, 0.0, 1.0);'
    if (kind === 'checkpoint' || kind === 'checkpointBeam' || kind === 'goal') return 'roughnessFactor = 0.16 + pmNoise * 0.08;'
    return 'roughnessFactor = clamp(roughnessFactor + (pmNoise - 0.5) * 0.5, 0.08, 1.0);'
}

function rimIntensity(kind: MaterialKind): number {
    if (kind === 'rock') return 0.15
    if (kind === 'startisle') return 0.2
    if (kind === 'accent') return 0.28
    if (kind === 'checkpoint' || kind === 'checkpointBeam') return 2.2
    if (kind === 'goal') return 0.28
    if (kind === 'planet') return 1.65
    if (kind === 'pillar') return 1.9
    return 0.62
}

function kindEmissive(kind: MaterialKind): string {
    const rim = `totalEmissiveRadiance += pmGlow * pmRim * ${rimIntensity(kind).toFixed(2)};`
    switch (kind) {
        case 'ice':
            return `${rim}
float pmSpark = step(0.965, pmHash(floor(vPmWorldPos * 7.0))) * pow(pmRim, 1.6) * (0.5 + 0.5 * sin(uPmTime * 8.0 + pmNoise * 31.0));
totalEmissiveRadiance += vec3(0.62, 0.94, 1.0) * pmSpark * 1.8;`
        case 'grip':
            return `${rim}
vec2 pmGripCell = floor(vPmWorldPos.xz * 2.25);
float pmCellHash = pmHash(vec3(pmGripCell, 0.0));
float pmRadiusHash = pmHash(vec3(pmGripCell, 17.0));
float pmBrightnessHash = pmHash(vec3(pmGripCell, 31.0));
vec2 pmCell = abs(fract(vPmWorldPos.xz * 2.25) - 0.5);
float pmRadiusScale = mix(0.7, 1.3, pmRadiusHash);
float pmDot = 1.0 - smoothstep(0.07 * pmRadiusScale, 0.14 * pmRadiusScale, length(pmCell));
if (pmCellHash < 0.2) pmDot = 0.0;
float pmDotBrightness = mix(0.805, 1.61, pmBrightnessHash);
totalEmissiveRadiance += vec3(1.0, 0.3, 0.07) * pmDot * pmDotBrightness;`
        case 'cloud':
            return `${rim}
float pmUnder = smoothstep(0.05, 0.9, -vPmWorldNormalY);
totalEmissiveRadiance += mix(vec3(1.0), pmGlow, 0.35) * pmRim * 0.9;
totalEmissiveRadiance += vec3(1.0, 0.31, 0.11) * pmUnder * (0.18 + pmNoise * 0.3);`
        case 'mover':
        case 'spinner':
            return `${rim}
float pmEdge = max(max(smoothstep(0.72, 0.98, abs(vPmLocalPos.x)), smoothstep(0.72, 0.98, abs(vPmLocalPos.z))), smoothstep(0.78, 1.0, abs(vPmLocalPos.y)));
float pmMoverPhase = pmHash(floor(vPmWorldPos)) * 6.2831853;
float pmPulse = 0.45 + 0.55 * sin(uPmTime * 1.8 + vPmWorldPos.y * 0.08 + pmMoverPhase);
totalEmissiveRadiance += pmGlow * pmEdge * (0.27 + pmPulse * 0.45);`
        case 'planet':
            return `${rim}
float pmPole = smoothstep(0.58, 0.96, abs(vPmLocalPos.y));
totalEmissiveRadiance += uPmEmissive[3] * pmPole * (0.55 + pmNoise * 0.8);`
        case 'pillar':
            return `${rim}
float pmVeinWave = abs(sin((vPmWorldPos.x + vPmWorldPos.z) * 1.9 + pmFbm(vPmWorldPos * 0.32 + vec3(0.0, -uPmTime * 0.22, 0.0)) * 9.0));
float pmVein = smoothstep(0.935, 0.995, pmVeinWave);
float pmApexFade = mix(1.0, 1.0 - smoothstep(0.7, 1.0, vPmLocalPos.y), vPmPillarTaper);
totalEmissiveRadiance += mix(uPmEmissive[3], uPmEmissive[4], pmDepth) * pmVein * pmApexFade * 1.6;`
        case 'checkpoint':
        case 'checkpointBeam':
        case 'goal': {
            const strength = kind === 'goal' ? '0.49' : '1.1'
            return `${rim}
float pmBeatPhase = mod(uPmTime, 2.0);
float pmBeat = exp(-pow((pmBeatPhase - 0.18) / 0.075, 2.0)) + 0.68 * exp(-pow((pmBeatPhase - 0.43) / 0.11, 2.0));
totalEmissiveRadiance += pmGlow * (${strength} + pmBeat * ${kind === 'goal' ? '0.42' : '1.0'});`
        }
        default:
            return rim
    }
}

export function buildPlatformShaderChunks(kind: MaterialKind): PlatformShaderChunks {
    const accentMix = kind === 'accent' ? '0.68' : kind === 'goal' || kind === 'checkpoint' || kind === 'checkpointBeam' ? '0.76' : '0.24'
    const wobble = kind === 'cloud'
        ? 'transformed += normal * (sin(uPmTime * 0.72 + position.x * 2.1 + position.z * 1.7) * 0.018);'
        : ''
    const taper = kind === 'pillar'
        ? /* glsl */ `
#ifndef USE_INSTANCING
    vPmPillarTaper = 1.0;
    transformed.xz *= mix(1.0, 0.3, smoothstep(0.55, 1.0, transformed.y));
#endif`
        : ''
    return {
        vertexPars: 'uniform float uPmTime; varying vec3 vPmWorldPos; varying vec3 vPmLocalPos; varying float vPmWorldNormalY; varying float vPmPillarTaper;',
        vertexNormal: /* glsl */ `
vec3 pmWorldNormal = objectNormal;
#ifdef USE_INSTANCING
    mat3 pmIm = mat3(instanceMatrix);
    pmWorldNormal /= vec3(dot(pmIm[0], pmIm[0]), dot(pmIm[1], pmIm[1]), dot(pmIm[2], pmIm[2]));
    pmWorldNormal = pmIm * pmWorldNormal;
#endif
pmWorldNormal = normalize(mat3(modelMatrix) * pmWorldNormal);
vPmWorldNormalY = pmWorldNormal.y;
`,
        vertexPosition: /* glsl */ `
vPmPillarTaper = 0.0;
${wobble}
${taper}
vPmLocalPos = transformed;
vec4 pmWorldPos4 = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    pmWorldPos4 = instanceMatrix * pmWorldPos4;
#endif
pmWorldPos4 = modelMatrix * pmWorldPos4;
vPmWorldPos = pmWorldPos4.xyz;
`,
        fragmentPars: SHARED_FRAGMENT,
        albedo: /* glsl */ `
vec3 pmBase;
vec3 pmAccent;
vec3 pmGlow;
float pmDepth;
pmAltitudePalette(vPmWorldPos.y, pmBase, pmAccent, pmGlow, pmDepth);
float pmNoise = pmFbm(vPmWorldPos * 0.38) + pmFbm(vPmWorldPos * 2.4) * 0.35;
vec3 pmKindColor = mix(pmBase, pmAccent, ${accentMix});
${kindAlbedo(kind)}
diffuseColor.rgb = mix(diffuseColor.rgb, pmKindColor, 0.88) * mix(0.82, 1.16, pmNoise);
float pmTopDust = smoothstep(0.55, 0.95, vPmWorldNormalY) * pmNoise;
diffuseColor.rgb += vec3(pmTopDust * 0.15);
float pmSideFill = (1.0 - abs(vPmWorldNormalY)) * 0.16;
diffuseColor.rgb += mix(pmBase, pmAccent, 0.55) * pmSideFill;
`,
        roughness: kindRoughness(kind),
        normalPerturb: /* glsl */ `
float pmNH = pmFbm(vPmWorldPos * 2.4);
float pmNHx = pmFbm(vPmWorldPos * 2.4 + vec3(0.05, 0.0, 0.0));
float pmNHz = pmFbm(vPmWorldPos * 2.4 + vec3(0.0, 0.0, 0.05));
vec3 pmNormalPerturb = vec3((pmNH - pmNHx) * 8.0, 1.0, (pmNH - pmNHz) * 8.0);
normal = normalize(normal + mat3(viewMatrix) * normalize(pmNormalPerturb) * 0.06);
`,
        emissive: /* glsl */ `
float pmRim = pmFresnel(normal, vViewPosition, 2.35);
${kindEmissive(kind)}
`,
    }
}
