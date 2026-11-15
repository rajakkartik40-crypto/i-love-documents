import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
  ScanFace,
  Upload,
  UserSquare2,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import {
  canvasToBlob,
  detectFaceHeuristic,
  enhanceCanvas,
  loadImageFromFile,
  replaceBackgroundCanvas,
} from '../lib/imageEngine';
import { useAuth } from '../context/AuthContext';

interface PassportPreset {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

const PASSPORT_PRESETS: PassportPreset[] = [
  { id: 'us', label: 'United States (2×2 in / 51×51 mm)', widthMm: 51, heightMm: 51 },
  { id: 'in', label: 'India (35×45 mm)', widthMm: 35, heightMm: 45 },
  { id: 'uk', label: 'United Kingdom (35×45 mm)', widthMm: 35, heightMm: 45 },
  { id: 'eu', label: 'Schengen / EU (35×45 mm)', widthMm: 35, heightMm: 45 },
  { id: 'ca', label: 'Canada (50×70 mm)', widthMm: 50, heightMm: 70 },
  { id: 'jp', label: 'Japan (35×45 mm)', widthMm: 35, heightMm: 45 },
  { id: 'custom', label: 'Custom Size (mm)', widthMm: 35, heightMm: 45 },
];

export const PassportPhotoPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [presetId, setPresetId] = useState('in');
  const [customW, setCustomW] = useState(35);
  const [customH, setCustomH] = useState(45);

  const [bgMode, setBgMode] = useState<'original' | 'white' | 'blue' | 'lightblue' | 'custom'>('white');
  const [customBgColor, setCustomBgColor] = useState('#e2e8f0');
  const [bgTolerance, setBgTolerance] = useState(42);

  const [brightness, setBrightness] = useState(1.0);
  const [contrast, setContrast] = useState(1.05);
  const [sharpness, setSharpness] = useState(0.25);

  const [faceBox, setFaceBox] = useState<{ xmin: number; ymin: number; xmax: number; ymax: number }>({
    xmin: 260,
    ymin: 140,
    xmax: 740,
    ymax: 680,
  });
  const [zoomOffset, setZoomOffset] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const [sheetCount, setSheetCount] = useState<1 | 4 | 8 | 16 | 'custom'>(8);
  const [customCount, setCustomCount] = useState(12);

  const [detecting, setDetecting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [singlePreviewUrl, setSinglePreviewUrl] = useState('');
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState('');
  const [finalJpgBlob, setFinalJpgBlob] = useState<Blob | null>(null);
  const [finalPdfBlob, setFinalPdfBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');

  const singleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sheetCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const { recordProcessedOutput } = useAuth();

  const activePreset = PASSPORT_PRESETS.find((p) => p.id === presetId) || PASSPORT_PRESETS[1];
  const widthMm = presetId === 'custom' ? Math.max(15, customW) : activePreset.widthMm;
  const heightMm = presetId === 'custom' ? Math.max(15, customH) : activePreset.heightMm;

  const pxWidth = Math.round((widthMm / 25.4) * 300);
  const pxHeight = Math.round((heightMm / 25.4) * 300);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setFinalJpgBlob(null);
    setFinalPdfBlob(null);
    setSourceFile(file);

    try {
      const img = await loadImageFromFile(file);
      const maxDim = 1200;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      setSourceCanvas(c);

      // Auto-detect face via Gemini Vision with local heuristic fallback
      setDetecting(true);
      setStatusNote('Detecting face geometry...');
      let detected = detectFaceHeuristic(c);
      try {
        const b64 = c.toDataURL('image/jpeg', 0.8).split(',')[1];
        const res = await fetch('/api/ai/detect-face', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: b64, mimeType: 'image/jpeg' }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.found) {
            detected = { xmin: data.xmin, ymin: data.ymin, xmax: data.xmax, ymax: data.ymax };
            setStatusNote('Face centered automatically.');
          }
        }
      } catch {
        setStatusNote('Face framed using local portrait detector.');
      } finally {
        setFaceBox(detected);
        setDetecting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read photo.');
    }
  };

