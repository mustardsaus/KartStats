/* eslint-disable @typescript-eslint/no-unused-vars */
/*!
 * Vendored verbatim from the supplied watercolor-framework — reused
 * exactly as shipped per its own docs ("don't rewrite the effect"), so
 * lint is relaxed here rather than editing third-party logic to satisfy it.
 *
 * watercolor-reveal.js — turn any image into a watercolour painting that paints itself on.
 * Vanilla JS, no dependencies, no build step. Renders deterministically from a progress
 * value, so it works with any animation engine, a scrubber, or a video exporter.
 *
 *   const fx = await WatercolorReveal.create({ src: 'photo.jpg', width: 1440, height: 810 });
 *   fx.draw(canvas, p);   // p = 0..1 overall progress. Same p always gives the same frame.
 *
 * Pipeline: Sobel edge map -> ink contour drawing revealed by an expanding ragged wet edge,
 * then seeded organic blots (ordered outward from a focal point) masking a posterised,
 * lifted, granulated version of the photo, multiplied over a generated paper texture.
 */
(function (root) {
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DEFAULTS = {
    width: 1440,
    height: 810,
    seed: 31,
    focal: [0.52, 0.6],   // where the painting starts, in 0..1 image coords
    saturation: 1.35,     // pigment saturation boost (1 = untouched)
    lift: 0.84,           // how much white paper shows through the darks (lower = lighter)
    posterize: 20,        // colour quantisation step, 0 = off
    inkStrength: 1,       // 0 = pure wash, no visible line work
    inkThreshold: 0.16,   // Sobel cut-off; raise for fewer, bolder contours
    blotCount: 95,        // wash blots; more = smoother coverage, slower frames
    spatter: 0,           // flicked droplets (dark), 0 = none
    spatterLight: 0,      // lifted white droplets
    paper: '#f6f3ec',
    feather: true,        // soft paper border, as in a real sheet
    // Patched in for the app's transparent-PNG character cutouts: once
    // true, every layer (paper fill included) is clipped to the source
    // image's own alpha channel as the very last compositing step, so a
    // subject on a transparent background paints in as just that subject
    // — no surrounding paper rectangle — instead of the usual full-frame
    // sheet. Off by default; every other caller keeps the full sheet.
    clipToSourceAlpha: false,
    // phase windows, in overall progress (0..1)
    ink: [0.05, 0.45],
    blots: [0.2, 0.92],
    blotFade: 0.14        // how long one blot takes to bloom, in progress units
  };

  /* ---------- asset builders (run once) ---------- */

  function buildPaper(seed, color) {
    const p = cv(512, 512), g = p.getContext('2d');
    const rnd = mulberry32(seed);
    g.fillStyle = color; g.fillRect(0, 0, 512, 512);
    const id = g.getImageData(0, 0, 512, 512), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 26;
      d[i] += n; d[i + 1] += n * 0.95; d[i + 2] += n * 0.8;
    }
    g.putImageData(id, 0, 0);
    g.globalAlpha = 0.35;
    for (let i = 0; i < 900; i++) {
      const x = rnd() * 512, y = rnd() * 512, l = 4 + rnd() * 22, a = rnd() * Math.PI;
      g.strokeStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(150,140,125,0.35)';
      g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return p;
  }

  function buildPaint(img, o) {
    const { width: W, height: H } = o;
    const c = cv(W, H), g = c.getContext('2d');
    g.filter = 'blur(2.2px)';
    g.drawImage(img, 0, 0, W, H);
    g.filter = 'none';
    const id = g.getImageData(0, 0, W, H), d = id.data, step = o.posterize;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], gr = d[i + 1], b = d[i + 2];
      const l = 0.299 * r + 0.587 * gr + 0.114 * b;
      r = l + (r - l) * o.saturation; gr = l + (gr - l) * o.saturation; b = l + (b - l) * o.saturation;
      r = 255 - (255 - r) * o.lift; gr = 255 - (255 - gr) * o.lift; b = 255 - (255 - b) * (o.lift + 0.02);
      if (step > 0) {
        d[i] = Math.round(clamp01(r / 255) * 255 / step) * step;
        d[i + 1] = Math.round(clamp01(gr / 255) * 255 / step) * step;
        d[i + 2] = Math.round(clamp01(b / 255) * 255 / step) * step;
      } else { d[i] = r; d[i + 1] = gr; d[i + 2] = b; }
    }
    g.putImageData(id, 0, 0);
    const rnd = mulberry32(o.seed + 46);
    g.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 2600; i++) {           // pigment granulation
      g.fillStyle = `rgba(90,80,95,${0.02 + rnd() * 0.05})`;
      g.beginPath(); g.arc(rnd() * W, rnd() * H, 1 + rnd() * 5, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  function buildInk(img, o) {
    const { width: W, height: H } = o;
    const c = cv(W, H), g = c.getContext('2d');
    g.filter = 'blur(1.1px)';
    g.drawImage(img, 0, 0, W, H);
    g.filter = 'none';
    let src;
    try { src = g.getImageData(0, 0, W, H).data; }
    catch (e) { console.warn('[watercolor-reveal] canvas is tainted (cross-origin image) — contours disabled'); return c; }
    const lum = new Float32Array(W * H);
    for (let i = 0, p = 0; i < src.length; i += 4, p++) lum[p] = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) / 255;
    const out = g.createImageData(W, H), d = out.data;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = -lum[i - W - 1] - 2 * lum[i - 1] - lum[i + W - 1] + lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1];
        const gy = -lum[i - W - 1] - 2 * lum[i - W] - lum[i - W + 1] + lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1];
        let m = clamp01((Math.sqrt(gx * gx + gy * gy) - o.inkThreshold) / 0.5);
        m = Math.pow(m, 0.85);
        const j = i * 4;
        d[j] = 52; d[j + 1] = 44; d[j + 2] = 56; d[j + 3] = Math.round(m * 235);
      }
    }
    g.putImageData(out, 0, 0);
    return c;
  }

  function makeBlots(o) {
    const { width: W, height: H } = o;
    const rnd = mulberry32(o.seed);
    const cx = W * o.focal[0], cy = H * o.focal[1];
    const cols = 11, rows = 7, list = [];
    for (let i = 0; i < o.blotCount; i++) {
      let x, y, r;
      if (i < cols * rows) {
        const gx = i % cols, gy = Math.floor(i / cols);
        x = (gx + 0.5 + (rnd() - 0.5) * 0.85) * (W / cols);
        y = (gy + 0.5 + (rnd() - 0.5) * 0.85) * (H / rows);
        r = 92 + rnd() * 78;
      } else { x = rnd() * W; y = rnd() * H; r = 46 + rnd() * 70; }
      const pts = [];
      for (let p = 0; p < 16; p++) pts.push(0.62 + rnd() * 0.62);
      const dist = Math.hypot((x - cx) / W, (y - cy) / H) / 0.62;
      list.push({ x, y, r: r * (W / 1440), pts, d: clamp01(dist + (rnd() - 0.5) * 0.16), rot: rnd() * 7, wob: rnd() * 7 });
    }
    list.sort((a, b) => a.d - b.d);   // paint outward from the focal point
    return list;
  }

  function blotPath(g, b, r, wobble) {
    const pts = b.pts, n = pts.length, P = [];
    for (let i = 0; i < n; i++) {
      const a = b.rot + (i / n) * Math.PI * 2;
      const rr = r * pts[i] * (1 + Math.sin(b.wob + i * 1.7 + wobble) * 0.05);
      P.push([b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr * 0.86]);
    }
    g.beginPath();
    g.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
    for (let i = 0; i < n; i++) {
      const c = P[i], nx = P[(i + 1) % n];
      g.quadraticCurveTo(c[0], c[1], (c[0] + nx[0]) / 2, (c[1] + nx[1]) / 2);
    }
    g.closePath();
  }

  // Resolves any valid CSS colour string to "r,g,b" via a 1x1 canvas —
  // handles hex/rgb()/named/CSS-var-computed values alike, so the edge
  // feather below can share the exact colour passed as `paper` instead of
  // a hardcoded shade.
  function resolveRGB(color) {
    const c = cv(1, 1), g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, 1, 1);
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
    return r + ',' + gr + ',' + b;
  }

  function buildFrame(o) {
    const { width: W, height: H } = o;
    const c = cv(W, H), g = c.getContext('2d');
    const rgb = resolveRGB(o.paper);
    g.globalAlpha = 1;
    const grad = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(' + rgb + ',1)');
      gr.addColorStop(0.55, 'rgba(' + rgb + ',0.55)');
      gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      return gr;
    };
    g.fillStyle = grad(0, 0, 0, H * 0.22); g.fillRect(0, 0, W, H * 0.22);
    g.fillStyle = grad(0, H, 0, H * 0.78); g.fillRect(0, H * 0.78, W, H * 0.22);
    g.fillStyle = grad(0, 0, W * 0.14, 0); g.fillRect(0, 0, W * 0.14, H);
    g.fillStyle = grad(W, 0, W * 0.86, 0); g.fillRect(W * 0.86, 0, W * 0.14, H);
    return c;
  }

  /* ---------- the effect ---------- */

  function create(opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    if (!o.src && !o.image) throw new Error('watercolor-reveal: pass src or image');
    return new Promise((resolve, reject) => {
      const done = (img) => {
        const W = o.width, H = o.height;
        const A = {
          img,
          paint: buildPaint(img, o),
          ink: buildInk(img, o),
          paperPattern: cv(8, 8).getContext('2d').createPattern(buildPaper(o.seed + 5, o.paper), 'repeat'),
          blots: makeBlots(o),
          mask: cv(W, H), tmp: cv(W, H), frame: buildFrame(o)
        };
        resolve({
          options: o,
          assets: A,
          /** Draw the painting at overall progress p (0..1) onto any canvas. */
          draw: (canvas, p) => drawFrame(canvas, A, clamp01(p), o),
          /** Convenience: draw from seconds. */
          drawAt: (canvas, seconds, duration) => drawFrame(canvas, A, clamp01(seconds / duration), o)
        });
      };
      if (o.image) return done(o.image);
      const img = new Image();
      if (o.crossOrigin) img.crossOrigin = o.crossOrigin;
      img.onload = () => done(img);
      img.onerror = () => reject(new Error('watercolor-reveal: could not load ' + o.src));
      img.src = o.src;
    });
  }

  function drawFrame(canvas, A, p, o) {
    const W = o.width, H = o.height;
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.save();
    g.scale(canvas.width / W, canvas.height / H);
    g.fillStyle = A.paperPattern;
    g.fillRect(0, 0, W, H);

    const wob = p * 12;

    /* ink contours, revealed by an expanding ragged wet edge */
    const inkP = smooth((p - o.ink[0]) / (o.ink[1] - o.ink[0]));
    if (o.inkStrength > 0 && inkP > 0.002) {
      const mg = A.mask.getContext('2d');
      mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, W, H); mg.fillStyle = '#000';
      const R = inkP * W * 0.82;
      for (let i = 0; i < 7; i++) {
        const a = i * 1.31;
        blotPath(mg, { x: W * o.focal[0] + Math.cos(a) * R * 0.34, y: H * o.focal[1] + Math.sin(a) * R * 0.26,
                       pts: A.blots[i * 3].pts, rot: a, wob: i }, R * 0.82, wob);
        mg.fill();
      }
      const tg = A.tmp.getContext('2d');
      tg.setTransform(1, 0, 0, 1, 0, 0); tg.clearRect(0, 0, W, H);
      tg.drawImage(A.ink, 0, 0);
      tg.globalCompositeOperation = 'destination-in';
      tg.filter = 'blur(14px)';
      tg.drawImage(A.mask, 0, 0);
      tg.filter = 'none'; tg.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = (0.34 + 0.5 * smooth(inkP * 1.6)) * o.inkStrength;
      g.drawImage(A.tmp, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }

    /* washes: blots bloom outward from the focal point */
    const b0 = o.blots[0], span = (o.blots[1] - o.blots[0]) * 0.82;
    const mg = A.mask.getContext('2d');
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, W, H);
    let any = false;
    for (const b of A.blots) {
      const bp = smooth((p - (b0 + b.d * span)) / o.blotFade);
      if (bp <= 0.003) continue;
      any = true;
      mg.fillStyle = `rgba(0,0,0,${0.5 + 0.5 * bp})`;
      blotPath(mg, b, b.r * (0.34 + 0.66 * bp) * 1.12, wob);
      mg.fill();
    }
    if (any) {
      const tg = A.tmp.getContext('2d');
      tg.setTransform(1, 0, 0, 1, 0, 0); tg.clearRect(0, 0, W, H);
      tg.drawImage(A.paint, 0, 0);
      tg.globalCompositeOperation = 'destination-in';
      tg.filter = 'blur(9px)';
      tg.drawImage(A.mask, 0, 0);
      tg.filter = 'none'; tg.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.94; g.drawImage(A.tmp, 0, 0);
      g.globalAlpha = 0.22; g.filter = 'blur(3px)'; g.drawImage(A.tmp, 0, 0);  // pigment settling at wet edges
      g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }

    /* line work back on top so the drawing survives the wash */
    if (o.inkStrength > 0 && inkP > 0.002) {
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.3 * smooth((p - o.blots[0]) / 0.2) * o.inkStrength;
      g.drawImage(A.ink, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }

    /* flicked droplets */
    if (o.spatter > 0) {
      const rnd = mulberry32(o.seed + 2024);
      g.globalCompositeOperation = 'multiply';
      for (let i = 0; i < o.spatter; i++) {
        const x = rnd() * W, y = rnd() * H, r = 1.2 + rnd() * 7.5, t0 = b0 + rnd() * span;
        const dp = smooth((p - t0) / 0.05);
        if (dp <= 0.01) continue;
        g.globalAlpha = dp * (0.1 + rnd() * 0.22);
        g.fillStyle = i % 3 === 0 ? 'rgba(70,60,72,1)' : 'rgba(120,95,70,1)';
        g.beginPath(); g.arc(x, y, r * (0.6 + 0.4 * dp), 0, 7); g.fill();
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    if (o.spatterLight > 0) {
      const rnd = mulberry32(o.seed + 909);
      for (let i = 0; i < o.spatterLight; i++) {
        const x = rnd() * W, y = rnd() * H, r = 1.5 + rnd() * 6, t0 = b0 + rnd() * span;
        const dp = smooth((p - t0) / 0.05);
        if (dp <= 0.01) continue;
        g.globalAlpha = dp * (0.25 + rnd() * 0.4);
        g.fillStyle = '#fbf9f4';
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }

    if (o.feather) g.drawImage(A.frame, 0, 0);

    /* clip the whole painted sheet down to the source image's own alpha —
       everything above (paper fill included) is drawn as an opaque full
       frame regardless of the source, so this is the one step that turns
       that into "just the subject" for transparent-background sources. */
    if (o.clipToSourceAlpha && A.img) {
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(A.img, 0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }

    g.restore();
  }

  const api = { create, DEFAULTS, _internals: { mulberry32, blotPath, buildPaper } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WatercolorReveal = api;
})(typeof window !== 'undefined' ? window : this);
