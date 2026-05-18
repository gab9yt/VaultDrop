import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// Imports Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// ==========================================
// MOTEUR DE RENDU UNIQUE (SHARED RENDERER)
// ==========================================
class MainRenderer {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = "main-shared-canvas";
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none'; 
        this.canvas.style.zIndex = '2';
        document.body.appendChild(this.canvas);

        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas, 
            antialias: true, 
            alpha: true,
            preserveDrawingBuffer: true 
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setScissorTest(true);

        this.views = []; 
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);

        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    register(view) {
        if (!this.views.includes(view)) this.views.push(view);
    }

    unregister(view) {
        this.views = this.views.filter(v => v !== view);
    }

    animate() {
        requestAnimationFrame(this.animate);
        
        // NETTOYAGE TOTAL
        this.renderer.setScissorTest(false);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.clear();
        this.renderer.setScissorTest(true);

        this.views.forEach(view => {
            if (!view.container) return;

            // VÉRIFICATION DE VISIBILITÉ RADICALE
            const rect = view.container.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 && 
                              view.container.offsetParent !== null &&
                              window.getComputedStyle(view.container).display !== 'none' &&
                              window.getComputedStyle(view.container).visibility !== 'hidden';

            if (!isVisible) return;

            // Vérifier si un parent est caché (cas des vues)
            let parent = view.container.parentElement;
            while (parent) {
                if (window.getComputedStyle(parent).display === 'none') return;
                parent = parent.parentElement;
            }

            // Vérifier si l'élément est dans le viewport
            if (rect.bottom < 0 || rect.top > window.innerHeight ||
                rect.right < 0 || rect.left > window.innerWidth) return;

            const width = rect.width;
            const height = rect.height;
            const left = rect.left;
            const bottom = window.innerHeight - rect.bottom;

            view.camera.aspect = width / height;
            view.camera.updateProjectionMatrix();

            this.renderer.setViewport(left, bottom, width, height);
            this.renderer.setScissor(left, bottom, width, height);
            
            if (view.autoRotate && view.pivot) view.pivot.rotation.y += 0.008;
            if (view.controls && view.controls.enabled) view.controls.update();
            
            this.renderer.render(view.scene, view.camera);
        });
    }
}

const GLOBAL_RENDERER = new MainRenderer();

class SceneManager {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
        this.camera.position.z = options.camZ || 5;
        
        this.controls = new OrbitControls(this.camera, this.container);
        this.controls.enableDamping = true;
        this.controls.enabled = options.interactive || false;
        this.controls.zoomSpeed = 0.5;
        
        // LIMITES DE ZOOM POUR ÉVITER LA DISPARITION
        this.controls.minDistance = 2.5; 
        this.controls.maxDistance = 12.0;
        
        this.autoRotate = options.autoRotate || false;
        this.initLights();
        
        GLOBAL_RENDERER.register(this);
    }

    initLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 2));
        const d = new THREE.DirectionalLight(0xffffff, 2);
        d.position.set(5, 10, 7.5);
        this.scene.add(d);
    }

    async loadModel(url, scaleFactor = 1, isBox = false) {
        if (!url) return;
        const loader = new GLTFLoader();
        return new Promise((resolve) => {
            loader.load(encodeURI(url), (gltf) => {
                this.model = gltf.scene;
                this.pivot = new THREE.Group();
                this.scene.add(this.pivot);

                const box = new THREE.Box3().setFromObject(this.model);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z) || 1;
                const baseSize = isBox ? 2.8 : 3.5;
                const scale = (baseSize / maxDim) * scaleFactor;
                
                this.model.scale.set(scale, scale, scale);
                const scaledBox = new THREE.Box3().setFromObject(this.model);
                const center = scaledBox.getCenter(new THREE.Vector3());
                this.model.position.sub(center);
                
                this.pivot.add(this.model);
                this.pivot.rotation.set(0.3, -0.4, 0);
                resolve(gltf);
            }, undefined, () => resolve(null));
        });
    }

    dispose() {
        GLOBAL_RENDERER.unregister(this);
        this.scene.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    }
}

