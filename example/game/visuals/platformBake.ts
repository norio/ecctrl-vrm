import * as THREE from 'three'
import { MeshBasicNodeMaterial, RenderTarget, type Node, type WebGPURenderer } from 'three/webgpu'
import {
    add,
    clamp,
    dot,
    floor,
    fract,
    hash,
    mix,
    mod,
    mul,
    sub,
    uv,
    vec2,
    vec4,
} from 'three/tsl'

export const PLATFORM_BAKE_TILE_SIZE = 4
const BAKE_SIZE = 512
const BAKE_GRADIENT_PRE_SCALE = 8
const BAKE_GRADIENT_OFFSET = 0.05 / PLATFORM_BAKE_TILE_SIZE
export const PLATFORM_BAKE_GRADIENT_SCALE = 8 / BAKE_GRADIENT_PRE_SCALE
const bakeCache = new WeakMap<WebGPURenderer, Promise<THREE.Texture>>()

function latticeHash(cell: Node) {
    return hash(add(dot(vec2(cell), vec2(127.1, 311.7)), 104729))
}

function tileableValueNoise(coordinate: Node, frequency: number) {
    const point = mul(coordinate, frequency)
    const cell = floor(point)
    const fraction = fract(point)
    const blend = mul(mul(fraction, fraction), sub(3, mul(fraction, 2)))
    const h00 = latticeHash(mod(cell, frequency))
    const h10 = latticeHash(mod(add(cell, vec2(1, 0)), frequency))
    const h01 = latticeHash(mod(add(cell, vec2(0, 1)), frequency))
    const h11 = latticeHash(mod(add(cell, vec2(1, 1)), frequency))
    return mix(mix(h00, h10, blend.x), mix(h01, h11, blend.x), blend.y)
}

function tileableFbm(coordinate: Node) {
    const octave0 = tileableValueNoise(coordinate, 10).toVar()
    const octave1 = tileableValueNoise(coordinate, 20).toVar()
    const octave2 = tileableValueNoise(coordinate, 40).toVar()
    return {
        detail: octave2,
        fine: mul(add(add(octave0, mul(octave1, 0.5)), mul(octave2, 0.25)), 1 / 1.75).toVar(),
    }
}

function createBakeMaterial() {
    const coordinate = uv()
    const center = tileableFbm(coordinate)
    const fineU = tileableFbm(add(coordinate, vec2(BAKE_GRADIENT_OFFSET, 0))).fine
    const fineV = tileableFbm(add(coordinate, vec2(0, BAKE_GRADIENT_OFFSET))).fine
    const gradientU = clamp(mul(sub(center.fine, fineU), BAKE_GRADIENT_PRE_SCALE), -1, 1)
    const gradientV = clamp(mul(sub(center.fine, fineV), BAKE_GRADIENT_PRE_SCALE), -1, 1)

    const material = new MeshBasicNodeMaterial({ toneMapped: false })
    material.name = 'OnlyUpPlatformBake'
    material.blending = THREE.NoBlending
    material.colorNode = vec4(
        add(mul(gradientU, 0.5), 0.5),
        add(mul(gradientV, 0.5), 0.5),
        center.detail,
        center.fine,
    )
    return material
}

function bakePlatformTexture(renderer: WebGPURenderer) {
    const target = new RenderTarget(BAKE_SIZE, BAKE_SIZE, {
        anisotropy: 4,
        colorSpace: THREE.NoColorSpace,
        depthBuffer: false,
        format: THREE.RGBAFormat,
        generateMipmaps: true,
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearMipmapLinearFilter,
        type: THREE.UnsignedByteType,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
    })
    target.texture.name = 'OnlyUpPlatformBakeTexture'

    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = createBakeMaterial()
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const previousRenderTarget = renderer.getRenderTarget()

    try {
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
    } catch (error) {
        target.dispose()
        throw error
    } finally {
        renderer.setRenderTarget(previousRenderTarget)
        geometry.dispose()
        material.dispose()
    }

    return target.texture
}

export function getPlatformBakeTexture(renderer: WebGPURenderer) {
    const cached = bakeCache.get(renderer)
    if (cached) return cached

    const promise = Promise.resolve().then(() => bakePlatformTexture(renderer))
    bakeCache.set(renderer, promise)
    return promise
}
