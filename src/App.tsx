import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Fdf from './assets/fdf.png';

interface WaterLogoProps {
  imageSrc: string;
}

function Chromic({ imageSrc }: WaterLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, vx: 0, vy: 0, isActive: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    const vsSource = `
      precision mediump float;
      attribute vec2 a_position;
      varying vec2 v_uv;
      varying vec2 v_pixelSpace;
      uniform vec2 u_resolution;
      void main() {
        gl_Position = vec4(a_position * 2.0 - 1.0, 0.0, 1.0);
        v_uv = a_position; 
        v_pixelSpace = vec2(a_position.x, 1.0 - a_position.y) * u_resolution;
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec2 v_uv;
      varying vec2 v_pixelSpace;

      uniform sampler2D u_texture;
      uniform vec2 u_mouse;
      uniform vec2 u_resolution;
      uniform float u_isActive;
      uniform vec2 u_velocity;
      uniform float u_time;

      void main() {
        float ambientWaveX = sin(v_uv.y * 6.0 + u_time * 0.8) * 0.0015 + cos(v_uv.x * 3.0 + u_time * 0.5) * 0.0008;
        float ambientWaveY = cos(v_uv.x * 6.0 + u_time * 0.7) * 0.0015 + sin(v_uv.y * 4.0 + u_time * 0.6) * 0.0008;
        vec2 ambientDisplacement = vec2(ambientWaveX, ambientWaveY);

        vec2 diff = v_pixelSpace - u_mouse;
        float dist = length(diff);
        
        vec2 mouseDisplacementPixels = vec2(0.0, 0.0);
        float chromaticStaggerPixels = 0.0;
        
        float speed = length(u_velocity);
        
        if (u_isActive > 0.5 && speed > 0.1) {
          float maxDist = 200.0;
          if (dist < maxDist) {
            float falloff = (maxDist - dist) / maxDist;
            falloff = smoothstep(0.0, 1.0, falloff);
            
            vec2 dirOfMovement = normalize(u_velocity);
            
            float alignment = dot(normalize(diff + 0.001), dirOfMovement);
            
            float waveFreq = sin(dist * 0.15 - u_time * 4.0);
            
            mouseDisplacementPixels = dirOfMovement * waveFreq * (speed * 0.8) * falloff * abs(alignment);
            
            chromaticStaggerPixels = (speed * 0.5) * falloff * alignment;
          }
        }
        
        vec2 mouseDisplacementUV = vec2(mouseDisplacementPixels.x / u_resolution.x, mouseDisplacementPixels.y / u_resolution.y);
        vec2 staggerUV = vec2(chromaticStaggerPixels / u_resolution.x, 0.0);
        
        vec2 finalUV = v_uv + ambientDisplacement + mouseDisplacementUV;
        
        float r = texture2D(u_texture, clamp(finalUV - staggerUV, 0.001, 0.999)).r;
        vec4 gColor = texture2D(u_texture, clamp(finalUV, 0.001, 0.999));
        float b = texture2D(u_texture, clamp(finalUV + staggerUV, 0.001, 0.999)).b;
        
        gl_FragColor = vec4(r, gColor.g, b, gColor.a);
      }
    `;

    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    if (!program || !vs || !fs) return;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    const mouseLoc = gl.getUniformLocation(program, 'u_mouse');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const activeLoc = gl.getUniformLocation(program, 'u_isActive');
    const velocityLoc = gl.getUniformLocation(program, 'u_velocity');
    const timeLoc = gl.getUniformLocation(program, 'u_time');

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,  1, 0,  0, 1,
      0, 1,  1, 0,  1, 1,
    ]), gl.STATIC_DRAW);

    const texture = gl.createTexture();
    let animationFrameId: number;
    const startTime = performance.now();

    const setupTextureAndStartRender = (imageElement: HTMLImageElement) => {
      canvas.width = imageElement.naturalWidth;
      canvas.height = imageElement.naturalHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageElement);

      const render = () => {
        const m = mouseRef.current;
        const prevX = m.x;
        const prevY = m.y;
        
        m.x += (m.targetX - m.x) * 0.12; 
        m.y += (m.targetY - m.y) * 0.12;
        
        m.vx = m.x - prevX;
        m.vy = m.y - prevY;
        
        m.vx *= 0.88;
        m.vy *= 0.88;

        const currentTime = (performance.now() - startTime) / 1000.0;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);
        gl.enableVertexAttribArray(positionLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(mouseLoc, m.x, m.y);
        gl.uniform2f(resLoc, canvas.width, canvas.height);
        gl.uniform1f(activeLoc, m.isActive ? 1.0 : 0.0);
        gl.uniform2f(velocityLoc, m.vx, m.vy);
        gl.uniform1f(timeLoc, currentTime);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        animationFrameId = requestAnimationFrame(render);
      };

      render();
    };

    const img = new Image();
    img.src = imageSrc;

    if (img.complete) {
      setupTextureAndStartRender(img);
    } else {
      img.onload = () => setupTextureAndStartRender(img);
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const m = mouseRef.current;
      m.targetX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      m.targetY = ((e.clientY - rect.top) / rect.height) * canvas.height;
      if (!m.isActive) {
        m.x = m.targetX;
        m.y = m.targetY;
        m.isActive = true;
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current.isActive = false;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [imageSrc]);

  return <canvas ref={canvasRef} style={styles.heroCanvas} />;
}

