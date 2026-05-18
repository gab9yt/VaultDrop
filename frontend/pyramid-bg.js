import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

class PyramidBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.initThree();

        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(this.canvas.parentElement);

        this.animate = this.animate.bind(this);
        this.clock = new THREE.Clock();
        this.time = 0;

        // Set initial palette
        this.setPalette(this.effectThemes[0]);

        requestAnimationFrame(this.animate);
    }

    initThree() {
        this.scene = new THREE.Scene();
        
        // Camera looking UP at the underside of the pyramid
        this.camera = new THREE.PerspectiveCamera(75, this.canvas.clientWidth / this.canvas.clientHeight || 1, 0.1, 1000);
        this.camera.position.set(0, -2, 0);  // Below the pyramid
        this.camera.lookAt(0, 2, 0);          // Looking up

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        this.renderer.setSize(this.canvas.clientWidth || 300, this.canvas.clientHeight || 300);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 1);

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        bloomPass.threshold = 0.1;
        bloomPass.strength = 2.5;
        bloomPass.radius = 0.8;
        this.composer.addPass(bloomPass);

        this.effectThemes = [
            {
                name: "Solar Flare",
                outer: [new THREE.Color(0xff4500), new THREE.Color(0xff8c00), new THREE.Color(0xffd700)],
                outerEdge: new THREE.Color(0xffa500),
                inner: [new THREE.Color(0x8b0000), new THREE.Color(0xff0000), new THREE.Color(0xff4500)],
                innerEdge: new THREE.Color(0xff0000)
            },
            {
                name: "Lightning Storm",
                outer: [new THREE.Color(0x00ffff), new THREE.Color(0x4169e1), new THREE.Color(0x9400d3)],
                outerEdge: new THREE.Color(0x87cefa),
                inner: [new THREE.Color(0xff1493), new THREE.Color(0xff4500), new THREE.Color(0xffd700)],
                innerEdge: new THREE.Color(0xffd700)
            }
        ];

        // Build pyramids
        this.pyramidGroup = new THREE.Group();
        this.scene.add(this.pyramidGroup);

        this.outerPyramidData = this.createParticlePyramid(2.5, 1.8, 5000, false);
        this.outerEdges = this.createPyramidEdges(2.5, 1.8, new THREE.Color());
        this.outerGroup = new THREE.Group();
        this.outerGroup.userData.height = 2.5;
        this.outerGroup.add(this.outerPyramidData.particles);

        this.innerPyramidData = this.createParticlePyramid(1.5, 1.0, 3000, true);
        this.innerEdges = this.createPyramidEdges(1.5, 1.0, new THREE.Color());
        this.innerGroup = new THREE.Group();
        this.innerGroup.userData.height = 1.5;
        this.innerGroup.add(this.innerPyramidData.particles);

        this.pyramidGroup.add(this.outerGroup, this.outerEdges, this.innerGroup, this.innerEdges);
    }

    createParticlePyramid(height, baseSize, particleCount, innerPyramid) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const particleColors = [];
        const originalColors = [];
        const twinkleFactors = [];
        const initialSizes = [];
        const baseParticleSize = innerPyramid ? 0.02 : 0.03;

        for (let i = 0; i < particleCount; i++) {
            const t = Math.random();
            const u = Math.random();
            const apex = { x: 0, y: height, z: 0 };
            const base = [
                { x: -baseSize, y: 0, z: -baseSize },
                { x: baseSize, y: 0, z: -baseSize },
                { x: baseSize, y: 0, z: baseSize },
                { x: -baseSize, y: 0, z: baseSize }
            ];
            const face = Math.floor(Math.random() * 4);
            const basePoint1 = base[face];
            const basePoint2 = base[(face + 1) % 4];
            const x = (1 - t) * ((1 - u) * basePoint1.x + u * basePoint2.x) + t * apex.x;
            const y = (1 - t) * 0 + t * height;
            const z = (1 - t) * ((1 - u) * basePoint1.z + u * basePoint2.z) + t * apex.z;
            positions.push(x, y, z);
            particleColors.push(0, 0, 0);
            originalColors.push(new THREE.Color());
            initialSizes.push(baseParticleSize);
            twinkleFactors.push(Math.random() < 0.2 ? Math.random() * 2 + 1.0 : 0);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(particleColors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(initialSizes, 1));

        const material = new THREE.PointsMaterial({
            vertexColors: true,
            size: baseParticleSize,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const particles = new THREE.Points(geometry, material);
        return { particles, originalColors, twinkleFactors, baseParticleSize };
    }

    createPyramidEdges(height, baseSize, color) {
        const points = [];
        const apex = new THREE.Vector3(0, height, 0);
        const verts = [
            new THREE.Vector3(-baseSize, 0, -baseSize),
            new THREE.Vector3(baseSize, 0, -baseSize),
            new THREE.Vector3(baseSize, 0, baseSize),
            new THREE.Vector3(-baseSize, 0, baseSize)
        ];
        for (let i = 0; i < 4; i++) {
            points.push(apex.x, apex.y, apex.z, verts[i].x, verts[i].y, verts[i].z);
            points.push(verts[i].x, verts[i].y, verts[i].z, verts[(i + 1) % 4].x, verts[(i + 1) % 4].y, verts[(i + 1) % 4].z);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        const mat = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 2,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        return new THREE.LineSegments(geo, mat);
    }

    updatePyramidColors(pyramidData, newColors) {
        const { particles, originalColors } = pyramidData;
        const positions = particles.geometry.attributes.position;
        const colors = particles.geometry.attributes.color;
        const height = particles.parent.userData.height;

        for (let i = 0; i < positions.count; i++) {
            const y = positions.getY(i);
            const colorPos = y / height;
            const idx = Math.min(newColors.length - 2, Math.floor(colorPos * (newColors.length - 1)));
            const c1 = newColors[idx];
            const c2 = newColors[idx + 1];
            const mix = (colorPos * (newColors.length - 1)) % 1;
            const finalColor = new THREE.Color().lerpColors(c1, c2, mix);
            colors.setXYZ(i, finalColor.r, finalColor.g, finalColor.b);
            originalColors[i].copy(finalColor);
        }
        colors.needsUpdate = true;
    }

    setPalette(theme) {
        this.updatePyramidColors(this.outerPyramidData, theme.outer);
        this.outerEdges.material.color.set(theme.outerEdge);
        this.updatePyramidColors(this.innerPyramidData, theme.inner);
        this.innerEdges.material.color.set(theme.innerEdge);
    }

    applySparkle(pData, t) {
        const { particles, originalColors, twinkleFactors, baseParticleSize } = pData;
        const colors = particles.geometry.attributes.color;
        const sizes = particles.geometry.attributes.size;
        for (let i = 0; i < colors.count; i++) {
            if (twinkleFactors[i] > 0) {
                const pulse = Math.pow(Math.abs(Math.sin(twinkleFactors[i] * t + i * 0.1)), 10);
                const brightness = 1.0 + 2.0 * pulse;
                const sizePulse = 1.0 + 3.0 * pulse;
                const oc = originalColors[i];
                colors.setXYZ(i, oc.r * brightness, oc.g * brightness, oc.b * brightness);
                sizes.setX(i, baseParticleSize * sizePulse);
            }
        }
        colors.needsUpdate = true;
        sizes.needsUpdate = true;
    }

    onResize() {
        if (!this.canvas) return;
        const width = this.canvas.clientWidth || 300;
        const height = this.canvas.clientHeight || 300;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
        this.composer.setSize(width, height);
    }

    animate() {
        this._raf = requestAnimationFrame(this.animate);
        if (this.canvas.parentElement.clientWidth === 0) return;

        const dt = this.clock.getDelta();
        this.time += dt;

        // Auto-rotation
        this.pyramidGroup.rotation.y += 0.005;
        this.innerGroup.rotation.y -= 0.015;

        // Sparkle
        this.applySparkle(this.outerPyramidData, this.time);
        this.applySparkle(this.innerPyramidData, this.time);

        this.composer.render();
    }

    dispose() {
        if (this._raf) cancelAnimationFrame(this._raf);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.outerPyramidData.particles.geometry.dispose();
        this.outerPyramidData.particles.material.dispose();
        this.innerPyramidData.particles.geometry.dispose();
        this.innerPyramidData.particles.material.dispose();
        this.outerEdges.geometry.dispose();
        this.outerEdges.material.dispose();
        this.innerEdges.geometry.dispose();
        this.innerEdges.material.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        console.log("🧹 PyramidBackground disposed");
    }
}

// Global hook
window.initPyramidBackground = function(canvasId) {
    return new PyramidBackground(canvasId);
};
