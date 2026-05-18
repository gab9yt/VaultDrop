class GridBackground {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // On utilise p5 en mode "Instance" pour ne pas polluer le scope global
        this.instance = new p5((p) => {
            let f = 0;
            let currentTheme = 'cosmic';
            let currentPatternIndex = 0;
            
            const shapePatterns = [
                { sides: 100, innerRadiusFactor: 1.0 }, 
                { sides: 3, innerRadiusFactor: 1.0 },   
                { sides: 10, innerRadiusFactor: 0.45 }  
            ];
            
            let targetShape = shapePatterns[currentPatternIndex];
            let currentShape = { sides: targetShape.sides, innerRadiusFactor: targetShape.innerRadiusFactor };

            const colorThemes = {
                cosmic: (f, i, layer, t) => {
                    const hue = (f + i * 2 + layer * 40) % 360;
                    const bright = p.map(p.sin(t * p.TWO_PI * 4 + f / 20), -1, 1, 70, 100);
                    return p.color(hue, 80 + layer * 4, bright);
                },
                solar: (f, i, layer, t) => {
                    const hue = p.map(p.noise(i * 0.1, layer * 0.2, f * 0.005), 0, 1, 0, 60); 
                    const bright = p.map(p.sin(t * p.TWO_PI * 3 + f / 30), -1, 1, 80, 100);
                    return p.color(hue, 95, bright);
                },
                nebula: (f, i, layer, t) => {
                    const hue = p.map(p.noise(i * 0.1, layer * 0.2, f * 0.005), 0, 1, 180, 300); 
                    const bright = p.map(p.cos(t * p.TWO_PI * 4 + f / 25), -1, 1, 75, 100);
                    return p.color(hue, 100, bright);
                }
            };

            p.setup = () => {
                let canvas = p.createCanvas(this.container.clientWidth, this.container.clientHeight);
                canvas.parent(this.container);
                p.colorMode(p.HSB, 360, 100, 100, 1);
                
                // On change de forme automatiquement toutes les 3 secondes
                setInterval(() => {
                    currentPatternIndex = (currentPatternIndex + 1) % shapePatterns.length;
                    targetShape = shapePatterns[currentPatternIndex];
                }, 3000);
            };

            p.draw = () => {
                p.clear(); // Important pour la transparence
                p.background(280, 50, 5, 0.15); 
                p.noStroke();

                const lerpAmount = 0.04;
                currentShape.sides = p.lerp(currentShape.sides, targetShape.sides, lerpAmount);
                currentShape.innerRadiusFactor = p.lerp(currentShape.innerRadiusFactor, targetShape.innerRadiusFactor, lerpAmount);
                
                const dim = p.min(p.width, p.height);
                const baseSize = dim / 25;
                const pathSize = (dim / 2.3);
                
                for (let layer = 0; layer < 5; layer++) {
                    const layerScale = 0.4 + layer * 0.15;
                    const particleCount = 50 + layer * 10; 
                    const rotation = f / 100 * (layer % 2 === 0 ? 1 : -1);
                    
                    for (let i = 0; i < particleCount; i++) {
                        const t = (i / particleCount) + f / 200;
                        const wave1 = p.sin(t * p.TWO_PI * 2 + f / 40) * dim * 0.02;
                        const wave2 = p.cos(t * p.TWO_PI * 3 - f / 50) * dim * 0.02;
                        
                        let [x, y] = this.getShapePoint(p, t, pathSize * layerScale, currentShape.sides, rotation, currentShape.innerRadiusFactor);
                        x += wave1 + p.width / 2;
                        y += wave2 + p.height / 2;
                        
                        const s = baseSize * (0.6 + 0.4 * p.sin(t * p.TWO_PI * 5 + f / 30)) * layerScale;
                        p.fill(colorThemes[currentTheme](f, i, layer, t));
                        p.ellipse(x, y, s, s);
                    }
                }
                f++;
            };

            p.windowResized = () => {
                p.resizeCanvas(this.container.clientWidth, this.container.clientHeight);
            };
        });
    }

    getShapePoint(p, t, radius, sides, rotation, innerRadiusFactor) {
        t = t % 1;
        const fullSegment = p.floor(t * sides);
        const segmentT = (t * sides) % 1;
        const angle1 = (fullSegment / sides) * p.TWO_PI + rotation;
        const angle2 = ((fullSegment + 1) / sides) * p.TWO_PI + rotation;
        const r1 = (fullSegment % 2 === 0) ? radius : radius * innerRadiusFactor;
        const r2 = ((fullSegment + 1) % 2 === 0) ? radius : radius * innerRadiusFactor;
        const x = p.lerp(p.cos(angle1) * r1, p.cos(angle2) * r2, segmentT);
        const y = p.lerp(p.sin(angle1) * r1, p.sin(angle2) * r2, segmentT);
        return [x, y];
    }

    onResize() {
        // p5 gère déjà le redimensionnement via windowResized
    }

    dispose() {
        if (this.instance) this.instance.remove();
    }
}

window.initGridBackground = (id) => new GridBackground(id);