class KineticApp {
    constructor() {
        this.scenes = {};
        this.boxes = {};
        this.BOX_MODELS = {
            "Caisse Alpha": "/static/boxes/boxesstyle/alpha case.glb",
            "Caisse Startup": "/static/boxes/boxesstyle/caisse startup.glb",
            "Commun": "/static/boxes/boxesstyle/commun.glb",
            "Caisse Beta": "/static/boxes/boxesstyle/caisse beta.glb",
            "Caisse Dragon": "/static/boxes/boxesstyle/caisse dragon.glb",
            "Caisse Neon": "/static/boxes/boxesstyle/caisse neon.glb",
            "Caisse Cobalt": "/static/boxes/boxesstyle/caisse cobalt.glb",
            "Caisse Vintage": "/static/boxes/boxesstyle/caisse vintage.glb",
            "Caisse Tech": "/static/boxes/boxesstyle/caisse rare.glb",
            "Caisse Azure": "/static/boxes/boxesstyle/caisse azur.glb",
            "Caisse Mystere": "/static/boxes/boxesstyle/caisse mystere.glb",
            "Epique": "/static/boxes/boxesstyle/caisse epic.glb",
            "Rare": "/static/boxes/boxesstyle/caisse tech.glb",
            "Caisse Nucleaire": "", // Pas encore de modèle
            "Caisse Prismatique": "", 
            "Legendaire": ""
        };
        this.BOX_SCALES = { "Caisse Mystere": 0.6, "Caisse Alpha": 1.2 };
        this.init();
    }

    async init() {
        this.initNavigation();
        await this.syncAndBuildMarket();
    }

    async syncAndBuildMarket() {
        try {
            const r = await fetch('/api/boxes');
            if (r.ok) { 
                const data = await r.json();
                this.boxes = data;
            }
        } catch (e) { 
            console.warn("API non détectée.");
        }
        
        await this.renderMarketHTML();
        
        this.scenes['box-detail'] = new SceneManager('box-detail-3d', { camZ: 5, interactive: true });
        this.scenes['skin-detail'] = new SceneManager('skin-detail-3d', { camZ: 3, interactive: true });
        
        const names = Object.keys(this.BOX_MODELS);
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const rid = `box-scene-${i}`;
            const url = this.BOX_MODELS[name];
            
            if (url) {
                this.scenes[rid] = new SceneManager(rid, { autoRotate: true });
                await this.scenes[rid].loadModel(url, this.BOX_SCALES[name] || 1.1, true);
                await new Promise(r => setTimeout(r, 100));
            }
        }

