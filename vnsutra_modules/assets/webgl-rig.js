const GRID_COLS = 24;
const GRID_ROWS = 32;

const VS_SOURCE = `#version 300 es
precision highp float;

in vec2 aPos; // normalized [0..1] across quad

uniform int uMode;        // 0=organ quad, 1=back_hair, 2=lower_body, 3=upper_clothes, 4=skin_canvas, 5=front_hair
uniform vec2 uCanvasSize; // pixel dimensions (W, H)
uniform vec4 uUvRect;     // normalized texture rect (u0, v0, u1, v1)
uniform vec4 uStageRect;  // organ target quad in stage coords (cx, cy, w, h)
uniform vec2 uBodyDelta;  // (bodyDx, bodyDy)
uniform vec2 uWaist;      // waist pivot px
uniform vec2 uNeck;       // neck pivot px
uniform vec2 uHead;       // head/crown pivot px
uniform vec4 uRigParams;  // (breath, hRot, hDy, fRot)
uniform vec4 uHairSpan;   // (hairSplitY, hairBottomY, windPhase, windAmp)
uniform vec4 uGaze;       // (headShiftX, headShiftY, eyeAngleRad, scaleY)

out vec2 vTexCoord;
out vec2 vLocalUv;

vec2 rotAround(vec2 p, vec2 pivot, float ang) {
    float c = cos(ang);
    float s = sin(ang);
    vec2 d = p - pivot;
    return pivot + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
}

void main() {
    vLocalUv = aPos;
    vTexCoord = mix(uUvRect.xy, uUvRect.zw, aPos);

    float W = uCanvasSize.x;
    float H = uCanvasSize.y;
    float breath = uRigParams.x;
    float hRot = uRigParams.y;
    float hDy = uRigParams.z;
    float fRot = uRigParams.w;
    float splitY = uHairSpan.x;
    float hairBotY = max(splitY + 120.0, uHairSpan.y);
    float phase = uHairSpan.z;
    float windAmp = uHairSpan.w;
    float gX = uGaze.x;
    float gY = uGaze.y;
    float eyeAng = uGaze.z;
    float sy = uGaze.w;

    vec2 p;
    float headCrownY = mix(uHead.y, uNeck.y, 0.35);
    if (uMode == 0) {
        // Organ quad centered on uStageRect.xy rotated by eyeAng and squashed vertically by sy
        vec2 local = (aPos - 0.5) * uStageRect.zw;
        local.y *= sy;
        vec2 rLocal = rotAround(local, vec2(0.0), eyeAng);
        p = uStageRect.xy + rLocal;
        p += vec2(gX, gY);
        p.y += hDy;
        p = rotAround(p, uNeck, hRot);
    } else {
        p = aPos * uCanvasSize;

        if (uMode == 1) {
            // Back hair: zero parallax shear at/below hairSplitY so shoulders & hair seams stay locked
            float hW = 1.0 - smoothstep(headCrownY, max(headCrownY + 20.0, splitY), p.y);
            p += vec2(-0.30 * gX, -0.20 * gY) * hW;
            p.y += hDy;
            p = rotAround(p, uNeck, hRot);
            p = rotAround(p, uHead, fRot);

            float tailU = clamp((p.y - splitY) / (hairBotY - splitY), 0.0, 1.0);
            float bendMask = tailU * tailU;
            float sCurve = sin(phase - tailU * 2.5) * 0.65 + sin(phase * 1.75 - tailU * 4.1) * 0.35;
            p.x += bendMask * windAmp * (sCurve * 7.5 + sin(phase * 0.6) * 2.5);
        } else if (uMode == 2) {
            // Lower body: keep feet grounded near H, allow subtle skirt breeze below waist
            float skirtSpan = max(120.0, (H * 0.90) - uWaist.y);
            float uSkirt = clamp((p.y - uWaist.y) / skirtSpan, 0.0, 1.0);
            float groundLock = 1.0 - smoothstep(0.76, 0.95, aPos.y);
            float flutter = uSkirt * uSkirt * groundLock;
            p.x += flutter * windAmp * sin(phase * 1.15 - uSkirt * 2.2) * 3.8;
        } else if (uMode == 3) {
            // Upper clothes: localized ribcage breathing with zero displacement at neck/shoulders and waist seam
            vec2 d = p - uWaist;
            float chestCenterY = mix(uNeck.y, uWaist.y, 0.50);
            float dyChest = (p.y - chestCenterY) / max(80.0, uWaist.y - uNeck.y);
            float waistPin = 1.0 - smoothstep(mix(uNeck.y, uWaist.y, 0.72), uWaist.y, p.y);
            float shoulderPin = smoothstep(uNeck.y - 10.0, mix(uNeck.y, uWaist.y, 0.35), p.y);
            float ribWeight = exp(-dyChest * dyChest * 2.4) * waistPin * shoulderPin;
            p.x += sign(d.x) * min(abs(d.x) / max(1.0, W * 0.25), 1.0) * breath * 1.3 * ribWeight;
            p.y -= breath * 0.65 * ribWeight;
        } else if (uMode == 4) {
            // Skin canvas: keep neck base/collar anchored cleanly at uNeck.y while tilting upper head & skull
            float skullGaze = 1.0 - smoothstep(headCrownY, max(headCrownY + 20.0, uNeck.y - 10.0), p.y);
            float neckBlend = 1.0 - smoothstep(uNeck.y - 10.0, uNeck.y + 35.0, p.y);
            p += vec2(gX, gY) * skullGaze;
            p.y += hDy * neckBlend;
            p = rotAround(p, uNeck, hRot * neckBlend);
        } else if (uMode == 5) {
            // Front hair: foreground parallax strictly on upper head/bangs, vanishing smoothly before hairSplitY
            float hW = 1.0 - smoothstep(headCrownY, max(headCrownY + 20.0, splitY), p.y);
            p += vec2(0.45 * gX, 0.35 * gY) * hW;
            p.y += hDy;
            p = rotAround(p, uNeck, hRot);
            p = rotAround(p, uHead, fRot);

            float tipU = clamp((p.y - uHead.y) / max(140.0, splitY - uHead.y), 0.0, 1.0);
            float sideDist = abs(p.x - uHead.x) / max(80.0, W * 0.22);
            float strandWeight = tipU * tipU * clamp(sideDist, 0.2, 1.0) * hW;
            p.x += strandWeight * windAmp * sin(phase + 0.4 - tipU * 1.6) * 2.2;
        }
    }

    p += uBodyDelta;

    vec2 ndc = vec2(
        (p.x / W) * 2.0 - 1.0,
        1.0 - (p.y / H) * 2.0
    );
    gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const FS_SOURCE = `#version 300 es