  const renderPassportLive = () => {
    if (!sourceCanvas) return;

    // 1. Background replacement
    const bgHex =
      bgMode === 'white'
        ? '#ffffff'
        : bgMode === 'blue'
        ? '#1d4ed8'
        : bgMode === 'lightblue'
        ? '#93c5fd'
        : customBgColor;

    const bgProcessed =
      bgMode === 'original'
        ? sourceCanvas
        : replaceBackgroundCanvas(sourceCanvas, bgHex, bgTolerance, faceBox);

    // 2. Brightness, Contrast, Sharpness
    const enhanced = enhanceCanvas(bgProcessed, brightness, contrast, sharpness, 'original');

    // 3. Crop centered on detected face box (head occupies ~65% of height, centered)
    const outSingle = document.createElement('canvas');
    outSingle.width = pxWidth;
    outSingle.height = pxHeight;
    const sCtx = outSingle.getContext('2d')!;
    sCtx.fillStyle = bgMode === 'original' ? '#ffffff' : bgHex;
    sCtx.fillRect(0, 0, pxWidth, pxHeight);

    const sw = enhanced.width;
    const sh = enhanced.height;
    const faceCx = ((faceBox.xmin + faceBox.xmax) / 2000) * sw;
    const faceCy = ((faceBox.ymin + faceBox.ymax) / 2000) * sh;
    const faceH = Math.max(sh * 0.25, ((faceBox.ymax - faceBox.ymin) / 1000) * sh);

    // Standard passport framing: crop height ~ 1.62 * head height
    const cropH = (faceH * 1.68) / zoomOffset;
    const cropW = cropH * (pxWidth / pxHeight);
    const sx = faceCx - cropW / 2 + (panX / 100) * cropW;
    const sy = faceCy - cropH * 0.44 + (panY / 100) * cropH;

    sCtx.drawImage(enhanced, sx, sy, cropW, cropH, 0, 0, pxWidth, pxHeight);
    singleCanvasRef.current = outSingle;
    setSinglePreviewUrl(outSingle.toDataURL('image/jpeg', 0.94));

    // 4. Render Printable A4 Sheet (300 DPI: 2480 x 3508 px, scaled preview 1240 x 1754)
    const count = sheetCount === 'custom' ? Math.max(1, Math.min(36, customCount)) : sheetCount;
    const a4W = 1240;
    const a4H = 1754;
    const sheet = document.createElement('canvas');
    sheet.width = a4W;
    sheet.height = a4H;
    const shCtx = sheet.getContext('2d')!;
    shCtx.fillStyle = '#ffffff';
    shCtx.fillRect(0, 0, a4W, a4H);

    if (count === 1) {
      const targetW = Math.min(a4W * 0.6, (widthMm / 210) * a4W);
      const targetH = targetW * (heightMm / widthMm);
      const ox = (a4W - targetW) / 2;
      const oy = (a4H - targetH) / 2;
      shCtx.drawImage(outSingle, ox, oy, targetW, targetH);
      shCtx.strokeStyle = '#cbd5e1';
      shCtx.lineWidth = 2;
      shCtx.strokeRect(ox, oy, targetW, targetH);
    } else {
      const photoW = (widthMm / 210) * a4W;
      const photoH = (heightMm / 297) * a4H;
      const gap = 22;
      const cols = Math.max(1, Math.min(count, Math.floor((a4W - 80) / (photoW + gap))));
      const rows = Math.ceil(count / cols);
      const gridW = cols * photoW + (cols - 1) * gap;
      const startX = (a4W - gridW) / 2;
      const startY = 80;

      for (let idx = 0; idx < count; idx++) {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        if (r >= rows) break;
        const px = startX + c * (photoW + gap);
        const py = startY + r * (photoH + gap);
        if (py + photoH > a4H - 40) break;
        shCtx.drawImage(outSingle, px, py, photoW, photoH);
        shCtx.strokeStyle = '#94a3b8';
        shCtx.setLineDash([6, 4]);
        shCtx.lineWidth = 1.5;
        shCtx.strokeRect(px, py, photoW, photoH);
        shCtx.setLineDash([]);
      }
    }

    sheetCanvasRef.current = sheet;
    setSheetPreviewUrl(sheet.toDataURL('image/jpeg', 0.92));
  };

