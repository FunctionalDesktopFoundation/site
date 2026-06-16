import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Fdf from './assets/fdf.png';

interface WaterLogoProps { imageSrc: string; }

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
            float falloff = smoothstep(0.0, 1.0, (maxDist - dist) / maxDist);
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
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(shader)); return null; }
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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]), gl.STATIC_DRAW);

    const texture = gl.createTexture();
    let animationFrameId: number;
    const startTime = performance.now();

    const setupAndRender = (imageElement: HTMLImageElement) => {
      canvas.width = imageElement.naturalWidth || 600;
      canvas.height = imageElement.naturalHeight || 600;
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
        const prevX = m.x; const prevY = m.y;
        m.x += (m.targetX - m.x) * 0.12;
        m.y += (m.targetY - m.y) * 0.12;
        m.vx = (m.x - prevX) * 0.88;
        m.vy = (m.y - prevY) * 0.88;
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
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    if (img.complete) setupAndRender(img);
    else img.onload = () => setupAndRender(img);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const m = mouseRef.current;
      m.targetX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      m.targetY = ((e.clientY - rect.top) / rect.height) * canvas.height;
      if (!m.isActive) { m.x = m.targetX; m.y = m.targetY; m.isActive = true; }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches.length) return;
      const rect = canvas.getBoundingClientRect();
      const m = mouseRef.current;
      m.targetX = ((e.touches[0].clientX - rect.left) / rect.width) * canvas.width;
      m.targetY = ((e.touches[0].clientY - rect.top) / rect.height) * canvas.height;
      if (!m.isActive) { m.x = m.targetX; m.y = m.targetY; m.isActive = true; }
    };
    const handleLeave = () => { mouseRef.current.isActive = false; };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleLeave);
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.addEventListener('touchend', handleLeave);

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleLeave);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleLeave);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [imageSrc]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair' }} />;
}

function useScrollProgress(
  elementRef: React.RefObject<HTMLElement | null>,
  thresholdStart = 0.85,
  thresholdEnd = 0.15,
) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        if (!elementRef.current) { ticking = false; return; }
        const rect = elementRef.current.getBoundingClientRect();
        const wh = window.innerHeight;
        const startReveal = wh * thresholdStart;
        const endReveal = wh * thresholdEnd;
        const totalRange = startReveal - endReveal;
        const currentProgress = (startReveal - rect.top) / totalRange;
        setProgress(Math.max(0, Math.min(1, currentProgress)));
        ticking = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [elementRef, thresholdStart, thresholdEnd]);

  return progress;
}

function AnimatedHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const progress = useScrollProgress(ref);
  const opacity = Math.min(1, progress * 2.5);
  return (
    <p ref={ref} style={{ fontSize: '0.8rem', textTransform: 'uppercase' as const, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', marginBottom: '1.25rem', willChange: 'opacity, transform', opacity, transform: `translateY(${(1 - opacity) * 12}px)` }}>
      {children}
    </p>
  );
}

function ScrollableReveal({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const scrollProgress = useScrollProgress(ref);
  const words = text.split(' ');
  return (
    <h2 ref={ref} style={s.revealText}>
      {words.map((word, i) => {
        const start = i / words.length;
        const end = (i + 1) / words.length;
        const p = Math.max(0, Math.min(1, (scrollProgress - start) / (end - start)));
        return (
          <span key={i} style={{ display: 'inline-block', backgroundImage: `linear-gradient(to right, #ffffff ${p * 100}%, rgba(255,255,255,0.12) ${p * 100}%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {word}&nbsp;
          </span>
        );
      })}
    </h2>
  );
}

function ScrollableRevealWords({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const scrollProgress = useScrollProgress(ref);
  const words = text.split(' ');
  return (
    <h2 ref={ref} style={s.revealText}>
      {words.map((word, i) => (
        <span key={i} style={{ display: 'inline-block', color: scrollProgress >= i / words.length ? '#ffffff' : 'rgba(255,255,255,0.12)', transition: 'color 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          {word}&nbsp;
        </span>
      ))}
    </h2>
  );
}

function ScrollableRevealMixed({ children }: { children: ReactNode[] }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const scrollProgress = useScrollProgress(ref);
  return (
    <h2 ref={ref} style={s.revealText}>
      {children.map((child, i) => (
        <span key={i} style={{ display: 'inline-block', opacity: scrollProgress >= i / children.length ? 1 : 0.12, transition: 'opacity 0.25s ease-out' }}>
          {child}&nbsp;
        </span>
      ))}
    </h2>
  );
}

/*function FDFlibLogSequenceMockup() {
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(containerRef, 1.0, 0.0);

  const rotateX = 15 - progress * 15;
  const translateY = 100 - progress * 100;
  const scale = 0.92 + progress * 0.08;
  const opacity = Math.min(1, progress * 1.5);

  return (
    <div ref={containerRef} style={{ width: '100%', maxWidth: '960px', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', overflow: 'visible', marginTop: '4rem' }}>
      <style>{`
        .fdf-sb::-webkit-scrollbar { width: 5px; height: 5px; }
        .fdf-sb::-webkit-scrollbar-track { background: transparent; }
        .fdf-sb::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 20px; }
        .fdf-sb::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }
        .fdf-sb { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.07) transparent; }
      `}</style>

      <div style={{
        width: '100%',
        aspectRatio: '1.618 / 1',
        backgroundColor: '#0c0c0e',
        borderRadius: '8px',
        border: '1px solid #1a1a1e',
        boxShadow: '0 30px 70px rgba(0,0,0,0.85)',
        transformOrigin: 'bottom center',
        willChange: 'transform, opacity',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transform: `perspective(1200px) rotateX(${rotateX}deg) translateY(${translateY}px) scale(${scale})`,
        opacity,
      }}>
        <div style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%', overflow: 'hidden' }}>
          <div style={{
            width: '32%',
            minWidth: '180px',
            backgroundColor: '#121214',
            borderRight: '1px solid #1a1a1e',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          }}>
            <div style={{ flexShrink: 0, height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['✕','─','☐'].map((icon, i) => (
                  <button key={i} style={s.iconBtn}><span style={{ fontSize: '0.65rem' }}>{icon}</span></button>
                ))}
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e4e4e7', fontFamily: 'system-ui, sans-serif' }}>Log Sequence</span>
              <button style={s.iconBtn}><span style={{ fontSize: '0.9rem', color: '#a1a1aa' }}>⟲</span></button>
            </div>

            <div style={{ flexShrink: 0, padding: '4px 12px 10px', boxSizing: 'border-box' }}>
              <input readOnly type="text" placeholder="Search dates…" style={{ width: '100%', backgroundColor: '#1a1a1e', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '0.8rem', color: '#71717a', outline: 'none', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }} />
            </div>

            <div className="fdf-sb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', backgroundColor: '#121214', padding: '0 12px' }} />

            <div style={{ flexShrink: 0, padding: '12px', borderTop: '1px solid #1a1a1e', boxSizing: 'border-box' }}>
              <button style={{ width: '100%', backgroundColor: '#1a1a1e', border: 'none', borderRadius: '6px', color: '#a1a1aa', fontSize: '0.78rem', padding: '8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
                <span style={{ marginRight: '6px' }}>🗑</span> Delete entry
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: '#0c0c0e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0, height: '62px', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box' }}>
              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.01em', fontFamily: 'system-ui, sans-serif' }}>2026-06-13</div>
                <div style={{ fontSize: '0.72rem', color: '#52525b', marginTop: '1px', fontFamily: 'system-ui, sans-serif' }}>Jun 13, 2026</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#121214', padding: '3px', borderRadius: '6px', border: '1px solid #1a1a1e' }}>
                {(['‹','💾','›'] as const).map((icon, i) => (
                  <button key={i} style={i === 1 ? s.saveBtnInner : s.navArrow}>{icon}</button>
                ))}
              </div>
            </div>

            <div className="fdf-sb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', boxSizing: 'border-box', textAlign: 'left' }}>
              <div style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace', fontSize: '0.85rem', lineHeight: '1.7', color: '#e4e4e7' }}>
                <div style={{ fontWeight: 'bold', color: '#ffffff', fontSize: '0.92rem', marginBottom: '2px' }}># Heading</div>
                <div style={{ fontWeight: 'bold', color: '#e4e4e7', fontSize: '0.88rem', marginBottom: '2px' }}>## Subheading</div>
                <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ color: '#71717a', marginRight: '6px', whiteSpace: 'pre' }}>- [ ]</span> todo</div>
                <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ color: '#a1a1aa', marginRight: '6px', whiteSpace: 'pre' }}>- [x]</span> done</div>
                <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ color: '#71717a', marginRight: '8px', marginLeft: '2px' }}>•</span> bullet</div>
                <div style={{ color: '#a1a1aa' }}>&gt; quote</div>
              </div>
            </div>

            <div style={{ flexShrink: 0, height: '24px', padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: '0.72rem', color: '#3f3f46', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
              0 chars • 1 lines
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}*/

export function App() {
  return (
    <main style={s.pageWrapper}>
      <section style={s.heroSection}>
        <h1 style={s.heroTitle}>functional desktop foundation <i style={{ color: 'gray' }}>of Philadelphia, Pennsylvania</i></h1>
        <div style={{ width: '100%', maxWidth: '540px', aspectRatio: '1 / 1', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Chromic imageSrc={Fdf} />
        </div>
        <iframe src="https://donate.hellings.cc/"></iframe>
      </section>

      <section style={s.contentSection}>
        <div style={s.textContainer}>
          <ScrollableReveal text="The Functional Desktop Foundation is an independent design studio based in Pennsylvania, USA intending to gracefully improve, modernize and simplify the UI and development of applications and shells on most platforms through subtle token-based design rather than full restructures." />
          <h2 style={s.secondaryHeader}>
            Our <sup>no.</sup><b>1</b> goal is to ensure a usable and inspiring computing experience for everyone (users and developers alike), on both mobile and desktop. <i>We turn what many view as a designer's native-app dream and a developer's nightmare into a functional, beautiful DX/UX experience.</i>
          </h2>
          <p style={s.bodyParagraph}>
            The FDF's HIG, components and theming are all available on Windows, Linux and MacOS on the QT user-interface framework.{' '}
            <a target="_blank" rel="noreferrer" style={s.inlineLink} href="https://stopthemingmy.app/">We do not automatically insert ourselves over your existing themes.</a>{' '}
            Promise.
          </p>
          <img style={{ marginTop: '2rem', height: '32px', opacity: 0.8 }} src="https://stopthemingmy.app/badge.svg" alt="Stop theming my app badge" />
        </div>
      </section>

      <section style={s.statementSection}>
        <div style={s.textContainer}>
          <AnimatedHeader>FDF Foundational Libraries</AnimatedHeader>
          <ScrollableRevealWords text="We maintain the FDF Foundational Libraries, a collection of usable, voluntary, simple-to-implement and customizable components and an accompanying full-stack Qt framework for FDF HIG-compliant applications with no rush or annoyance." />
        </div>
      </section>

      <section style={s.statementSection}>
        <div style={s.textContainer}>
          <AnimatedHeader>qmX Standard</AnimatedHeader>
          <ScrollableRevealWords text="We maintain qmX, a JSX-like language with Pythonic metaprogramming syntax that transpiles to QML+JavaScript at runtime, supporting hot reload." />
        </div>
      </section>

      <section style={s.statementSection}>
        <div style={s.textContainer}>
          <AnimatedHeader>Counseling</AnimatedHeader>
          <ScrollableRevealMixed>
            <span key={1}>Email</span>
            <span key={1}>us!</span>
            <a href="mailto:fdf@functionaldesk.top" style={{ color: '#ffffff', textDecoration: 'underline', textUnderlineOffset: '5px' }}>fdf@functionaldesk.top</a>
          </ScrollableRevealMixed>
        </div>
      </section>

      <section style={s.footerSection}>
        <div style={s.textContainer}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 400, lineHeight: '1.6', color: 'rgba(255,255,255,0.4)', maxWidth: '560px', margin: '1.5rem auto 0 auto' }}>
            For the Free Desktop Organization, under the Software Freedom Conservancy, 501(c)(3), see{' '}
            <a style={s.inlineLink} target="_blank" rel="noreferrer" href="https://www.freedesktop.org/">fd.o</a>. We are not the Free Desktop Organization, we are a separate entity focused on design.
          </h4>
        </div>
      </section>
    </main>
  );
}

const s = {
  pageWrapper: {
    backgroundColor: '#050505',
    color: '#ffffff',
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    WebkitFontSmoothing: 'antialiased',
  },
  heroSection: {
    width: '100%',
    minHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '2rem 1.5rem',
    boxSizing: 'border-box',
  },
  heroTitle: {
    fontSize: 'clamp(1.75rem, 5vw, 4rem)',
    fontWeight: 700,
    textAlign: 'center',
    letterSpacing: '-0.03em',
    marginBottom: '2.5rem',
    textTransform: 'lowercase',
  },
  contentSection: {
    minHeight: '120vh',
    padding: '12vh 1.5rem 6vh 1.5rem',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    boxSizing: 'border-box',
  },
  statementSection: {
    minHeight: '90vh',
    padding: '4rem 1.5rem',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxSizing: 'border-box',
  },
  footerSection: {
    minHeight: '110vh',
    padding: '6rem 1.5rem 0 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxSizing: 'border-box',
    textAlign: 'center',
  },
  textContainer: { maxWidth: '760px', width: '100%' },
  revealText: {
    fontSize: 'clamp(1.75rem, 3.8vw, 3rem)',
    fontWeight: 600,
    lineHeight: '1.35',
    letterSpacing: '-0.02em',
    margin: 0,
  },
  secondaryHeader: {
    fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)',
    fontWeight: 400,
    lineHeight: '1.5',
    color: 'rgba(255,255,255,0.85)',
    marginTop: '3rem',
  },
  bodyParagraph: {
    fontSize: '1rem',
    lineHeight: '1.6',
    color: 'rgba(255,255,255,0.6)',
    marginTop: '2rem',
  },
  inlineLink: {
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
  iconBtn: {
    background: '#1a1a1e',
    border: 'none',
    color: '#71717a',
    width: '22px',
    height: '22px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  navArrow: {
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    fontSize: '1.1rem',
    width: '26px',
    height: '26px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnInner: {
    background: '#ffffff',
    border: 'none',
    color: '#09090b',
    borderRadius: '5px',
    width: '26px',
    height: '26px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
  },
} as Record<string, CSSProperties>;

export default App;