        if (this.onReadyCallback) this.onReadyCallback();
    }

    async renderMarketHTML() {
        const gallery = document.getElementById('boxes-gallery');
        if (!gallery) return;
        gallery.innerHTML = '';
        
        const sortedNames = Object.keys(this.BOX_MODELS);
        sortedNames.forEach((name, i) => {
            const rid = `box-scene-${i}`;
            const card = document.createElement('div');
            card.className = 'box-card';
            card.innerHTML = `
                <div class="box-render-area" id="${rid}"></div>
                <div class="box-info">
                    <h3 class="box-title">${name}</h3>
                </div>`;
            card.onclick = () => this.showBoxDetails(name, i);
            gallery.appendChild(card);
        });
    }

    showView(v) {
        // Fondu de sortie pour tous les fonds
        document.querySelectorAll('.bg-canvas').forEach(c => c.classList.remove('active'));
        
        document.querySelectorAll('.view').forEach(x => x.classList.add('hidden'));
        const target = document.getElementById(v);
        if (target) {
            target.classList.remove('hidden');
            target.scrollTop = 0; // On remonte en haut de la page
        }
        
        this._initBackground(v);
    }

    _initBackground(viewId) {
        let canvasId = null;
        let bgKey = null;
        let initFn = null;

        if (viewId === 'inventory-view') { canvasId = 'neural-bg-canvas'; bgKey = '_neuralBg'; initFn = window.initNeuralBackground; }
        if (viewId === 'market-view') { canvasId = 'market-bg-canvas'; bgKey = '_marketBg'; initFn = window.initMarketBackground; }
        if (viewId === 'box-detail-view') { canvasId = 'pyramid-bg-canvas'; bgKey = '_pyramidBg'; initFn = window.initPyramidBackground; }
        if (viewId === 'grid-content-view') { canvasId = 'grid-bg-canvas'; bgKey = '_gridBg'; initFn = window.initGridBackground; }

        if (canvasId && bgKey && initFn) {
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                // On active le fondu d'entrée
                setTimeout(() => canvas.classList.add('active'), 50);
            }

            if (!this[bgKey]) {
                this[bgKey] = initFn(canvasId);
            } else if (this[bgKey].onResize) {
                this[bgKey].onResize();
            }
        }
    }

    async showBoxDetails(name, index) {
        this.showView('box-detail-view');
        
        const title = document.getElementById('box-detail-title');
        if (title) title.innerText = name;

        const sourceScene = this.scenes[`box-scene-${index}`];
        const detailScene = this.scenes['box-detail'];
        
        if (sourceScene && sourceScene.model && detailScene) {
            // DÉSACTIVER LE ZOOM sur la caisse
            detailScene.controls.enableZoom = false;
            
            if (detailScene.pivot) detailScene.scene.remove(detailScene.pivot);
            detailScene.pivot = sourceScene.pivot.clone();
            
            // DÉZOOM : On réduit l'échelle pour que la caisse soit plus petite et ne gêne pas le texte
            detailScene.pivot.scale.set(0.7, 0.7, 0.7); 
            
            detailScene.scene.add(detailScene.pivot);
        }

        // Charger directement la liste des skins en dessous
        await this.renderSkinsGrid(name);
    }

    async renderSkinsGrid(boxName) {
        const container = document.getElementById('skins-grid-container');
        if (!container) return;
        container.innerHTML = '';

        // On cherche la caisse dans les données API
        const box = this.boxes.find(b => b.name === boxName) || { skins: [] };
        
        box.skins.forEach((s, idx) => {
            const rid = `grid-skin-${idx}`;
            const c = document.createElement('div');
            c.className = 'skin-card-small';
            c.innerHTML = `
                <div class="skin-img-placeholder" id="${rid}"></div>
                <div class="skin-info-mini">
                    <span class="skin-name">${s.name}</span>
                    <span class="skin-rarity ${s.rarity.toLowerCase()}">${s.rarity}</span>
                </div>
            `;
            c.onclick = () => this.showSkinDetails(s);
            container.appendChild(c);
            
            // Rendu 3D progressif pour ne pas faire ramer le scroll
            setTimeout(() => {
                if (document.getElementById('box-detail-view').classList.contains('hidden')) return;
                const url = `/static/boxes/${s.box_name}/${s.filename}`;
                if (!this.scenes[rid]) {
                    this.scenes[rid] = new SceneManager(rid, { camZ: 4 });
                }
                this.scenes[rid].loadModel(url, 1, false);
            }, idx * 100);
        });
    }

    async showSkinDetails(skin) {
        this.showView('skin-detail-view');
        document.getElementById('skin-name-display').innerText = skin.name;
        const url = `/static/boxes/${skin.box_name}/${skin.filename}`;
        await this.scenes['skin-detail'].loadModel(url);
    }

    initNavigation() {
        document.querySelectorAll('.back-btn').forEach(b => b.onclick = () => this.showView(b.dataset.target));
        document.querySelectorAll('.nav-links a').forEach(l => {
            l.onclick = (e) => {
                e.preventDefault();
                document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
                l.parentElement.classList.add('active');
                this.showView(l.getAttribute('href').substring(1) + '-view');
            };
        });
    }
}

// ==========================================
// CONFIGURATION FIREBASE & AUTHENTIFICATION
// ==========================================
const firebaseConfig = {
    apiKey: "A_REMPLIR",
    authDomain: "A_REMPLIR.firebaseapp.com",
    projectId: "A_REMPLIR",
    storageBucket: "A_REMPLIR.appspot.com",
    messagingSenderId: "A_REMPLIR",
    appId: "A_REMPLIR"
};

let auth = null;
try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
} catch (e) {}

window.addEventListener('DOMContentLoaded', () => {
    const landingContainer = document.getElementById('landing-container');
    const loadingContainer = document.getElementById('loading-container');
    const appContainer = document.getElementById('app-container');
    
    document.getElementById('btn-initiate').addEventListener('click', () => {
        landingContainer.classList.add('hidden');
        loadingContainer.classList.remove('hidden');

        const app = new KineticApp();
        app.onReadyCallback = () => {
            loadingContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            window.dispatchEvent(new Event('resize'));
        };
    });
});
