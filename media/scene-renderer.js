const vertexSource = `
attribute vec3 pos;
attribute vec3 rgb;
attribute vec2 uv;
uniform mat4 vp;
varying vec3 color;
varying vec2 texUV;

void main() {
  color = rgb;
  texUV = uv;
  gl_Position = vp * vec4(pos, 1.0);
}`;

const fragmentSource = `
precision highp float;
uniform sampler2D atlas;
uniform float opacity;
uniform float sceneGamma;
uniform bool entityTexture;
uniform int skinPass;
varying vec3 color;
varying vec2 texUV;

vec4 material() {
  if (entityTexture) {
    return texture2D(atlas, skinPass == 0 ? fract(texUV) : texUV);
  }
  if (texUV.x < -1.5) return vec4(1.0, 1.0, 1.0, 0.64);
  if (texUV.x < 0.0) return vec4(1.0);
  return texture2D(atlas, texUV);
}

void main() {
  vec4 tex = material();
  if (tex.a < (skinPass == 0 ? 0.16 : 0.1)) discard;
  if (skinPass == 1 && tex.a < 0.999) discard;
  if (skinPass == 2 && tex.a >= 0.999) discard;
  vec3 rgb = color * tex.rgb;
  if (sceneGamma > 0.0) {
    float level = max(rgb.r, max(rgb.g, rgb.b));
    float inv = 1.0 - clamp(level, 0.0, 1.0);
    float lifted = 1.0 - inv * inv * inv * inv;
    rgb *= mix(1.0, lifted / max(level, 0.0001), sceneGamma);
  }
  gl_FragColor = vec4(rgb, tex.a * opacity);
}`;

// Every scene buffer interleaves position (3), RGB (3) and UV (2) as floats.
const FLOATS_PER_VERTEX = 8;
const STRIDE = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
const CHUNK_SIDE = 16; // The mesh worker uses the same chunk key coordinates.
const MESH_BUDGET = 144 * 1024 * 1024;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

export function createSceneRenderer(gl) {
  if (!gl) throw new Error('WebGL 无法初始化。请检查 VS Code 硬件加速或显卡驱动。');
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const attributes = [['pos', 3, 0], ['rgb', 3, 12], ['uv', 2, 24]].map(([name, size, offset]) => {
    const index = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(index);
    return { index, size, offset };
  });
  const uniforms = Object.fromEntries(['vp', 'opacity', 'sceneGamma', 'entityTexture', 'skinPass'].map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1f(uniforms.opacity, 1);
  gl.uniform1f(uniforms.sceneGamma, 0);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(.082, .105, .145, 1);

  return {
    uniforms,
    lines: gl.createBuffer(),
    bind(buffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const { index, size, offset } of attributes) gl.vertexAttribPointer(index, size, gl.FLOAT, false, STRIDE, offset);
    },
  };
}

export function createChunkMeshes(gl, budget = MESH_BUDGET) {
  const entries = new Map();
  let bytes = 0;

  function remove(key) {
    const old = entries.get(key);
    if (!old) return;
    gl.deleteBuffer(old.buffer);
    entries.delete(key);
    bytes -= old.bytes;
  }

  return {
    values: () => entries.values(),
    clear() {
      for (const key of entries.keys()) remove(key);
    },
    replace(key, opaque, transparent) {
      let overBudget = false;
      const center = key.split(',').map(axis => Number(axis) * CHUNK_SIDE + CHUNK_SIDE / 2);
      for (const [vertices, alpha] of [[opaque, false], [transparent, true]]) {
        const entryKey = key + (alpha ? 'a' : 'o');
        remove(entryKey);
        if (!vertices.length) continue;
        if (bytes + vertices.byteLength > budget) {
          overBudget = true;
          continue;
        }
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        bytes += vertices.byteLength;
        entries.set(entryKey, { buffer, len: vertices.length / FLOATS_PER_VERTEX, bytes: vertices.byteLength, alpha, center });
      }
      return overBudget;
    },
  };
}
