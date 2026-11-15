import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Download,
  FileText,
  Loader2,
  Plus,
  ScanLine,
  Trash2,
  Upload,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { createWorker } from 'tesseract.js';
import {
  detectDocumentCorners,
  enhanceCanvas,
  loadImageFromFile,
  Point2D,
  warpPerspective,
} from '../lib/imageEngine';
import { useAuth } from '../context/AuthContext';

interface ScannedPage {
  id: string;
  dataUrl: string;
  filter: 'original' | 'grayscale' | 'bw' | 'magic';
}

export const ScannerPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const [rawCanvas, setRawCanvas] = useState<HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<[Point2D, Point2D, Point2D, Point2D] | null>(null);
  const [draggingCorner, setDraggingCorner] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<'original' | 'grayscale' | 'bw' | 'magic'>('bw');

  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [ocrText, setOcrText] = useState('');
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  const { recordProcessedOutput } = useAuth();

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Camera access unavailable: ${err.message}. You can upload a document photo below.`
          : 'Camera permission denied. Upload a document photo instead.'
      );
    }
  };

  const captureFromCamera = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 1280;
    c.height = v.videoHeight || 720;
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    setRawCanvas(c);
    setCorners(detectDocumentCorners(c));
    stopCamera();
  };

  const handleUploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    const img = await loadImageFromFile(file);
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    setRawCanvas(c);
    setCorners(detectDocumentCorners(c));
  };

  const applyWarpAndAddPage = () => {
    if (!rawCanvas || !corners) return;
    const warped = warpPerspective(rawCanvas, corners, 1240, 1754);
    const filtered = enhanceCanvas(warped, 1.05, 1.15, 0.35, filterMode);
    setPages((prev) => [
      ...prev,
      {
        id: `scan_${Date.now()}`,
        dataUrl: filtered.toDataURL('image/jpeg', 0.92),
        filter: filterMode,
      },
    ]);
    setRawCanvas(null);
    setCorners(null);
    setPdfBlob(null);
  };

  const handleCombinePdf = async () => {
    if (pages.length === 0) return;
    setBuildingPdf(true);
    try {
      const doc = await PDFDocument.create();
      for (const p of pages) {
        const b64 = p.dataUrl.split(',')[1];
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const img = await doc.embedJpg(bytes);
        const page = doc.addPage([595.28, 841.89]);
        const scale = Math.min(555 / img.width, 801 / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        page.drawImage(img, {
          x: (595.28 - dw) / 2,
          y: (841.89 - dh) / 2,
          width: dw,
          height: dh,
        });
      }
      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      setPdfBlob(blob);

      await recordProcessedOutput({
        toolSlug: 'scan-to-pdf',
        toolName: 'Document Scanner',
        inputFileName: `${pages.length}_scanned_pages`,
        outputFileName: `scanned_document_${Date.now()}.pdf`,
        mimeType: 'application/pdf',
        blob,
      });
    } finally {
      setBuildingPdf(false);
    }
  };

  const runOcrOnPages = async () => {
    if (pages.length === 0) return;
    setOcrProgress(5);
    setOcrText('');
    const worker = await createWorker('eng');
    try {
      const chunks: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        const { data } = await worker.recognize(pages[i].dataUrl);
        chunks.push(`--- Page ${i + 1} ---\n${data.text}`);
        setOcrProgress(Math.round(((i + 1) / pages.length) * 100));
      }
      setOcrText(chunks.join('\n\n'));
    } finally {
      await worker.terminate();
      setOcrProgress(null);
    }
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
              <ScanLine className="w-6 h-6 text-sky-600" />
              Document Scanner
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Camera capture, automatic edge detection, 4-corner perspective correction, B&amp;W readability filters, multi-page PDF &amp; OCR.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={startCamera}
          className="px-6 py-3 rounded-lg text-sm font-bold text-white shadow-sm cursor-pointer inline-flex items-center gap-2"
          style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
        >
          <Camera className="w-4 h-4" />
          <span>Scan Document</span>
        </button>
      </div>

      {cameraError && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
          {cameraError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Capture / Edge Correction Workspace */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          {cameraActive ? (
            <div className="space-y-3">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full max-h-[460px] rounded-lg bg-black object-contain"
              />
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={captureFromCamera}
                  className="px-6 py-2.5 rounded-lg text-sm font-bold text-white cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
                >
                  Capture Page
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : rawCanvas && corners ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Drag the 4 corner handles to align document edges
                </p>
                <div className="flex items-center gap-1.5">
                  {(['bw', 'grayscale', 'magic', 'original'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilterMode(f)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold border cursor-pointer ${
                        filterMode === f
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {f === 'bw' ? 'B&W Crisp' : f === 'magic' ? 'Enhance' : f === 'grayscale' ? 'Grayscale' : 'Original'}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="relative inline-block w-full select-none touch-none border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-950"
                onPointerMove={(e) => {
                  if (draggingCorner === null) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.max(0, Math.min(rawCanvas.width, ((e.clientX - rect.left) / rect.width) * rawCanvas.width));
                  const y = Math.max(0, Math.min(rawCanvas.height, ((e.clientY - rect.top) / rect.height) * rawCanvas.height));
                  setCorners((prev) => {
                    if (!prev) return prev;
                    const copy: [Point2D, Point2D, Point2D, Point2D] = [...prev] as [Point2D, Point2D, Point2D, Point2D];
                    copy[draggingCorner] = { x, y };
                    return copy;
                  });
                }}
                onPointerUp={() => setDraggingCorner(null)}
              >
                <img
                  src={rawCanvas.toDataURL('image/jpeg', 0.85)}
                  alt="Captured document"
                  referrerPolicy="no-referrer"
                  className="w-full h-auto block pointer-events-none"
                />
                <svg
                  viewBox={`0 0 ${rawCanvas.width} ${rawCanvas.height}`}
                  className="absolute inset-0 w-full h-full"
                >
                  <polygon
                    points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
                    fill="rgba(220, 38, 38, 0.14)"
                    stroke="#dc2626"
                    strokeWidth="4"
                  />
                  {corners.map((c, idx) => (
                    <circle
                      key={idx}
                      cx={c.x}
                      cy={c.y}
                      r={18}
                      fill="#ffffff"
                      stroke="#dc2626"
                      strokeWidth="5"
                      className="cursor-grab"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDraggingCorner(idx);
                      }}
                    />
                  ))}
                </svg>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRawCanvas(null);
                    setCorners(null);
                  }}
                  className="px-4 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={applyWarpAndAddPage}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
                >
                  <Check className="w-4 h-4" />
                  Crop &amp; Add Page
                </button>
              </div>
            </div>
          ) : (
            <div className="py-14 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 flex items-center justify-center">
                <ScanLine className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-md">
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                  Capture or Upload Document Pages
                </h2>
                <p className="text-sm text-slate-500">
                  Use your device camera for live document scanning or upload an existing photo to correct perspective and enhance text.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
                >
                  <Camera className="w-4 h-4" />
                  Open Camera
                </button>
                <label className="px-5 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Upload Document Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleUploadPhoto(e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Right: Multi-Page Queue + Export + OCR */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-950 dark:text-white">
              Scanned Pages ({pages.length})
            </h3>
            <label className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 cursor-pointer hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add from File
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleUploadPhoto(e.target.files?.[0])}
                className="hidden"
              />
            </label>
          </div>

          {pages.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              No scanned pages added yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
              {pages.map((p, idx) => (
                <div key={p.id} className="relative group border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <img
                    src={p.dataUrl}
                    alt={`Scanned page ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-32 object-cover"
                  />
                  <div className="px-2 py-1 text-[11px] font-mono bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
                    <span>Page {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => setPages((prev) => prev.filter((x) => x.id !== p.id))}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                      aria-label="Delete scanned page"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={pages.length === 0 || buildingPdf}
              onClick={handleCombinePdf}
              className="flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-1.5"
              style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
            >
              {buildingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Combine into PDF
            </button>
            <button
              type="button"
              disabled={pages.length === 0 || ocrProgress !== null}
              onClick={runOcrOnPages}
              className="px-4 py-2.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 disabled:opacity-50 cursor-pointer"
            >
              {ocrProgress !== null ? `OCR ${ocrProgress}%` : 'Extract OCR Text'}
            </button>
          </div>

          {pdfBlob && (
            <button
              type="button"
              onClick={() => {
                const url = URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `scanned_${pages.length}pages.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="w-full px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Combined PDF ({(pdfBlob.size / 1024).toFixed(0)} KB)
            </button>
          )}

          {ocrText && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Extracted OCR Text</span>
                <button
                  type="button"
                  onClick={() => {
                    const b = new Blob([ocrText], { type: 'text/plain' });
                    const url = URL.createObjectURL(b);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'scanned_ocr_text.txt';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="text-xs text-sky-600 hover:underline cursor-pointer"
                >
                  Download .TXT
                </button>
              </div>
              <textarea
                readOnly
                value={ocrText}
                rows={6}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