precision highp float;

in vec2 vTexCoord;
in vec2 vLocalUv;

uniform sampler2D uTex;
uniform sampler2D uTexPrev;
uniform int uLashMode;   // 0=normal texture sample, 1=procedural closed-eye lash curve
uniform vec4 uLashColor; // premultiplied rgba
uniform float uAlpha;    // premultiplied opacity multiplier [0..1]
uniform float uMorphMix; // >= 0 mixes uTexPrev -> uTex per-pixel with zero alpha dip
uniform vec4 uTint;      // rgb ambient tint + strength [0..1]

out vec4 outColor;

void main() {
    if (uLashMode == 1) {
        // Soft anti-aliased quadratic eyelash crease across local UV [0..1]
        float nx = (vLocalUv.x - 0.5) * 2.0; // -1..1
        float ny = vLocalUv.y;               // 0..1
        float curveY = 0.50 + 0.14 * (1.0 - nx * nx);
        float dist = abs(ny - curveY);
        float edgeMask = 1.0 - smoothstep(0.08, 0.22, dist);
        float taper = 1.0 - smoothstep(0.75, 1.0, abs(nx));
        float a = edgeMask * taper * uAlpha;
        if (a <= 0.002) discard;
        vec3 lashRgb = uLashColor.rgb * mix(vec3(1.0), uTint.rgb, uTint.a);
        outColor = vec4(lashRgb, uLashColor.a) * a;
        return;
    }

    vec4 col = texture(uTex, vTexCoord);
    if (uMorphMix >= 0.0) {
        col = mix(texture(uTexPrev, vTexCoord), col, uMorphMix);
    }
    col *= uAlpha;
    if (col.a <= 0.002) discard;
    col.rgb *= mix(vec3(1.0), uTint.rgb, uTint.a);
    outColor = col;
}
`;

/**
 * Evaluate C2 quintic smootherstep and non-dipping asymmetric dissolve curves.
 * @param {number} morphT Linear progress [0..1]
 * @returns {{ active: boolean, s: number, prevAlpha: number, nextAlpha: number, eyeCushion: number }}
 */
function evalMorphCurve(morphT) {
    const t = Math.min(1, Math.max(0, morphT));
    const s = t * t * t * (t * (t * 6 - 15) + 10);
    return {
        active: s < 0.999,
        s,
        prevAlpha: 1 - s * s,
        nextAlpha: s * (2 - s),
        eyeCushion: 1 - 0.10 * Math.sin(Math.PI * s)
    };
}

function buildMeshGeometry(gl, aPosLoc) {
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    const verts = new Float32Array((cols + 1) * (rows + 1) * 2);
    let vi = 0;
    for (let r = 0; r <= rows; r++) {
        const v = r / rows;
        for (let c = 0; c <= cols; c++) {
            verts[vi++] = c / cols;
            verts[vi++] = v;
        }
    }

    const indices = new Uint16Array(cols * rows * 6);
    let ii = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i0 = r * (cols + 1) + c;
            const i1 = i0 + 1;
            const i2 = i0 + (cols + 1);
            const i3 = i2 + 1;
            indices[ii++] = i0;
            indices[ii++] = i2;
            indices[ii++] = i1;
            indices[ii++] = i1;
            indices[ii++] = i2;
            indices[ii++] = i3;
        }
    }

    const meshVao = gl.createVertexArray();
    gl.bindVertexArray(meshVao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    const quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    const quadVerts = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const qVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    return {
        meshVao,
        quadVao,
        vbo,
        ebo,
        qVbo,
        meshIndexCount: indices.length
    };
}

function compileProgram(gl) {
    const compile = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const msg = gl.getShaderInfoLog(sh) || "Shader compile error";
            gl.deleteShader(sh);
            throw new Error(msg);
        }
        return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VS_SOURCE);
    const fs = compile(gl.FRAGMENT_SHADER, FS_SOURCE);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const msg = gl.getProgramInfoLog(prog) || "Program link error";
        gl.deleteProgram(prog);
        throw new Error(msg);
    }
    return prog;
}

function parseHexRgba(hex) {
    const clean = String(hex || "#3a2220").replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) || 58;
    const g = parseInt(clean.slice(2, 4), 16) || 34;
    const b = parseInt(clean.slice(4, 6), 16) || 32;
    return [r / 255, g / 255, b / 255, 1.0];
}

/**
 * Hardware WebGL2 mesh renderer for RiggedOutfit.
 * Falls back gracefully by returning `null` from `tryCreate` when WebGL2 is unavailable.
 */
class WebGLRigRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {WebGL2RenderingContext} gl
     */
    constructor(canvas, gl) {
        this.canvas = canvas;
        this.gl = gl;
        this.program = compileProgram(gl);
        const aPosLoc = gl.getAttribLocation(this.program, "aPos");
        this.geom = buildMeshGeometry(gl, aPosLoc);
        this.textures = new Map();
        this.atlasTex = null;
        this.fxTex = null;
        this.fxTopTex = null;
        this._disposed = false;

        this.loc = {
            aPos: aPosLoc,
            uMode: gl.getUniformLocation(this.program, "uMode"),
            uCanvasSize: gl.getUniformLocation(this.program, "uCanvasSize"),
            uUvRect: gl.getUniformLocation(this.program, "uUvRect"),
            uStageRect: gl.getUniformLocation(this.program, "uStageRect"),
            uBodyDelta: gl.getUniformLocation(this.program, "uBodyDelta"),
            uWaist: gl.getUniformLocation(this.program, "uWaist"),
            uNeck: gl.getUniformLocation(this.program, "uNeck"),
            uHead: gl.getUniformLocation(this.program, "uHead"),
            uRigParams: gl.getUniformLocation(this.program, "uRigParams"),
            uHairSpan: gl.getUniformLocation(this.program, "uHairSpan"),
            uGaze: gl.getUniformLocation(this.program, "uGaze"),
            uTex: gl.getUniformLocation(this.program, "uTex"),
            uTexPrev: gl.getUniformLocation(this.program, "uTexPrev"),
            uLashMode: gl.getUniformLocation(this.program, "uLashMode"),
            uLashColor: gl.getUniformLocation(this.program, "uLashColor"),
            uAlpha: gl.getUniformLocation(this.program, "uAlpha"),
            uMorphMix: gl.getUniformLocation(this.program, "uMorphMix"),
            uTint: gl.getUniformLocation(this.program, "uTint")
        };
    }

    /**
     * Attempt to create a WebGL2 renderer bound to `canvas`. Returns `null` if unsupported.
     * @param {HTMLCanvasElement | null} canvas
     * @returns {WebGLRigRenderer | null}
     */
    static tryCreate(canvas) {
        if (!canvas || typeof canvas.getContext !== "function") {
            return null;
        }
        try {
            const gl = canvas.getContext("webgl2", {
                alpha: true,
                premultipliedAlpha: true,
                preserveDrawingBuffer: true,
                antialias: true
            });
            if (!gl) {
                return null;
            }
            return new WebGLRigRenderer(canvas, gl);
        } catch (_) {
            return null;
        }
    }

    /**
     * @param {TexImageSource} source
     * @returns {WebGLTexture}
     */
    _uploadTexture(source) {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        return tex;
    }

    /**
     * @param {TexImageSource} atlas
     */
    setAtlas(atlas) {
        if (this._disposed || !atlas) return;
        if (this.atlasTex) {
            this.gl.deleteTexture(this.atlasTex);
        }
        this.atlasTex = this._uploadTexture(atlas);
    }

    /**
     * @param {string} key
     * @param {HTMLCanvasElement} layerCanvas
     * @returns {WebGLTexture | null}
     */
    getOrUploadLayer(key, layerCanvas) {
        if (this._disposed || !layerCanvas) return null;
        if (this.textures.has(key)) {
            return this.textures.get(key);
        }
        const tex = this._uploadTexture(layerCanvas);
        this.textures.set(key, tex);
        return tex;
    }

    /**
     * Render one composited frame via GPU mesh deformation.
     * @param {Record<string, any>} params
     */
    render(params) {
        if (this._disposed) return;
        const gl = this.gl;
        const {
            W,
            H,
            mood,
            layers,
            atlasW,
            atlasH,
            eyeSrc,
            mouthState,
            restMouthStage,
            syUse,
            eyeAngleDeg,
            lashColor,
            pivots,
            springs,
            windPhase,
            windAmp,
            gazeShift,
            morph = null,
            tint = null,
            fxLayer = null,
            fxTopLayer = null
        } = params;

        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(this.program);
        gl.uniform2f(this.loc.uCanvasSize, W, H);
        gl.uniform2f(this.loc.uBodyDelta, springs.bodyX.x, springs.bodyY.x);
        gl.uniform2f(this.loc.uWaist, pivots.waist[0], pivots.waist[1]);
        gl.uniform2f(this.loc.uNeck, pivots.neck[0], pivots.neck[1]);
        gl.uniform2f(this.loc.uHead, pivots.head[0], pivots.head[1]);
        gl.uniform4f(this.loc.uRigParams, springs.chest.x, springs.headRot.x, springs.headY.x, springs.fHair.x);

        const splitY = Number.isFinite(pivots.hairSplit) ? pivots.hairSplit : pivots.neck[1];
        const bottomY = Number.isFinite(pivots.hairBottom) ? pivots.hairBottom : H * 0.72;
        gl.uniform4f(this.loc.uHairSpan, splitY, bottomY, windPhase, windAmp);

        const angleRad = ((eyeAngleDeg || 0) * Math.PI) / 180;
        const [lr, lg, lb, la] = parseHexRgba(lashColor);
        gl.uniform4f(this.loc.uLashColor, lr, lg, lb, la);
        const tintStrength = tint ? Math.min(1, Math.max(0, Number(tint.strength) || 0)) : 0;
        const [tr, tg, tb] = tintStrength > 0.001 && tint?.color ? parseHexRgba(tint.color) : [1, 1, 1];
        gl.uniform4f(this.loc.uTint, tr, tg, tb, tintStrength);
        gl.uniform1i(this.loc.uTex, 0);
        gl.uniform1i(this.loc.uTexPrev, 1);

        const mm = morph ? evalMorphCurve(morph.t) : { active: false, s: 1, prevAlpha: 0, nextAlpha: 1, eyeCushion: 1 };
        const eyeSyMorph = mm.active ? Math.max(0.08, syUse * mm.eyeCushion) : syUse;

        const drawMeshLayer = (mode, layerId, layerCanvas, alpha = 1.0) => {
            if (!layerCanvas || alpha <= 0.002) return;
            const tex = this.getOrUploadLayer(`${mood}::${layerId}`, layerCanvas);
            if (!tex) return;
            gl.bindVertexArray(this.geom.meshVao);
            gl.uniform1i(this.loc.uMode, mode);
            gl.uniform1i(this.loc.uLashMode, 0);
            gl.uniform1f(this.loc.uAlpha, alpha);
            gl.uniform4f(this.loc.uUvRect, 0, 0, 1, 1);
            gl.uniform4f(this.loc.uGaze, gazeShift.x, gazeShift.y, 0, 1);
            const prevLayerCanvas = mm.active ? morph.prevLayers?.[layerId] : null;
            const prevTex = prevLayerCanvas && morph.prevMood ? this.getOrUploadLayer(`${morph.prevMood}::${layerId}`, prevLayerCanvas) : null;
            if (prevTex && gl.TEXTURE1 !== undefined) {
                gl.uniform1f(this.loc.uMorphMix, mm.s);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, prevTex);
            } else {
                gl.uniform1f(this.loc.uMorphMix, -1.0);
            }
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.drawElements(gl.TRIANGLES, this.geom.meshIndexCount, gl.UNSIGNED_SHORT, 0);
        };

        const drawQuadOrgan = (spec, stageTarget, sy, gMultX, gMultY, eyeShiftX, lashOverlay, alpha = 1.0, customAngRad = angleRad) => {
            if (!spec || !this.atlasTex || !atlasW || !atlasH || alpha <= 0.002) return;
            const a = spec.atlas;
            const s = stageTarget || spec.stage;
            gl.bindVertexArray(this.geom.quadVao);

            gl.uniform1i(this.loc.uMode, 0);
            gl.uniform1i(this.loc.uLashMode, 0);
            gl.uniform1f(this.loc.uMorphMix, -1.0);
            gl.uniform1f(this.loc.uAlpha, alpha);
            gl.uniform4f(this.loc.uUvRect, a.x / atlasW, a.y / atlasH, (a.x + a.w) / atlasW, (a.y + a.h) / atlasH);
            gl.uniform4f(this.loc.uStageRect, s.cx + eyeShiftX, s.cy, s.w, s.h);
            gl.uniform4f(this.loc.uGaze, gazeShift.x * gMultX, gazeShift.y * gMultY, customAngRad, sy);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            if (lashOverlay && sy < 0.72) {
                gl.uniform1i(this.loc.uLashMode, 1);
                gl.uniform1f(this.loc.uAlpha, alpha);
                gl.uniform4f(this.loc.uStageRect, s.cx + eyeShiftX, s.cy, s.w, Math.max(8, s.h * 0.4));
                gl.uniform4f(this.loc.uGaze, gazeShift.x * gMultX, gazeShift.y * gMultY, customAngRad, 1.0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        };

        // Semantic paint stack
        drawMeshLayer(1, "back_hair", layers.back_hair, 1.0);
        drawMeshLayer(2, "lower_body", layers.lower_body, 1.0);
        drawMeshLayer(4, "skin_canvas", layers.skin_canvas, 1.0);

        const irisShiftX = gazeShift.eyeIrisX || 0;
        if (mm.active) {
            const prevAngRad = ((morph.prevEyeAngleDeg ?? eyeAngleDeg ?? 0) * Math.PI) / 180;
            drawQuadOrgan(morph.prevEyeSrc?.left_eye, morph.prevEyeSrc?.left_eye?.stage, eyeSyMorph, 1.15, 1.10, irisShiftX, true, mm.prevAlpha, prevAngRad);
            drawQuadOrgan(morph.prevEyeSrc?.right_eye, morph.prevEyeSrc?.right_eye?.stage, eyeSyMorph, 1.15, 1.10, irisShiftX, true, mm.prevAlpha, prevAngRad);
            if (morph.prevMouthSpec) {
                const ps = morph.prevMouthSpec.stage;
                const prs = morph.prevRestMouthStage || ps;
                drawQuadOrgan(morph.prevMouthSpec, { cx: prs.cx, cy: prs.cy, w: ps.w, h: ps.h }, 1.0, 1.0, 1.0, 0, false, mm.prevAlpha, prevAngRad);
            }
        }

        drawQuadOrgan(eyeSrc?.left_eye, eyeSrc?.left_eye?.stage, eyeSyMorph, 1.15, 1.10, irisShiftX, true, mm.nextAlpha, angleRad);
        drawQuadOrgan(eyeSrc?.right_eye, eyeSrc?.right_eye?.stage, eyeSyMorph, 1.15, 1.10, irisShiftX, true, mm.nextAlpha, angleRad);
        if (mouthState?.spec) {
            const s = mouthState.spec.stage;
            const rs = restMouthStage || s;
            drawQuadOrgan(mouthState.spec, { cx: rs.cx, cy: rs.cy, w: s.w, h: s.h }, mouthState.sy, 1.0, 1.0, 0, false, mm.nextAlpha, angleRad);
        }

        const drawHeadOverlay = (canvas, texProp) => {
            if (!canvas) return;
            if (!this[texProp]) {
                this[texProp] = this.createTexture(canvas);
            } else {
                gl.bindTexture(gl.TEXTURE_2D, this[texProp]);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
            }
            if (this[texProp]) {
                gl.bindVertexArray(this.geom.meshVao);
                gl.uniform1i(this.loc.uMode, 4);
                gl.uniform1i(this.loc.uLashMode, 0);
                gl.uniform1f(this.loc.uAlpha, 1.0);
                gl.uniform1f(this.loc.uMorphMix, -1.0);
                gl.uniform4f(this.loc.uUvRect, 0, 0, 1, 1);
                gl.uniform4f(this.loc.uGaze, gazeShift.x, gazeShift.y, 0, 1);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this[texProp]);
                gl.drawElements(gl.TRIANGLES, this.geom.meshIndexCount, gl.UNSIGNED_SHORT, 0);
            }
        };

        drawHeadOverlay(fxLayer, "fxTex");

        drawMeshLayer(3, "upper_clothes", layers.upper_clothes, 1.0);
        drawMeshLayer(5, "front_hair", layers.front_hair, 1.0);
        drawHeadOverlay(fxTopLayer, "fxTopTex");
        gl.bindVertexArray(null);
    }

    clearLayerCache() {
        if (this._disposed) return;
        for (const tex of this.textures.values()) {
            this.gl.deleteTexture(tex);
        }
        this.textures.clear();
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this.clearLayerCache();
        if (this.atlasTex) {
            this.gl.deleteTexture(this.atlasTex);
            this.atlasTex = null;
        }
        if (this.fxTex) {
            this.gl.deleteTexture(this.fxTex);
            this.fxTex = null;
        }
        if (this.fxTopTex) {
            this.gl.deleteTexture(this.fxTopTex);
            this.fxTopTex = null;
        }
        if (this.geom) {
            this.gl.deleteBuffer(this.geom.vbo);
            this.gl.deleteBuffer(this.geom.ebo);
            this.gl.deleteBuffer(this.geom.qVbo);
            this.gl.deleteVertexArray(this.geom.meshVao);
            this.gl.deleteVertexArray(this.geom.quadVao);
        }
        if (this.program) {
            this.gl.deleteProgram(this.program);
        }
    }
}

export { WebGLRigRenderer, GRID_COLS, GRID_ROWS, evalMorphCurve };
