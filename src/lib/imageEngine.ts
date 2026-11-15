export interface Point2D {
  x: number;
  y: number;
}

export function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file.'));
    };
    img.src = url;
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, mime = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Failed to encode image canvas.'));
        else resolve(blob);
      },
      mime,
      quality
    );
  });
}

export async function processImageViaServer(
  file: File | Blob,
  options: {
    width?: number;
    height?: number;
    format?: 'jpeg' | 'png' | 'webp';
    quality?: number;
    rotate?: number;
    brightness?: number;
    contrast?: number;
    sharpen?: boolean;
    denoise?: boolean;
    grayscale?: boolean;
    fit?: 'inside' | 'cover' | 'fill' | 'contain';
  }
): Promise<Blob> {
  const form = new FormData();
  form.append('image', file, file instanceof File ? file.name : 'image.jpg');
  if (options.width) form.append('width', String(Math.round(options.width)));
  if (options.height) form.append('height', String(Math.round(options.height)));
  if (options.format) form.append('format', options.format);
  if (options.quality !== undefined) form.append('quality', String(options.quality));
  if (options.rotate) form.append('rotate', String(options.rotate));
  if (options.brightness !== undefined) form.append('brightness', String(options.brightness));
  if (options.contrast !== undefined) form.append('contrast', String(options.contrast));
  if (options.sharpen) form.append('sharpen', 'true');
  if (options.denoise) form.append('denoise', 'true');
  if (options.grayscale) form.append('grayscale', 'true');
  if (options.fit) form.append('fit', options.fit);

  const res = await fetch('/api/images/process', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Image processing failed' }));
    throw new Error(err.error || 'Image processing failed');
  }
  return res.blob();
}

/**
 * Local heuristic portrait face finder fallback when AI or browser FaceDetector is unavailable.
 */
