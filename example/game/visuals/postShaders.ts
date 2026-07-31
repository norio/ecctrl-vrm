import * as THREE from 'three'

export const COLOR_GRADE_SHADER = {
    uniforms: {
        tDiffuse: { value: null },
        uFogColor: { value: new THREE.Color() },
        uTime: { value: 0 },
        uFallStrength: { value: 0 },
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec3 uFogColor;
        uniform float uTime;
        uniform float uFallStrength;

        varying vec2 vUv;

        float hash12(vec2 value) {
            vec3 p = fract(vec3(value.xyx) * 0.1031);
            p += dot(p, p.yzx + 33.33);
            return fract((p.x + p.y) * p.z);
        }

        void main() {
            vec2 fromCenter = vUv - 0.5;
            vec3 color = texture2D(tDiffuse, vUv).rgb;
            if (uFallStrength > 0.001) {
                vec2 blurStep = fromCenter * 0.018 * uFallStrength;
                vec3 radialBlur = texture2D(tDiffuse, vUv - blurStep).rgb;
                radialBlur += texture2D(tDiffuse, vUv - blurStep * 2.0).rgb;
                radialBlur += texture2D(tDiffuse, vUv - blurStep * 3.0).rgb;
                color = mix(color, radialBlur / 3.0, uFallStrength * 0.42);
            }

            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luminance), color, 1.08);
            float shadowMask = (1.0 - smoothstep(0.025, 0.42, luminance)) * 0.065;
            color = mix(color, uFogColor, shadowMask);

            float radius = length(fromCenter) * 1.4142;
            float vignetteStart = mix(0.56, 0.34, uFallStrength);
            float vignetteEnd = mix(1.0, 0.74, uFallStrength);
            float vignette = smoothstep(vignetteStart, vignetteEnd, radius);
            color *= 1.0 - vignette * (0.25 + uFallStrength * 0.28);

            float grain = (hash12(gl_FragCoord.xy + fract(uTime) * 113.0) - 0.5)
                * mix(2.5, 0.7, clamp(luminance, 0.0, 1.0)) / 255.0;
            color += grain;
            gl_FragColor = vec4(max(color, 0.0), 1.0);
        }
    `,
}