  useEffect(() => {
    renderPassportLive();
  }, [
    sourceCanvas,
    presetId,
    customW,
    customH,
    bgMode,
    customBgColor,
    bgTolerance,
    brightness,
    contrast,
    sharpness,
    faceBox,
    zoomOffset,
    panX,
    panY,
    sheetCount,
    customCount,
  ]);

  const handleCreatePassportPhoto = async () => {
    if (!singleCanvasRef.current || !sheetCanvasRef.current || !sourceFile) {
      setError('Please upload a portrait photograph first.');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      const targetCanvas = sheetCount === 1 ? singleCanvasRef.current : sheetCanvasRef.current;
      const jpgBlob = await canvasToBlob(targetCanvas, 'image/jpeg', 0.95);
      setFinalJpgBlob(jpgBlob);

      // Generate printable A4 PDF (or single photo PDF)
      const pdfDoc = await PDFDocument.create();
      const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
      const embedded = await pdfDoc.embedJpg(jpgBytes);
      const page = pdfDoc.addPage([595.28, 841.89]); // A4
      if (sheetCount === 1) {
        const ptW = (widthMm / 25.4) * 72;
        const ptH = (heightMm / 25.4) * 72;
        page.drawImage(embedded, {
          x: (595.28 - ptW) / 2,
          y: (841.89 - ptH) / 2,
          width: ptW,
          height: ptH,
        });
      } else {
        page.drawImage(embedded, { x: 0, y: 0, width: 595.28, height: 841.89 });
      }
      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      setFinalPdfBlob(pdfBlob);

      await recordProcessedOutput({
        toolSlug: 'passport-photo-maker',
        toolName: 'Passport Size Photo Maker',
        inputFileName: sourceFile.name,
        outputFileName: `passport_${presetId}_${sheetCount}up.pdf`,
        mimeType: 'application/pdf',
        blob: pdfBlob,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create passport photo.');
    } finally {
      setProcessing(false);
    }
  };

  const triggerDownload = (blob: Blob, ext: 'jpg' | 'pdf') => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `passport_photo_${widthMm}x${heightMm}mm_${sheetCount}up.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Back to tools"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-950 dark:text-white flex items-center gap-2">
              <UserSquare2 className="w-6 h-6 text-red-600" />
              Passport Size Photo Maker
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Auto face centering, background removal &amp; replacement, country presets, and A4 printable sheets.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCreatePassportPhoto}
          disabled={!sourceCanvas || processing}
          className="px-6 py-3 rounded-lg text-sm font-bold text-white shadow-sm disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
          style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>Create Passport Photo</span>
        </button>
      </div>

      {!sourceCanvas ? (
        <div className="max-w-2xl mx-auto py-12">
          <label className="flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-red-500 transition-colors cursor-pointer text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center text-red-600">
              <Upload className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold text-slate-950 dark:text-white">
                Upload Portrait Photograph
              </p>
              <p className="text-sm text-slate-500">
                Supports JPG, JPEG, PNG, WEBP · Face is detected and centered automatically
              </p>
            </div>
            <span
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
            >
              Select Photo
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleUpload(e.target.files?.[0])}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column */}
          <div className="lg:col-span-5 space-y-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <ScanFace className="w-4 h-4 text-emerald-600" />
                {detecting ? 'Detecting face...' : statusNote || 'Ready'}
              </span>
              <label className="text-xs font-semibold text-red-600 hover:underline cursor-pointer">
                Change Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e.target.files?.[0])}
                  className="hidden"
                />
              </label>
            </div>

            {/* Country Preset */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Country &amp; Size Preset
              </label>
              <select
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {PASSPORT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {presetId === 'custom' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs text-slate-500">Width (mm)</label>
                    <input
                      type="number"
                      min={15}
                      max={150}
                      value={customW}
                      onChange={(e) => setCustomW(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Height (mm)</label>
                    <input
                      type="number"
                      min={15}
                      max={150}
                      value={customH}
                      onChange={(e) => setCustomH(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                    />
                  </div>
                </div>
              )}
              <p className="text-xs font-mono text-slate-500 tabular-nums">
                Output spec: {widthMm}×{heightMm} mm ({pxWidth}×{pxHeight} px @ 300 DPI)
              </p>
            </div>

            {/* Background Removal & Replacement */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Background Replacement
              </label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['white', 'White', '#ffffff'],
                    ['lightblue', 'Light Blue', '#93c5fd'],
                    ['blue', 'Blue', '#1d4ed8'],
                    ['original', 'Original', 'transparent'],
                    ['custom', 'Custom', customBgColor],
                  ] as const
                ).map(([id, label, swatch]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setBgMode(id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      bgMode === id
                        ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {swatch !== 'transparent' && (
                      <span
                        className="w-3 h-3 rounded-full border border-slate-300"
                        style={{ backgroundColor: swatch }}
                      />
                    )}
                    {label}
                  </button>
                ))}
              </div>

              {bgMode === 'custom' && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="color"
                    value={customBgColor}
                    onChange={(e) => setCustomBgColor(e.target.value)}
                    className="w-9 h-9 rounded border border-slate-300 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-slate-500">{customBgColor}</span>
                </div>
              )}

              {bgMode !== 'original' && (
                <div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Edge Removal Tolerance</span>
                    <span className="font-mono tabular-nums">{bgTolerance}</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={90}
                    value={bgTolerance}
                    onChange={(e) => setBgTolerance(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Framing & Enhancements */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Framing &amp; Lighting
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setZoomOffset(1);
                    setPanX(0);
                    setPanY(0);
                    setBrightness(1);
                    setContrast(1.05);
                    setSharpness(0.25);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Zoom ({zoomOffset.toFixed(2)}×)</span>
                  <input
                    type="range"
                    min={0.7}
                    max={1.5}
                    step={0.02}
                    value={zoomOffset}
                    onChange={(e) => setZoomOffset(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <span className="text-slate-500">Vertical Offset ({panY}%)</span>
                  <input
                    type="range"
                    min={-25}
                    max={25}
                    value={panY}
                    onChange={(e) => setPanY(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <span className="text-slate-500">Brightness ({brightness.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0.7}
                    max={1.4}
                    step={0.02}
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <span className="text-slate-500">Contrast ({contrast.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0.7}
                    max={1.5}
                    step={0.02}
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="text-xs">
                <span className="text-slate-500">Sharpness ({sharpness.toFixed(2)})</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sharpness}
                  onChange={(e) => setSharpness(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* A4 Sheet Layout */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Printable A4 Sheet Layout
              </label>
              <div className="flex flex-wrap gap-2">
                {([1, 4, 8, 16, 'custom'] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setSheetCount(cnt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      sheetCount === cnt
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {cnt === 1 ? 'Single Photo' : cnt === 'custom' ? 'Custom' : `${cnt} Photos`}
                  </button>
                ))}
              </div>
              {sheetCount === 'custom' && (
                <div className="pt-1">
                  <input
                    type="number"
                    min={2}
                    max={36}
                    value={customCount}
                    onChange={(e) => setCustomCount(Number(e.target.value))}
                    className="w-28 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 rounded-lg">
                {error}
              </div>
            )}

            {finalJpgBlob && finalPdfBlob && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-3">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  Passport Photo Ready
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => triggerDownload(finalJpgBlob, 'jpg')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:opacity-90 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download JPG ({(finalJpgBlob.size / 1024).toFixed(0)} KB)
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDownload(finalPdfBlob, 'pdf')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white hover:opacity-90 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download A4 PDF ({(finalPdfBlob.size / 1024).toFixed(0)} KB)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Live Preview Column */}
          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col items-center justify-center space-y-3">
              <p className="text-xs font-semibold text-slate-500">Single Passport Preview</p>
              {singlePreviewUrl && (
                <img
                  src={singlePreviewUrl}
                  alt="Single passport preview"
                  referrerPolicy="no-referrer"
                  className="max-h-72 rounded border border-slate-300 dark:border-slate-700 shadow-sm object-contain"
                />
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col items-center justify-center space-y-3">
              <p className="text-xs font-semibold text-slate-500">Printable A4 Sheet Preview</p>
              {sheetPreviewUrl && (
                <img
                  src={sheetPreviewUrl}
                  alt="Printable A4 sheet preview"
                  referrerPolicy="no-referrer"
                  className="max-h-96 rounded border border-slate-300 dark:border-slate-700 shadow-sm object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