export function detectFaceHeuristic(canvas: HTMLCanvasElement): {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
} {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { xmin: 250, ymin: 150, xmax: 750, ymax: 700 };
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  let count = 0;

  for (let y = Math.floor(h * 0.08); y < Math.floor(h * 0.78); y += 2) {
    for (let x = Math.floor(w * 0.15); x < Math.floor(w * 0.85); x += 2) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // General human skin luminance / chroma range across diverse skin tones
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (r > 60 && g > 40 && b > 20 && cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }

  if (count < 80) {
    return { xmin: 260, ymin: 140, xmax: 740, ymax: 680 };
  }

  // Expand slightly upward for hair crown
  const boxH = maxY - minY;
  const adjMinY = Math.max(0, minY - boxH * 0.3);
  return {
    xmin: Math.round((minX / w) * 1000),
    ymin: Math.round((adjMinY / h) * 1000),
    xmax: Math.round((maxX / w) * 1000),
    ymax: Math.round((maxY / h) * 1000),
  };
}

/**
 * Smart subject-preserving background removal & replacement using border color sampling + edge flood & feathering.
 */
export function replaceBackgroundCanvas(
  sourceCanvas: HTMLCanvasElement,
  bgColor: string | 'transparent',
  tolerance = 42,
  faceBox?: { xmin: number; ymin: number; xmax: number; ymax: number }
): HTMLCanvasElement {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(sourceCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Sample perimeter pixels to estimate dominant background color
  const samples: Array<[number, number, number]> = [];
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 40))) {
    const topIdx = x * 4;
    samples.push([data[topIdx], data[topIdx + 1], data[topIdx + 2]]);
  }
  for (let y = 0; y < Math.floor(h * 0.65); y += Math.max(1, Math.floor(h / 40))) {
    const leftIdx = y * w * 4;
    const rightIdx = (y * w + (w - 1)) * 4;
    samples.push([data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]]);
    samples.push([data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]]);
  }

  let avgR = 0;
  let avgG = 0;
  let avgB = 0;
  for (const [r, g, b] of samples) {
    avgR += r;
    avgG += g;
    avgB += b;
  }
  avgR /= samples.length || 1;
  avgG /= samples.length || 1;
  avgB /= samples.length || 1;

  // Protected ellipse around detected face & torso so subject interior is never eroded
  const cx = faceBox ? ((faceBox.xmin + faceBox.xmax) / 2000) * w : w * 0.5;
  const cy = faceBox ? ((faceBox.ymin + faceBox.ymax) / 2000) * h : h * 0.42;
  const rx = faceBox ? Math.max(w * 0.16, ((faceBox.xmax - faceBox.xmin) / 1000) * w * 0.55) : w * 0.24;
  const ry = faceBox ? Math.max(h * 0.22, ((faceBox.ymax - faceBox.ymin) / 1000) * h * 0.62) : h * 0.3;

  // Flood fill from corners & top border to remove connected background cleanly
  const mask = new Uint8Array(w * h); // 0 = foreground, 1 = bg, 2 = soft edge
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const pushIfBg = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    visited[p] = 1;

    // Protect inner core of face
    const dx = (x - cx) / (rx * 0.72);
    const dy = (y - cy) / (ry * 0.72);
    if (dx * dx + dy * dy < 1) return;

    const idx = p * 4;
    const dr = data[idx] - avgR;
    const dg = data[idx + 1] - avgG;
    const db = data[idx + 2] - avgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist <= tolerance) {
      mask[p] = 1;
      queue[tail++] = p;
    } else if (dist <= tolerance + 16) {
      mask[p] = 2;
    }
  };

  for (let x = 0; x < w; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    pushIfBg(0, y);
    pushIfBg(w - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    pushIfBg(x + 1, y);
    pushIfBg(x - 1, y);
    pushIfBg(x, y + 1);
    pushIfBg(x, y - 1);
  }

  let fillR = 255;
  let fillG = 255;
  let fillB = 255;
  if (bgColor !== 'transparent') {
    const hex = bgColor.replace('#', '');
    if (hex.length === 6) {
      fillR = parseInt(hex.slice(0, 2), 16);
      fillG = parseInt(hex.slice(2, 4), 16);
      fillB = parseInt(hex.slice(4, 6), 16);
    }
  }

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    if (mask[i] === 1) {
      if (bgColor === 'transparent') {
        data[idx + 3] = 0;
      } else {
        data[idx] = fillR;
        data[idx + 1] = fillG;
        data[idx + 2] = fillB;
        data[idx + 3] = 255;
      }
    } else if (mask[i] === 2) {
      if (bgColor === 'transparent') {
        data[idx + 3] = 140;
      } else {
        data[idx] = Math.round(data[idx] * 0.45 + fillR * 0.55);
        data[idx + 1] = Math.round(data[idx + 1] * 0.45 + fillG * 0.55);
        data[idx + 2] = Math.round(data[idx + 2] * 0.45 + fillB * 0.55);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return out;
}

/**
 * Apply brightness, contrast, and unsharp convolution filter to a canvas.
 */
export function enhanceCanvas(
  source: HTMLCanvasElement,
  brightness: number,
  contrast: number,
  sharpness: number,
  filterMode: 'original' | 'grayscale' | 'bw' | 'magic' = 'original'
): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(source, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  const bOffset = (brightness - 1) * 90;
  const cFactor = contrast;

  for (let i = 0; i < d.length; i += 4) {
    let r = (d[i] - 128) * cFactor + 128 + bOffset;
    let g = (d[i + 1] - 128) * cFactor + 128 + bOffset;
    let b = (d[i + 2] - 128) * cFactor + 128 + bOffset;

    if (filterMode === 'grayscale') {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = lum;
    } else if (filterMode === 'bw') {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const bin = lum > 138 ? 255 : lum < 95 ? 12 : (lum - 95) * (243 / 43);
      r = g = b = bin;
    } else if (filterMode === 'magic') {
      r = (r - 128) * 1.25 + 138;
      g = (g - 128) * 1.25 + 138;
      b = (b - 128) * 1.25 + 138;
    }

    d[i] = Math.max(0, Math.min(255, r));
    d[i + 1] = Math.max(0, Math.min(255, g));
    d[i + 2] = Math.max(0, Math.min(255, b));
  }

  ctx.putImageData(imgData, 0, 0);

  if (sharpness > 0) {
    const srcCopy = ctx.getImageData(0, 0, w, h);
    const dst = ctx.createImageData(w, h);
    const sData = srcCopy.data;
    const dData = dst.data;
    const amt = Math.min(1.5, sharpness);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = sData[idx + c];
          const blur =
            (sData[((y - 1) * w + x) * 4 + c] +
              sData[((y + 1) * w + x) * 4 + c] +
              sData[(y * w + (x - 1)) * 4 + c] +
              sData[(y * w + (x + 1)) * 4 + c]) /
            4;
          const sharpened = center + amt * (center - blur);
          dData[idx + c] = Math.max(0, Math.min(255, sharpened));
        }
        dData[idx + 3] = sData[idx + 3];
      }
    }
    ctx.putImageData(dst, 0, 0);
  }

  return out;
}

/**
 * Automatic document quad corner detection using edge luminance scanning.
 */
