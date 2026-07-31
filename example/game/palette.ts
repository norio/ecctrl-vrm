import * as THREE from 'three'

export type BiomeId = 'meadow' | 'clouds' | 'storm' | 'cosmos' | 'summit'

export interface BiomePalette {
    skyTop: THREE.Color
    skyHorizon: THREE.Color
    fog: THREE.Color
    sunColor: THREE.Color
    sunIntensity: number
    hemiSky: THREE.Color
    hemiGround: THREE.Color
    hemiIntensity: number
    platformBase: THREE.Color
    platformAccent: THREE.Color
    emissive: THREE.Color
    particle: THREE.Color
}

export interface Biome {
    id: BiomeId
    jpName: string
    minY: number
    maxY: number
    palette: BiomePalette
}

function color(value: string) {
    return new THREE.Color(value)
}

function palette(
    skyTop: string,
    skyHorizon: string,
    fog: string,
    sunColor: string,
    sunIntensity: number,
    platformBase: string,
    platformAccent: string,
    emissive: string,
    hemiIntensity: number,
): BiomePalette {
    const emissiveColor = color(emissive)
    return {
        skyTop: color(skyTop),
        skyHorizon: color(skyHorizon),
        fog: color(fog),
        sunColor: color(sunColor),
        sunIntensity,
        hemiSky: color(skyTop).lerp(color('#ffffff'), 0.22),
        hemiGround: color(skyHorizon).multiplyScalar(0.8),
        hemiIntensity,
        platformBase: color(platformBase),
        platformAccent: color(platformAccent),
        emissive: emissiveColor,
        particle: emissiveColor.clone(),
    }
}

// Hemisphere intensity anchors intentionally descend monotonically with altitude:
// meadow 0.90, clouds 0.76, storm 0.58, cosmos 0.42, summit 0.35.
export const BIOMES: Biome[] = [
    { id: 'meadow', jpName: '暁の草原', minY: 0, maxY: 90, palette: palette('#6f9fd8', '#ffd9ae', '#8c887c', '#ffe0b0', 2.2, '#717e65', '#c9b98a', '#ffd27f', 0.9) },
    { id: 'clouds', jpName: '黄昏の雲海', minY: 90, maxY: 190, palette: palette('#3d5a9e', '#ff9e6e', '#e8b9a0', '#ff9e5e', 2.6, '#b0a8c8', '#e8d0b8', '#ff9e7f', 0.76) },
    { id: 'storm', jpName: '雷嵐の螺旋', minY: 190, maxY: 300, palette: palette('#0c101d', '#20273b', '#2a3350', '#6477ad', 1.1, '#5a6478', '#8892aa', '#8fd0ff', 0.58) },
    { id: 'cosmos', jpName: '星海', minY: 300, maxY: 412, palette: palette('#05060f', '#1a1440', '#0e1030', '#cfd8ff', 0.9, '#3a3a55', '#6a5a9a', '#b08fff', 0.42) },
    { id: 'summit', jpName: '頂', minY: 385, maxY: Number.POSITIVE_INFINITY, palette: palette('#0a0c1c', '#4a3a7a', '#141230', '#fff0d0', 1.8, '#d8d0c0', '#fff0d8', '#ffe9a0', 0.35) },
]

export function biomeAt(y: number): Biome {
    if (y < BIOMES[1].minY) return BIOMES[0]
    if (y < BIOMES[2].minY) return BIOMES[1]
    if (y < BIOMES[3].minY) return BIOMES[2]
    if (y < BIOMES[4].minY) return BIOMES[3]
    return BIOMES[4]
}

function makeOutput(): BiomePalette {
    return {
        skyTop: new THREE.Color(), skyHorizon: new THREE.Color(), fog: new THREE.Color(),
        sunColor: new THREE.Color(), sunIntensity: 0,
        hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 0,
        platformBase: new THREE.Color(), platformAccent: new THREE.Color(),
        emissive: new THREE.Color(), particle: new THREE.Color(),
    }
}

function copyPalette(out: BiomePalette, source: BiomePalette) {
    out.skyTop.copy(source.skyTop)
    out.skyHorizon.copy(source.skyHorizon)
    out.fog.copy(source.fog)
    out.sunColor.copy(source.sunColor)
    out.sunIntensity = source.sunIntensity
    out.hemiSky.copy(source.hemiSky)
    out.hemiGround.copy(source.hemiGround)
    out.hemiIntensity = source.hemiIntensity
    out.platformBase.copy(source.platformBase)
    out.platformAccent.copy(source.platformAccent)
    out.emissive.copy(source.emissive)
    out.particle.copy(source.particle)
}

function lerpPalette(out: BiomePalette, to: BiomePalette, t: number) {
    out.skyTop.lerp(to.skyTop, t)
    out.skyHorizon.lerp(to.skyHorizon, t)
    out.fog.lerp(to.fog, t)
    out.sunColor.lerp(to.sunColor, t)
    out.sunIntensity += (to.sunIntensity - out.sunIntensity) * t
    out.hemiSky.lerp(to.hemiSky, t)
    out.hemiGround.lerp(to.hemiGround, t)
    out.hemiIntensity += (to.hemiIntensity - out.hemiIntensity) * t
    out.platformBase.lerp(to.platformBase, t)
    out.platformAccent.lerp(to.platformAccent, t)
    out.emissive.lerp(to.emissive, t)
    out.particle.lerp(to.particle, t)
}

export function blendedPalette(y: number, out: BiomePalette = makeOutput()): BiomePalette {
    const blendHalfWidth = 14
    let lower = BIOMES[0]
    copyPalette(out, lower.palette)

    for (let index = 1; index < BIOMES.length; index += 1) {
        const upper = BIOMES[index]
        const boundary = upper.minY
        if (y < boundary - blendHalfWidth) return out
        if (y <= boundary + blendHalfWidth) {
            const linear = (y - boundary + blendHalfWidth) / (blendHalfWidth * 2)
            const smooth = linear * linear * (3 - 2 * linear)
            lerpPalette(out, upper.palette, smooth)
            return out
        }
        lower = upper
        copyPalette(out, lower.palette)
    }
    return out
}
