import React, { useRef, useState } from 'react';
import { Eraser, Upload } from 'lucide-react';

interface SignaturePadProps {
  onSelectSignature: (dataUrl: string) => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ onSelectSignature }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedName, setTypedName] = useState('Kartik Rajak');
  const [inkColor, setInkColor] = useState('#0f172a');

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(((e.clientX - rect.left) / rect.width) * canvas.width, ((e.clientY - rect.top) / rect.height) * canvas.height);
    setDrawing(true);
  };

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d')!;
    ctx.lineTo(((e.clientX - rect.left) / rect.width) * canvas.width, ((e.clientY - rect.top) / rect.height) * canvas.height);
    ctx.stroke();
  };

  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    if (canvasRef.current) {
      onSelectSignature(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
  };

  const generateTypedSignature = (text: string) => {
    setTypedName(text);
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 140;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = inkColor;
    ctx.font = 'italic 600 46px Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text || 'Signature', 20, 72);
    onSelectSignature(c.toDataURL('image/png'));
  };

  const handleUploadSig = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onSelectSignature(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(['draw', 'type', 'upload'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                mode === m
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {m === 'draw' ? 'Draw' : m === 'type' ? 'Type' : 'Upload'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={inkColor}
            onChange={(e) => setInkColor(e.target.value)}
            className="w-6 h-6 rounded border border-slate-300 cursor-pointer"
            title="Signature ink color"
          />
          {mode === 'draw' && (
            <button
              type="button"
              onClick={clearPad}
              className="text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1 cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {mode === 'draw' && (
        <canvas
          ref={canvasRef}
          width={480}
          height={140}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
          className="w-full h-32 bg-white rounded border border-slate-300 touch-none cursor-crosshair"
        />
      )}

      {mode === 'type' && (
        <div className="space-y-2">
          <input
            type="text"
            value={typedName}
            onChange={(e) => generateTypedSignature(e.target.value)}
            placeholder="Type your signature name"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={() => generateTypedSignature(typedName)}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-slate-900 text-white cursor-pointer"
          >
            Apply Typed Signature
          </button>
        </div>
      )}

      {mode === 'upload' && (
        <label className="flex items-center justify-center gap-2 p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 cursor-pointer text-xs font-medium">
          <Upload className="w-4 h-4" />
          <span>Upload transparent PNG / JPG signature</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleUploadSig(e.target.files?.[0])}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
};
