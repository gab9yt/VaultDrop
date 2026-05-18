import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

class NeuralBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.config = {
            paused: false,
            activePaletteIndex: 0,
            currentFormation: 0, // 0 = Sphere
            densityFactor: 1
        };

        this.colorPalettes = [
            [
                new THREE.Color(0x667eea),
                new THREE.Color(0x764ba2),
                new THREE.Color(0xf093fb),
                new THREE.Color(0x9d50bb),
                new THREE.Color(0x6e48aa)
            ]
        ];

        this.initThree();
        this.createNetworkVisualization(this.config.currentFormation, this.config.densityFactor);
        
        // Resize observer to handle display: none -> block
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(this.canvas.parentElement);
        
        this.animate();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x000000, 0.002);
        
        // As zoomed out as possible
        this.camera = new THREE.PerspectiveCamera(65, this.canvas.clientWidth / this.canvas.clientHeight || 1, 0.1, 1000);
        this.camera.position.set(0, 0, 80); 

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: "high-performance",
            alpha: true
        });
        this.renderer.setSize(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0); // Transparent background
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.starField = this.createStarfield();
        this.scene.add(this.starField);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.2;
        
        // Désactivation de toutes les interactions manuelles (souris)
        this.controls.enableRotate = false;
        this.controls.enableZoom = false;
        this.controls.enablePan = false;

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.8, 0.6, 0.7
        );
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(new OutputPass());

        this.clock = new THREE.Clock();

        this.pulseUniforms = {
            uTime: { value: 0.0 },
            uPulsePositions: { value: [new THREE.Vector3(1e3, 1e3, 1e3), new THREE.Vector3(1e3, 1e3, 1e3), new THREE.Vector3(1e3, 1e3, 1e3)] },
            uPulseTimes: { value: [-1e3, -1e3, -1e3] },
            uPulseColors: { value: [new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1)] },
            uPulseSpeed: { value: 18.0 },
            uBaseNodeSize: { value: 0.6 }
        };

        this.setupShaders();
    }

    createStarfield() {
        const count = 4000;
        const positions = [];
        const colors = [];
        const sizes = [];
        for (let i = 0; i < count; i++) {
            const r = THREE.MathUtils.randFloat(50, 150);
            const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
            const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
            positions.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi)
            );
            const colorChoice = Math.random();
            if (colorChoice < 0.7) colors.push(1, 1, 1);
            else if (colorChoice < 0.85) colors.push(0.7, 0.8, 1);
            else colors.push(1, 0.9, 0.8);
            sizes.push(THREE.MathUtils.randFloat(0.1, 0.3));
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: `
                attribute float size; attribute vec3 color; varying vec3 vColor; uniform float uTime;
                void main() {
                    vColor = color; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    float twinkle = sin(uTime * 2.0 + position.x * 100.0) * 0.3 + 0.7;
                    gl_PointSize = size * twinkle * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    vec2 center = gl_PointCoord - 0.5; float dist = length(center);
                    if (dist > 0.5) discard;
                    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                    gl_FragColor = vec4(vColor, alpha * 0.8);
                }
            `,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        return new THREE.Points(geo, mat);
    }

    setupShaders() {
        const noiseFunctions = `
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
            vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
            vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
            i = mod289(i);
            vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
            vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
            vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
            vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m; return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }`;

        this.nodeShader = {
            vertexShader: noiseFunctions + `
            attribute float nodeSize; attribute float nodeType; attribute vec3 nodeColor; attribute float distanceFromRoot;
            uniform float uTime; uniform vec3 uPulsePositions[3]; uniform float uPulseTimes[3]; uniform float uPulseSpeed; uniform float uBaseNodeSize;
            varying vec3 vColor; varying float vNodeType; varying vec3 vPosition; varying float vPulseIntensity; varying float vDistanceFromRoot; varying float vGlow;
            float getPulseIntensity(vec3 worldPos, vec3 pulsePos, float pulseTime) {
                if (pulseTime < 0.0) return 0.0; float timeSinceClick = uTime - pulseTime;
                if (timeSinceClick < 0.0 || timeSinceClick > 4.0) return 0.0;
                float pulseRadius = timeSinceClick * uPulseSpeed; float distToClick = distance(worldPos, pulsePos);
                return smoothstep(3.0, 0.0, abs(distToClick - pulseRadius)) * smoothstep(4.0, 0.0, timeSinceClick);
            }
            void main() {
                vNodeType = nodeType; vColor = nodeColor; vDistanceFromRoot = distanceFromRoot;
                vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz; vPosition = worldPos;
                float totalPulseIntensity = 0.0;
                for (int i = 0; i < 3; i++) totalPulseIntensity += getPulseIntensity(worldPos, uPulsePositions[i], uPulseTimes[i]);
                vPulseIntensity = min(totalPulseIntensity, 1.0);
                float baseSize = nodeSize * (sin(uTime * 0.7 + distanceFromRoot * 0.15) * 0.15 + 0.85);
                vGlow = 0.5 + 0.5 * sin(uTime * 0.5 + distanceFromRoot * 0.2);
                vec3 modifiedPosition = position;
                if (nodeType > 0.5) modifiedPosition += normal * snoise(position * 0.08 + uTime * 0.08) * 0.15;
                vec4 mvPosition = modelViewMatrix * vec4(modifiedPosition, 1.0);
                gl_PointSize = baseSize * (1.0 + vPulseIntensity * 2.5) * uBaseNodeSize * (1000.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }`,
            fragmentShader: `
            uniform float uTime; uniform vec3 uPulseColors[3];
            varying vec3 vColor; varying float vNodeType; varying vec3 vPosition; varying float vPulseIntensity; varying float vDistanceFromRoot; varying float vGlow;
            void main() {
                vec2 center = 2.0 * gl_PointCoord - 1.0; float dist = length(center); if (dist > 1.0) discard;
                float glowStrength = pow(1.0 - smoothstep(0.0, 0.5, dist), 1.2) + (1.0 - smoothstep(0.0, 1.0, dist)) * 0.3;
                vec3 baseColor = vColor * (0.9 + 0.1 * sin(uTime * 0.6 + vDistanceFromRoot * 0.25));
                vec3 finalColor = baseColor;
                if (vPulseIntensity > 0.0) {
                    finalColor = mix(baseColor, mix(vec3(1.0), uPulseColors[0], 0.4), vPulseIntensity * 0.8) * (1.0 + vPulseIntensity * 1.2);
                    glowStrength *= (1.0 + vPulseIntensity);
                }
                finalColor += vec3(1.0) * smoothstep(0.4, 0.0, dist) * 0.3;
                float alpha = glowStrength * (0.95 - 0.3 * dist) * smoothstep(100.0, 15.0, length(vPosition - cameraPosition));
                if (vNodeType > 0.5) { finalColor *= 1.1; alpha *= 0.9; }
                gl_FragColor = vec4(finalColor * (1.0 + vGlow * 0.1), alpha);
            }`
        };

        this.connectionShader = {
            vertexShader: noiseFunctions + `
            attribute vec3 startPoint; attribute vec3 endPoint; attribute float connectionStrength; attribute float pathIndex; attribute vec3 connectionColor;
            uniform float uTime; uniform vec3 uPulsePositions[3]; uniform float uPulseTimes[3]; uniform float uPulseSpeed;
            varying vec3 vColor; varying float vConnectionStrength; varying float vPulseIntensity; varying float vPathPosition; varying float vDistanceFromCamera;
            float getPulseIntensity(vec3 worldPos, vec3 pulsePos, float pulseTime) {
                if (pulseTime < 0.0) return 0.0; float timeSinceClick = uTime - pulseTime;
                if (timeSinceClick < 0.0 || timeSinceClick > 4.0) return 0.0;
                return smoothstep(3.0, 0.0, abs(distance(worldPos, pulsePos) - timeSinceClick * uPulseSpeed)) * smoothstep(4.0, 0.0, timeSinceClick);
            }
            void main() {
                vPathPosition = position.x; vec3 midPoint = mix(startPoint, endPoint, 0.5);
                vec3 perpendicular = normalize(cross(normalize(endPoint - startPoint), vec3(0.0, 1.0, 0.0)));
                if (length(perpendicular) < 0.1) perpendicular = vec3(1.0, 0.0, 0.0);
                vec3 finalPos = mix(mix(startPoint, midPoint + perpendicular * sin(vPathPosition * 3.14159) * 0.15, vPathPosition), mix(midPoint + perpendicular * sin(vPathPosition * 3.14159) * 0.15, endPoint, vPathPosition), vPathPosition);
                finalPos += perpendicular * snoise(vec3(pathIndex * 0.08, vPathPosition * 0.6, uTime * 0.15)) * 0.12;
                vec3 worldPos = (modelMatrix * vec4(finalPos, 1.0)).xyz;
                float totalPulseIntensity = 0.0;
                for (int i = 0; i < 3; i++) totalPulseIntensity += getPulseIntensity(worldPos, uPulsePositions[i], uPulseTimes[i]);
                vPulseIntensity = min(totalPulseIntensity, 1.0);
                vColor = connectionColor; vConnectionStrength = connectionStrength; vDistanceFromCamera = length(worldPos - cameraPosition);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
            }`,
            fragmentShader: `
            uniform float uTime; uniform vec3 uPulseColors[3];
            varying vec3 vColor; varying float vConnectionStrength; varying float vPulseIntensity; varying float vPathPosition; varying float vDistanceFromCamera;
            void main() {
                float combinedFlow = ((sin(vPathPosition * 25.0 - uTime * 4.0) * 0.5 + 0.5) + (sin(vPathPosition * 15.0 - uTime * 2.5 + 1.57) * 0.5 + 0.5) * 0.5) / 1.5;
                vec3 baseColor = vColor * (0.8 + 0.2 * sin(uTime * 0.6 + vPathPosition * 12.0));
                float flowIntensity = 0.4 * combinedFlow * vConnectionStrength;
                vec3 finalColor = baseColor;
                if (vPulseIntensity > 0.0) {
                    finalColor = mix(baseColor, mix(vec3(1.0), uPulseColors[0], 0.3) * 1.2, vPulseIntensity * 0.7);
                    flowIntensity += vPulseIntensity * 0.8;
                }
                float alpha = mix(0.7 * vConnectionStrength + combinedFlow * 0.3, min(1.0, (0.7 * vConnectionStrength + combinedFlow * 0.3) * 2.5), vPulseIntensity);
                gl_FragColor = vec4(finalColor * (0.7 + flowIntensity + vConnectionStrength * 0.5), alpha * smoothstep(100.0, 15.0, vDistanceFromCamera));
            }`
        };
    }

    createNetworkVisualization(formationIndex, densityFactor = 1.0) {
        if (this.nodesMesh) {
            this.scene.remove(this.nodesMesh); this.nodesMesh.geometry.dispose(); this.nodesMesh.material.dispose();
            this.scene.remove(this.connectionsMesh); this.connectionsMesh.geometry.dispose(); this.connectionsMesh.material.dispose();
        }

        // Generating Sphere directly
        let nodes = [];
        let rootNode = { position: new THREE.Vector3(0,0,0), connections: [], level: 0, type: 0, size: 2.0, distanceFromRoot: 0, addConnection(n, s) { if(!this.connections.some(c=>c.node===n)) { this.connections.push({node:n, strength:s}); n.connections.push({node:this, strength:s}); } } };
        nodes.push(rootNode);
        const layers = 5;
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        for (let layer = 1; layer <= layers; layer++) {
            const radius = layer * 4;
            const numPoints = Math.floor(layer * 12 * densityFactor);
            for (let i = 0; i < numPoints; i++) {
                const phi = Math.acos(1 - 2 * (i + 0.5) / numPoints);
                const theta = 2 * Math.PI * i / goldenRatio;
                const pos = new THREE.Vector3(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi));
                const isLeaf = layer === layers || Math.random() < 0.3;
                const node = { position: pos, connections: [], level: layer, type: isLeaf?1:0, size: isLeaf?THREE.MathUtils.randFloat(0.5,1.0):THREE.MathUtils.randFloat(0.8,1.4), distanceFromRoot: radius, addConnection: rootNode.addConnection };
                nodes.push(node);
                if (layer > 1) {
                    const prevLayerNodes = nodes.filter(n => n.level === layer - 1 && n !== rootNode).sort((a, b) => pos.distanceTo(a.position) - pos.distanceTo(b.position));
                    for (let j = 0; j < Math.min(3, prevLayerNodes.length); j++) node.addConnection(prevLayerNodes[j], Math.max(0.3, 1.0 - (pos.distanceTo(prevLayerNodes[j].position) / (radius * 2))));
                } else rootNode.addConnection(node, 0.9);
            }
            const layerNodes = nodes.filter(n => n.level === layer && n !== rootNode);
            for (let i = 0; i < layerNodes.length; i++) {
                const node = layerNodes[i];
                const nearby = layerNodes.filter(n => n !== node).sort((a, b) => node.position.distanceTo(a.position) - node.position.distanceTo(b.position)).slice(0, 5);
                for (const nearNode of nearby) if (node.position.distanceTo(nearNode.position) < radius * 0.8 && !node.connections.some(c=>c.node===nearNode)) node.addConnection(nearNode, 0.6);
            }
        }

        const nodesGeometry = new THREE.BufferGeometry();
        const nodePositions = [], nodeTypes = [], nodeSizes = [], nodeColors = [], distancesFromRoot = [];
        const palette = this.colorPalettes[0];
        
        nodes.forEach((node) => {
            nodePositions.push(node.position.x, node.position.y, node.position.z);
            nodeTypes.push(node.type); nodeSizes.push(node.size); distancesFromRoot.push(node.distanceFromRoot);
            const baseColor = palette[Math.min(node.level, palette.length - 1) % palette.length].clone();
            baseColor.offsetHSL(THREE.MathUtils.randFloatSpread(0.03), THREE.MathUtils.randFloatSpread(0.08), THREE.MathUtils.randFloatSpread(0.08));
            nodeColors.push(baseColor.r, baseColor.g, baseColor.b);
        });
        nodesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
        nodesGeometry.setAttribute('nodeType', new THREE.Float32BufferAttribute(nodeTypes, 1));
        nodesGeometry.setAttribute('nodeSize', new THREE.Float32BufferAttribute(nodeSizes, 1));
        nodesGeometry.setAttribute('nodeColor', new THREE.Float32BufferAttribute(nodeColors, 3));
        nodesGeometry.setAttribute('distanceFromRoot', new THREE.Float32BufferAttribute(distancesFromRoot, 1));
        
        this.nodesMesh = new THREE.Points(nodesGeometry, new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(this.pulseUniforms),
            vertexShader: this.nodeShader.vertexShader, fragmentShader: this.nodeShader.fragmentShader,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        }));
        this.scene.add(this.nodesMesh);

        const connectionsGeometry = new THREE.BufferGeometry();
        const connectionColors = [], connectionStrengths = [], connectionPositions = [], startPoints = [], endPoints = [], pathIndices = [];
        const processedConnections = new Set();
        let pathIndex = 0;
        
        nodes.forEach((node, nodeIndex) => {
            node.connections.forEach(connection => {
                const connectedIndex = nodes.indexOf(connection.node);
                if (connectedIndex === -1) return;
                const key = [Math.min(nodeIndex, connectedIndex), Math.max(nodeIndex, connectedIndex)].join('-');
                if (!processedConnections.has(key)) {
                    processedConnections.add(key);
                    for (let i = 0; i < 20; i++) {
                        connectionPositions.push(i / 19, 0, 0);
                        startPoints.push(node.position.x, node.position.y, node.position.z);
                        endPoints.push(connection.node.position.x, connection.node.position.y, connection.node.position.z);
                        pathIndices.push(pathIndex); connectionStrengths.push(connection.strength);
                        const baseColor = palette[Math.min(Math.floor((node.level + connection.node.level) / 2), palette.length - 1) % palette.length].clone();
                        baseColor.offsetHSL(THREE.MathUtils.randFloatSpread(0.03), THREE.MathUtils.randFloatSpread(0.08), THREE.MathUtils.randFloatSpread(0.08));
                        connectionColors.push(baseColor.r, baseColor.g, baseColor.b);
                    }
                    pathIndex++;
                }
            });
        });
        connectionsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(connectionPositions, 3));
        connectionsGeometry.setAttribute('startPoint', new THREE.Float32BufferAttribute(startPoints, 3));
        connectionsGeometry.setAttribute('endPoint', new THREE.Float32BufferAttribute(endPoints, 3));
        connectionsGeometry.setAttribute('connectionStrength', new THREE.Float32BufferAttribute(connectionStrengths, 1));
        connectionsGeometry.setAttribute('connectionColor', new THREE.Float32BufferAttribute(connectionColors, 3));
        connectionsGeometry.setAttribute('pathIndex', new THREE.Float32BufferAttribute(pathIndices, 1));
        
        this.connectionsMesh = new THREE.LineSegments(connectionsGeometry, new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(this.pulseUniforms),
            vertexShader: this.connectionShader.vertexShader, fragmentShader: this.connectionShader.fragmentShader,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        }));
        this.scene.add(this.connectionsMesh);

        palette.forEach((color, i) => {
            if (i < 3) {
                this.connectionsMesh.material.uniforms.uPulseColors.value[i].copy(color);
                this.nodesMesh.material.uniforms.uPulseColors.value[i].copy(color);
            }
        });
    }

    onResize() {
        if (!this.canvas) return;
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
        this.composer.setSize(width, height);
        this.bloomPass.resolution.set(width, height);
    }

    animate() {
        this._raf = requestAnimationFrame(() => this.animate());
        // Only render if container is visible
        if (this.canvas.parentElement.clientWidth === 0) return;
        
        const t = this.clock.getElapsedTime();
        if (this.nodesMesh) {
            this.nodesMesh.material.uniforms.uTime.value = t;
            this.nodesMesh.rotation.y = Math.sin(t * 0.04) * 0.05;
        }
        if (this.connectionsMesh) {
            this.connectionsMesh.material.uniforms.uTime.value = t;
            this.connectionsMesh.rotation.y = Math.sin(t * 0.04) * 0.05;
        }
        this.starField.rotation.y += 0.0002;
        this.starField.material.uniforms.uTime.value = t;
        
        this.controls.update();
        this.composer.render();
    }

    dispose() {
        if (this._raf) cancelAnimationFrame(this._raf);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.nodesMesh) { this.nodesMesh.geometry.dispose(); this.nodesMesh.material.dispose(); }
        if (this.connectionsMesh) { this.connectionsMesh.geometry.dispose(); this.connectionsMesh.material.dispose(); }
        if (this.starField) { this.starField.geometry.dispose(); this.starField.material.dispose(); }
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        console.log("🧹 NeuralBackground disposed");
    }
}

// Global hook
window.initNeuralBackground = function(canvasId) {
    return new NeuralBackground(canvasId);
};