export function detectDocumentCorners(canvas: HTMLCanvasElement): [Point2D, Point2D, Point2D, Point2D] {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return [
      { x: w * 0.1, y: h * 0.1 },
      { x: w * 0.9, y: h * 0.1 },
      { x: w * 0.9, y: h * 0.9 },
      { x: w * 0.1, y: h * 0.9 },
    ];
  }

  const data = ctx.getImageData(0, 0, w, h).data;
  // Find bright paper region bounding hints
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  let brightCount = 0;

  for (let y = Math.floor(h * 0.04); y < Math.floor(h * 0.96); y += 4) {
    for (let x = Math.floor(w * 0.04); x < Math.floor(w * 0.96); x += 4) {
      const idx = (y * w + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (lum > 165) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        brightCount++;
      }
    }
  }

  if (brightCount < 50 || maxX - minX < w * 0.25 || maxY - minY < h * 0.25) {
    return [
      { x: Math.round(w * 0.08), y: Math.round(h * 0.08) },
      { x: Math.round(w * 0.92), y: Math.round(h * 0.08) },
      { x: Math.round(w * 0.92), y: Math.round(h * 0.92) },
      { x: Math.round(w * 0.08), y: Math.round(h * 0.92) },
    ];
  }

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/**
 * Perspective correction warp (planar homography) mapping 4 arbitrary corners [TL, TR, BR, BL]
 * onto a flat rectangular document canvas.
 */
export function warpPerspective(
  source: HTMLCanvasElement,
  corners: [Point2D, Point2D, Point2D, Point2D],
  outWidth = 1240,
  outHeight = 1754
): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners;

  // Estimate aspect ratio from quad edges
  const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);
  const estW = Math.max(200, Math.round((topW + botW) / 2));
  const estH = Math.max(200, Math.round((leftH + rightH) / 2));
  const scale = Math.min(outWidth / estW, outHeight / estH, 2);
  const dstW = Math.round(estW * scale);
  const dstH = Math.round(estH * scale);

  const out = document.createElement('canvas');
  out.width = dstW;
  out.height = dstH;
  const outCtx = out.getContext('2d')!;
  const srcCtx = source.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, source.width, source.height);
  const dstData = outCtx.createImageData(dstW, dstH);

  // Compute 3x3 homography from destination unit square (0..1, 0..1) -> source quad
  // Solve linear system for projective mapping (u,v) -> (x,y)
  const dx1 = tr.x - br.x;
  const dx2 = bl.x - br.x;
  const dx3 = tl.x - tr.x + br.x - bl.x;
  const dy1 = tr.y - br.y;
  const dy2 = bl.y - br.y;
  const dy3 = tl.y - tr.y + br.y - bl.y;

  const det = dx1 * dy2 - dx2 * dy1;
  let g = 0;
  let hCoeff = 0;
  if (Math.abs(det) > 1e-6) {
    g = (dx3 * dy2 - dx2 * dy3) / det;
    hCoeff = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const a = tr.x - tl.x + g * tr.x;
  const b = bl.x - tl.x + hCoeff * bl.x;
  const c = tl.x;
  const d = tr.y - tl.y + g * tr.y;
  const e = bl.y - tl.y + hCoeff * bl.y;
  const f = tl.y;

  const sw = source.width;
  const sh = source.height;
  const sBuf = srcData.data;
  const dBuf = dstData.data;

  for (let y = 0; y < dstH; y++) {
    const v = y / (dstH - 1 || 1);
    for (let x = 0; x < dstW; x++) {
      const u = x / (dstW - 1 || 1);
      const denom = g * u + hCoeff * v + 1;
      const sx = (a * u + b * v + c) / denom;
      const sy = (d * u + e * v + f) / denom;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const dstIdx = (y * dstW + x) * 4;

      if (x0 >= 0 && x0 < sw - 1 && y0 >= 0 && y0 < sh - 1) {
        const fx = sx - x0;
        const fy = sy - y0;
        const i00 = (y0 * sw + x0) * 4;
        const i10 = (y0 * sw + x0 + 1) * 4;
        const i01 = ((y0 + 1) * sw + x0) * 4;
        const i11 = ((y0 + 1) * sw + x0 + 1) * 4;

        for (let ch = 0; ch < 3; ch++) {
          const val =
            sBuf[i00 + ch] * (1 - fx) * (1 - fy) +
            sBuf[i10 + ch] * fx * (1 - fy) +
            sBuf[i01 + ch] * (1 - fx) * fy +
            sBuf[i11 + ch] * fx * fy;
          dBuf[dstIdx + ch] = val;
        }
        dBuf[dstIdx + 3] = 255;
      } else {
        dBuf[dstIdx] = 255;
        dBuf[dstIdx + 1] = 255;
        dBuf[dstIdx + 2] = 255;
        dBuf[dstIdx + 3] = 255;
      }
    }
  }

  outCtx.putImageData(dstData, 0, 0);
  return out;
}