interface ScrollableRevealProps {
  text: string;
}

function ScrollableReveal({ text }: ScrollableRevealProps) {
  const containerRef = useRef<HTMLHeadingElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const words = text.split(' ');

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!containerRef.current) {
            ticking = false;
            return;
          }

          const rect = containerRef.current.getBoundingClientRect();
          const windowHeight = window.innerHeight;
          const startReveal = windowHeight * 0.9;
          const endReveal = windowHeight * 0.25;

          const totalRange = startReveal - endReveal;
          const currentPosition = startReveal - rect.top;
          const progress = currentPosition / totalRange;

          setScrollProgress(Math.max(0, Math.min(1, progress)));
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <h1 ref={containerRef} style={styles.revealText}>
      {words.map((word, index) => {
        const startThreshold = index / words.length;
        const endThreshold = (index + 1) / words.length;

        let wordProgress = 0;
        if (scrollProgress > startThreshold) {
          wordProgress = (scrollProgress - startThreshold) / (endThreshold - startThreshold);
        }
        const clampedWordProgress = Math.max(0, Math.min(1, wordProgress));

        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              marginRight: '0.25em',
              backgroundImage: `linear-gradient(to right, #ffffff ${clampedWordProgress * 100}%, rgba(255,255,255,0.15) ${clampedWordProgress * 100}%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              transition: 'background-image 0.05s ease-out',
            }}
          >
            {word}
          </span>
        );
      })}
    </h1>
  );
}

export default App;
function App() {
  return (
    <main style={styles.pageWrapper}>
      <section style={styles.heroSection}>
        <h1>functional desktop foundation</h1>
        <Chromic imageSrc={Fdf} />
      </section>

      <section style={styles.contentSection}>
        <div style={styles.textContainer}>
          <ScrollableReveal
            text="The Functional Desktop Foundation is a design studio intending to improve and simplify the UI of applications, cross-platform, cross-framework. The FDF's components are available on Windows, Linux and MacOS on QT and GTK."
          />
        </div>
      </section>
    </main>
  );
}

const styles = {
  pageWrapper: {
    backgroundColor: '#0a0a0a',
    color: '#ffffff',
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  heroSection: {
    width: '100%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '2rem 0',
  },
  heroCanvas: {
    maxWidth: '100%',
    height: 'auto',
    display: 'block',
    cursor: 'pointer',
  },
  contentSection: {
    height: '150vh',
    paddingLeft: '10vw',
    paddingRight: '10vw',
    display: 'flex',
    justifyContent: 'center',
  },
  textContainer: {
    maxWidth: '800px',
    width: '100%',
  },
  revealText: {
    fontSize: 'clamp(2rem, 4vw, 3.5rem)',
    fontWeight: 600,
    lineHeight: '1.4',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }
} as Record<string, CSSProperties>;