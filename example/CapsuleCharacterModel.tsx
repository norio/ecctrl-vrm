import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { type GLTF } from 'three-stdlib'
import { type ThreeElements } from '@react-three/fiber'
import { assetUrl } from './assetUrl'

export function CapsuleCahracterModel(props: ThreeElements['group']) {
  const { nodes, materials } = useGLTF(assetUrl('capsule.glb')) as unknown as GLTFResult
  materials.GridTexture.side = THREE.FrontSide;
  return (
    <group {...props} dispose={null}>
      <mesh castShadow receiveShadow geometry={nodes.Capsule.geometry} material={materials.GridTexture} />
    </group>
  )
}

useGLTF.preload(assetUrl('capsule.glb'))

type GLTFResult = GLTF & {
  nodes: {
    Capsule: THREE.Mesh
  }
  materials: {
    GridTexture: THREE.MeshStandardMaterial
  }
}