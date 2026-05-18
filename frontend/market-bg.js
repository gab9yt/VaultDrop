class MarketBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        if (!this.gl) {
            console.error("WebGL not supported");
            return;
        }

        // Resize observer
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.canvas.parentElement);

        this.mouseX = -1.0;
        this.mouseY = -1.0;

        this.initShaders();
        this.resize();
        
        // Start loop
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initShaders() {
        const vertexShaderSource = `
        attribute vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }`;

        const fragmentShaderSource = `
        #ifdef GL_ES
        precision highp float;
        #endif
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform float u_time;
        
        vec3 palette_fire(float t, float factor) {
            vec3 a = vec3(0.5, 0.1, 0.0);
            vec3 b = vec3(0.6, 0.3, 0.1);
            vec3 c = vec3(1.0, 1.0, 0.0);
            vec3 d = vec3(0.8, 0.7, 0.2);
           
            a += 0.1 * sin(vec3(0.1, 0.2, 0.3) * factor);
            b += 0.2 * cos(vec3(0.2, 0.3, 0.1) * factor);
           
            return a + b * cos(6.28318 * (c * t + d));
        }
        
        void main() {
            vec2 st = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
            st.x *= u_resolution.x / u_resolution.y;
            vec3 color = vec3(0.0);
            
            // Correction de l'inversion de la souris
            // u_mouse.y a (0) en haut, u_resolution.y a (0) en bas.
            vec2 mouse_st = vec2(u_mouse.x, u_resolution.y - u_mouse.y) / u_resolution.xy;
            mouse_st = mouse_st * 2.0 - 1.0; // on a retiré le * vec2(1.0, -1.0) qui inversait la souris
            mouse_st.x *= u_resolution.x / u_resolution.y;
           
            vec2 mouse_vec = st - mouse_st;
            float mouse_dist = length(mouse_vec);
            float mouse_push = smoothstep(0.7, 0.0, mouse_dist) * 0.5;
           
            if (u_mouse.x > 0.0) {
                st += normalize(mouse_vec) * mouse_push;
            }
            float R_global = length(st);
            float angle_global = atan(st.y, st.x);
            float twist = 0.5 * sin(R_global * 3.0 - u_time * 0.4);
            st *= mat2(cos(twist), sin(twist), -sin(twist), cos(twist));
            for (float i = 1.0; i < 6.0; i++) {
                vec2 st0 = st;
                float sgn = 1.0 - 2.0 * mod(i, 2.0);
               
                float t = u_time * 0.02 - float(i);
                st0 *= mat2(cos(t), sin(t), -sin(t), cos(t));
               
                float R = length(st0);
                float d = R * i;
                float angle = atan(st0.y, st0.x);
                float num_arms = 4.0 + 3.0 * sin(u_time * 0.1 + i);
                float angle_warped = angle * num_arms;
                float dist_warp_factor = 1.0 + 0.3 * sin(angle * 12.0 + u_time * 0.5 - i);
                float d_warped = d * dist_warp_factor;
               
                vec3 pal = palette_fire(-exp((length(d_warped) * -0.9)), abs(d_warped) * 0.4);
                float radial = exp(-R);
                radial *= smoothstep(1.2, 0.5, R);
                pal *= radial;
                float phase = -(d_warped + sgn * angle_warped) + u_time * 0.3;
               
                float v = sin(phase);
                v = max(abs(v), 0.01);
                float w = pow(0.02 / v, 0.8);
                color += pal * w;
            }
            gl_FragColor = vec4(color, 1.0);
        }`;

        const createShader = (gl, type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('An error occurred compiling the shaders:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vertexShader = createShader(this.gl, this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = createShader(this.gl, this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        const positions = [
            -1.0, -1.0,
             1.0, -1.0,
            -1.0, 1.0,
             1.0, 1.0,
        ];
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

        this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(this.positionLocation);
        this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 0, 0);

        this.resolutionLocation = this.gl.getUniformLocation(this.program, 'u_resolution');
        this.timeLocation = this.gl.getUniformLocation(this.program, 'u_time');
        this.mouseLocation = this.gl.getUniformLocation(this.program, 'u_mouse');
    }

    resize() {
        if (!this.canvas) return;
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        
        const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        
        this.canvas.width = Math.floor(width * devicePixelRatio);
        this.canvas.height = Math.floor(height * devicePixelRatio);
        this.canvas.style.width = width + "px";
        this.canvas.style.height = height + "px";
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    animate(time) {
        this._raf = requestAnimationFrame(this.animate);
        if (this.canvas.parentElement.clientWidth === 0) return;

        this.gl.useProgram(this.program);
        
        const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        
        this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
        this.gl.uniform1f(this.timeLocation, time * 0.001);
        
        if (this.mouseX > -1) {
            this.gl.uniform2f(this.mouseLocation, this.mouseX * devicePixelRatio, this.mouseY * devicePixelRatio);
        } else {
            this.gl.uniform2f(this.mouseLocation, -1.0, -1.0);
        }
               
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    dispose() {
        if (this._raf) cancelAnimationFrame(this._raf);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        // Forcer la perte du contexte WebGL pour libérer la mémoire
        const ext = this.gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
        console.log("🧹 MarketBackground disposed");
    }
}

// Global hook
window.initMarketBackground = function(canvasId) {
    return new MarketBackground(canvasId);
};
