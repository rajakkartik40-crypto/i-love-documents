import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  FileUp,
  Loader2,
  Plus,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Trash2,
  Undo2,
} from 'lucide-react';
import { ToolDefinition } from '../types';
import { ALL_TOOLS } from '../data/tools';
import { ToolIcon } from '../components/ToolIcon';
import { SignaturePad } from '../components/SignaturePad';
import { useAuth } from '../context/AuthContext';
import {
  addPageNumbers,
  applyPdfEditsAndSignature,
  applyPdfForms,
  applyPermanentRedactions,
  comparePdfs,
  compressPdf,
  convertToPdfA,
  cropPdf,
  excelToPdf,
  extractPdfTextPages,
  htmlToPdf,
  imagesToPdf,
  inspectPdfFormFields,
  mergePdfs,
  ocrPdf,
  organizePdf,
  PdfEditOverlay,
  PdfFormFieldSpec,
  PdfPagePreview,
  pdfToExcel,
  pdfToJpgZip,
  pdfToMarkdown,
  pdfToPowerPoint,
  pdfToWord,
  powerpointToPdf,
  protectPdf,
  renderPdfPages,
  repairPdf,
  rotatePdf,
  splitPdf,
  unlockPdf,
  watermarkPdf,
  wordToPdf,
} from '../lib/pdfEngine';
import {
  canvasToBlob,
  enhanceCanvas,
  loadImageFromFile,
  processImageViaServer,
  replaceBackgroundCanvas,
} from '../lib/imageEngine';

interface ToolWorkspacePageProps {
  tool: ToolDefinition;
  initialFiles?: File[];
  onBack: () => void;
}

export const ToolWorkspacePage: React.FC<ToolWorkspacePageProps> = ({
  tool,
  initialFiles = [],
  onBack,
}) => {
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [previews, setPreviews] = useState<PdfPagePreview[]>([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultFileName, setResultFileName] = useState('');
  const [resultText, setResultText] = useState('');
  const [resultMeta, setResultMeta] = useState('');
  const [tempLink, setTempLink] = useState<{ url?: string; expiresAt?: number }>({});
  const [compareResult, setCompareResult] = useState<
    Awaited<ReturnType<typeof comparePdfs>>['pages'] | null
  >(null);
  const [jpgGallery, setJpgGallery] = useState<{ name: string; dataUrl: string }[]>([]);

  // Tool-specific options
  const [splitMode, setSplitMode] = useState<'range' | 'all'>('range');
  const [splitRange, setSplitRange] = useState('1-2');
  const [compressLevel, setCompressLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.3);
  const [watermarkSize, setWatermarkSize] = useState(48);
  const [watermarkPos, setWatermarkPos] = useState<'center' | 'diagonal' | 'top-left' | 'bottom-right'>('diagonal');
  const [watermarkColor, setWatermarkColor] = useState('#dc2626');

  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [pageNumPos, setPageNumPos] = useState<
    'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left'
  >('bottom-center');
  const [pageNumFormat, setPageNumFormat] = useState<'number' | 'page-of-n' | 'dashed'>('page-of-n');
  const [pageNumStart, setPageNumStart] = useState(1);

  const [pdfPassword, setPdfPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlockAuthorized, setUnlockAuthorized] = useState(false);

  const [htmlInput, setHtmlInput] = useState(
    '<h1>I Love Documents</h1>\n<p>Convert clean HTML markup directly into a structured PDF document.</p>'
  );
  const [htmlUrl, setHtmlUrl] = useState('');

  const [cropMargins, setCropMargins] = useState({ top: 20, right: 20, bottom: 20, left: 20 });

  // Edit / Sign / Redact overlays
  const [activePage, setActivePage] = useState(1);
  const [overlays, setOverlays] = useState<PdfEditOverlay[]>([]);
  const [editToolMode, setEditToolMode] = useState<'text' | 'highlight' | 'rect' | 'signature' | 'redact'>('text');
  const [overlayText, setOverlayText] = useState('Reviewed & Approved');
  const [overlayColor, setOverlayColor] = useState('#dc2626');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');

  // PDF Forms
  const [existingFormFields, setExistingFormFields] = useState<{ name: string; type: string; value: string }[]>([]);
  const [newFormFields, setNewFormFields] = useState<PdfFormFieldSpec[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [flattenForm, setFlattenForm] = useState(false);

  // OCR / AI
  const [ocrLang, setOcrLang] = useState('eng');
  const [aiConsent, setAiConsent] = useState(false);
  const [aiSummaryMode, setAiSummaryMode] = useState<'summarize' | 'explain' | 'extract' | 'outline' | 'notes'>('summarize');
  const [targetLang, setTargetLang] = useState('Spanish');

  // Workflow builder
  const [workflowName, setWorkflowName] = useState('Standard Clean & Protect');
  const [workflowSteps, setWorkflowSteps] = useState<string[]>(['compress-pdf', 'page-numbers', 'watermark-pdf']);

  // Image Tools options
  const [imgPageSize, setImgPageSize] = useState<'A4' | 'A3' | 'Letter' | 'Legal' | 'Custom'>('A4');
  const [imgOrientation, setImgOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [imgMarginPt, setImgMarginPt] = useState(24);
  const [imgWidth, setImgWidth] = useState(1080);
  const [imgHeight, setImgHeight] = useState(1080);
  const [imgPercent, setImgPercent] = useState(100);
  const [resizeByPercent, setResizeByPercent] = useState(false);
  const [imgFormat, setImgFormat] = useState<'jpeg' | 'png' | 'webp'>('jpeg');
  const [imgQuality, setImgQuality] = useState(82);
  const [imgBrightness, setImgBrightness] = useState(1.0);
  const [imgContrast, setImgContrast] = useState(1.05);
  const [imgSharpen, setImgSharpen] = useState(true);
  const [imgDenoise, setImgDenoise] = useState(false);
  const [imgUpscale, setImgUpscale] = useState(false);
  const [imgRotateDeg, setImgRotateDeg] = useState(0);
  const [bgRemoveColor, setBgRemoveColor] = useState<'transparent' | '#ffffff' | '#1d4ed8'>('transparent');
  const [bgTolerance, setBgTolerance] = useState(40);
  const [cropPreset, setCropPreset] = useState<'free' | '1:1' | '4:3' | '16:9'>('1:1');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');

  const { recordProcessedOutput, saveWorkflow, workflows } = useAuth();

  const isNoInputRequired = tool.slug === 'html-to-pdf';

  useEffect(() => {
    setFiles(initialFiles);
  }, [tool.slug]);

  useEffect(() => {
    const loadPreviews = async () => {
      if (files.length === 0) {
        setPreviews([]);
        setImagePreviewUrl('');
        return;
      }
      const first = files[0];
      if (first.type.startsWith('image/')) {
        const url = URL.createObjectURL(first);
        setImagePreviewUrl(url);
        return () => URL.revokeObjectURL(url);
      }
      if (first.type === 'application/pdf' || first.name.toLowerCase().endsWith('.pdf')) {
        setLoadingPreviews(true);
        try {
          const buf = await first.arrayBuffer();
          const pages = await renderPdfPages(buf, 0.7, 30);
          setPreviews(pages);
          setPageOrder(pages.map((p) => p.pageNumber));
          setActivePage(1);
          if (tool.slug === 'pdf-forms') {
            const inspected = await inspectPdfFormFields(first);
            setExistingFormFields(inspected);
          }
        } catch {
          setPreviews([]);
        } finally {
          setLoadingPreviews(false);
        }
      }
    };
    loadPreviews();
  }, [files, tool.slug]);

  const handleFilePick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    setFiles((prev) => (tool.multiple ? [...prev, ...picked] : [picked[0]]));
    setResultBlob(null);
    setResultText('');
    setError('');
  };

  const resetAll = () => {
    setFiles([]);
    setPreviews([]);
    setResultBlob(null);
    setResultText('');
    setResultMeta('');
    setOverlays([]);
    setCompareResult(null);
    setJpgGallery([]);
    setError('');
    setProgress(0);
  };

  const fetchPublicHtmlUrl = async () => {
    if (!htmlUrl.trim()) return;
    setError('');
    try {
      const res = await fetch('/api/tools/fetch-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: htmlUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch URL');
      setHtmlInput(data.html);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch webpage.');
    }
  };

  const handleCanvasOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!['edit-pdf', 'sign-pdf', 'redact-pdf', 'pdf-forms'].includes(tool.slug)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = Math.max(0.02, Math.min(0.85, (e.clientX - rect.left) / rect.width));
    const yRatio = Math.max(0.02, Math.min(0.9, (e.clientY - rect.top) / rect.height));

    if (tool.slug === 'pdf-forms') {
      const idx = newFormFields.length + 1;
      setNewFormFields((prev) => [
        ...prev,
        {
          id: `fld_${Date.now()}`,
          name: `field_${idx}`,
          type: 'text',
          pageNumber: activePage,
          xRatio,
          yRatio,
          wRatio: 0.28,
          hRatio: 0.045,
          defaultValue: '',
        },
      ]);
      return;
    }

    const mode =
      tool.slug === 'sign-pdf'
        ? 'signature'
        : tool.slug === 'redact-pdf'
        ? 'redact'
        : editToolMode;

    if (mode === 'signature' && !signatureDataUrl) {
      setError('Draw, type, or upload a signature above before clicking the page to place it.');
      return;
    }

    setOverlays((prev) => [
      ...prev,
      {
        id: `ov_${Date.now()}`,
        pageNumber: activePage,
        type: mode,
        xRatio,
        yRatio,
        wRatio: mode === 'signature' ? 0.24 : mode === 'redact' ? 0.26 : 0.25,
        hRatio: mode === 'signature' ? 0.08 : mode === 'highlight' ? 0.035 : 0.05,
        text: overlayText,
        color: overlayColor,
        fontSize: 14,
        imageDataUrl: signatureDataUrl,
      },
    ]);
  };

  const runProcess = async () => {
    setError('');
    setResultBlob(null);
    setResultText('');
    setResultMeta('');
    setCompareResult(null);
    setJpgGallery([]);
    setProgress(10);
    setProcessing(true);

    try {
      if (!isNoInputRequired && files.length === 0) {
        throw new Error('Please upload at least one file first.');
      }

      const primary = files[0];
      let outBlob: Blob | null = null;
      let outName = 'processed_document.pdf';
      let outMime = 'application/pdf';

      switch (tool.slug) {
        case 'merge-pdf': {
          if (files.length < 2) throw new Error('Please select at least 2 PDF files to merge.');
          setProgress(50);
          const bytes = await mergePdfs(files);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = 'merged_document.pdf';
          break;
        }
        case 'split-pdf': {
          setProgress(50);
          const res = await splitPdf(primary, splitMode, splitRange);
          outBlob = res.blob;
          outName = res.fileName;
          outMime = res.blob.type;
          break;
        }
        case 'compress-pdf': {
          const bytes = await compressPdf(primary, compressLevel, (p) => setProgress(p));
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_compressed.pdf`;
          const pct = Math.max(0, Math.round((1 - outBlob.size / primary.size) * 100));
          setResultMeta(
            `Original: ${(primary.size / 1024).toFixed(1)} KB · Compressed: ${(outBlob.size / 1024).toFixed(1)} KB (${pct}% smaller)`
          );
          break;
        }
        case 'pdf-to-word': {
          setProgress(55);
          outBlob = await pdfToWord(primary);
          outName = `${primary.name.replace(/\.pdf$/i, '')}.docx`;
          outMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        }
        case 'pdf-to-powerpoint': {
          setProgress(55);
          outBlob = await pdfToPowerPoint(primary);
          outName = `${primary.name.replace(/\.pdf$/i, '')}.pptx`;
          outMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
          break;
        }
        case 'pdf-to-excel': {
          setProgress(55);
          outBlob = await pdfToExcel(primary);
          outName = `${primary.name.replace(/\.pdf$/i, '')}.xlsx`;
          outMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        }
        case 'word-to-pdf': {
          setProgress(55);
          const bytes = await wordToPdf(primary);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.(docx|doc)$/i, '')}.pdf`;
          break;
        }
        case 'powerpoint-to-pdf': {
          setProgress(55);
          const bytes = await powerpointToPdf(primary);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.(pptx|ppt)$/i, '')}.pdf`;
          break;
        }
        case 'excel-to-pdf': {
          setProgress(55);
          const bytes = await excelToPdf(primary);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.(xlsx|xls|csv)$/i, '')}.pdf`;
          break;
        }
        case 'pdf-to-jpg': {
          setProgress(50);
          const res = await pdfToJpgZip(primary, 2, 0.92);
          outBlob = res.blob;
          outName = res.fileName;
          outMime = 'application/zip';
          setJpgGallery(res.images);
          break;
        }
        case 'jpg-to-pdf':
        case 'image-to-pdf': {
          setProgress(55);
          const bytes = await imagesToPdf(files, {
            pageSize: imgPageSize,
            orientation: imgOrientation,
            marginPt: imgMarginPt,
          });
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = 'images_combined.pdf';
          break;
        }
        case 'edit-pdf':
        case 'sign-pdf': {
          if (overlays.length === 0) throw new Error('Click on the PDF page preview to place at least one edit or signature.');
          setProgress(60);
          const bytes = await applyPdfEditsAndSignature(primary, overlays);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_${tool.slug === 'sign-pdf' ? 'signed' : 'edited'}.pdf`;
          break;
        }
        case 'watermark-pdf': {
          setProgress(60);
          const bytes = await watermarkPdf(primary, {
            text: watermarkText,
            opacity: watermarkOpacity,
            fontSize: watermarkSize,
            rotation: watermarkPos === 'diagonal' ? 45 : 0,
            color: watermarkColor,
            position: watermarkPos,
          });
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_watermarked.pdf`;
          break;
        }
        case 'rotate-pdf': {
          setProgress(60);
          const bytes = await rotatePdf(primary, pageRotations);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_rotated.pdf`;
          break;
        }
        case 'html-to-pdf': {
          setProgress(55);
          let sourceHtml = htmlInput;
          if (files.length > 0) sourceHtml = await files[0].text();
          const bytes = await htmlToPdf(sourceHtml);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = 'html_converted.pdf';
          break;
        }
        case 'unlock-pdf': {
          if (!unlockAuthorized) throw new Error('Please confirm authorization to unlock this PDF.');
          if (!pdfPassword) throw new Error('Enter the current password to unlock this PDF.');
          setProgress(60);
          const bytes = await unlockPdf(primary, pdfPassword);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_unlocked.pdf`;
          break;
        }
        case 'protect-pdf': {
          if (!pdfPassword || pdfPassword.length < 3) throw new Error('Enter a password of at least 3 characters.');
          if (pdfPassword !== confirmPassword) throw new Error('Passwords do not match.');
          setProgress(60);
          const bytes = await protectPdf(primary, pdfPassword);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_protected.pdf`;
          setResultMeta('Encrypted with ISO 32000-1 Standard Security Handler (128-bit RC4).');
          break;
        }
        case 'organize-pdf': {
          setProgress(60);
          const bytes = await organizePdf(primary, pageOrder);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_organized.pdf`;
          break;
        }
        case 'pdf-to-pdfa': {
          setProgress(60);
          const bytes = await convertToPdfA(primary);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_PDFA.pdf`;
          setResultMeta('Embedded PDF/A-1b XMP metadata & sRGB ICC OutputIntent.');
          break;
        }
        case 'repair-pdf': {
          setProgress(50);
          const repaired = await repairPdf(primary);
          outBlob = new Blob([repaired.bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_repaired.pdf`;
          setResultMeta(`Recovery method: ${repaired.method}`);
          break;
        }
        case 'page-numbers': {
          setProgress(60);
          const bytes = await addPageNumbers(primary, {
            position: pageNumPos,
            startNumber: pageNumStart,
            format: pageNumFormat,
            fontSize: 11,
          });
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_numbered.pdf`;
          break;
        }
        case 'ocr-pdf': {
          const res = await ocrPdf(primary, ocrLang, (p) => setProgress(p));
          outBlob = new Blob([res.pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.[^.]+$/, '')}_searchable_ocr.pdf`;
          setResultText(res.extractedText);
          break;
        }
        case 'compare-pdf': {
          if (files.length < 2) throw new Error('Upload 2 PDF files to compare side by side.');
          setProgress(55);
          const cmp = await comparePdfs(files[0], files[1]);
          setCompareResult(cmp.pages);
          setResultMeta(`Compared ${cmp.pages.length} page(s) side by side.`);
          setProgress(100);
          setProcessing(false);
          return;
        }
        case 'redact-pdf': {
          if (overlays.length === 0) throw new Error('Draw at least one redaction box over the PDF preview.');
          setProgress(60);
          const bytes = await applyPermanentRedactions(primary, overlays);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_redacted.pdf`;
          setResultMeta('Redacted pages permanently rasterized & flattened so underlying text is removed.');
          break;
        }
        case 'crop-pdf': {
          setProgress(60);
          const bytes = await cropPdf(primary, cropMargins);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_cropped.pdf`;
          break;
        }
        case 'pdf-forms': {
          setProgress(60);
          const bytes = await applyPdfForms(primary, newFormFields, formValues, flattenForm);
          outBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_form.pdf`;
          break;
        }
        case 'pdf-to-markdown': {
          setProgress(60);
          const md = await pdfToMarkdown(primary);
          setResultText(md);
          outBlob = new Blob([md], { type: 'text/markdown' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}.md`;
          outMime = 'text/markdown';
          break;
        }
        case 'ai-summarizer': {
          if (!aiConsent) throw new Error('Please check the AI consent box before sending document data.');
          setProgress(45);
          const textContent = primary.name.toLowerCase().endsWith('.pdf')
            ? (await extractPdfTextPages(await primary.arrayBuffer())).map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join('\n\n')
            : await primary.text();
          const res = await fetch('/api/ai/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              consentAccepted: true,
              mode: aiSummaryMode,
              documentName: primary.name,
              documentText: textContent,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'AI Summarizer failed');
          setResultText(data.result);
          outBlob = new Blob([data.result], { type: 'text/markdown' });
          outName = `${primary.name.replace(/\.[^.]+$/, '')}_ai_summary.md`;
          outMime = 'text/markdown';
          break;
        }
        case 'translate-pdf': {
          if (!aiConsent) throw new Error('Please check the AI consent box before translating via Gemini.');
          setProgress(40);
          const pages = await extractPdfTextPages(await primary.arrayBuffer());
          const res = await fetch('/api/ai/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              consentAccepted: true,
              pages: pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
              targetLanguage: targetLang,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Translation failed');
          const translatedMd = (data.translatedPages as { pageNumber: number; translatedText: string }[])
            .map((p) => `## Page ${p.pageNumber}\n\n${p.translatedText}`)
            .join('\n\n---\n\n');
          setResultText(translatedMd);
          // Also generate translated PDF using htmlToPdf formatter
          const pdfBytes = await htmlToPdf(
            translatedMd
              .split('\n')
              .map((l) => `<p>${l}</p>`)
              .join('')
          );
          outBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          outName = `${primary.name.replace(/\.pdf$/i, '')}_${targetLang}.pdf`;
          break;
        }
        case 'create-workflow': {
          if (workflowSteps.length === 0) throw new Error('Add at least one step to your workflow.');
          let currentFile = primary;
          for (let i = 0; i < workflowSteps.length; i++) {
            const step = workflowSteps[i];
            setProgress(Math.round(((i + 1) / workflowSteps.length) * 90));
            let stepBytes: Uint8Array | null = null;
            if (step === 'compress-pdf') stepBytes = await compressPdf(currentFile, 'medium');
            else if (step === 'page-numbers')
              stepBytes = await addPageNumbers(currentFile, {
                position: 'bottom-center',
                startNumber: 1,
                format: 'page-of-n',
                fontSize: 10,
              });
            else if (step === 'watermark-pdf')
              stepBytes = await watermarkPdf(currentFile, {
                text: watermarkText,
                opacity: 0.25,
                fontSize: 44,
                rotation: 45,
                color: '#dc2626',
                position: 'diagonal',
              });
            else if (step === 'rotate-pdf') stepBytes = await rotatePdf(currentFile, { 1: 90 });
            else if (step === 'pdf-to-pdfa') stepBytes = await convertToPdfA(currentFile);
            if (stepBytes) {
              currentFile = new File([stepBytes.buffer as ArrayBuffer], currentFile.name, {
                type: 'application/pdf',
              });
            }
          }
          outBlob = currentFile;
          outName = `${primary.name.replace(/\.pdf$/i, '')}_workflow.pdf`;
          setResultMeta(`Executed ${workflowSteps.length}-step workflow pipeline.`);
          break;
        }
        case 'image-resizer':
        case 'image-converter':
        case 'image-compressor':
        case 'image-enhancer': {
          setProgress(50);
          const img = await loadImageFromFile(primary);
          const targetW =
            tool.slug === 'image-resizer'
              ? resizeByPercent
                ? Math.round((img.naturalWidth * imgPercent) / 100)
                : imgWidth
              : tool.slug === 'image-enhancer' && imgUpscale
              ? img.naturalWidth * 2
              : undefined;
          const targetH =
            tool.slug === 'image-resizer'
              ? resizeByPercent
                ? Math.round((img.naturalHeight * imgPercent) / 100)
                : imgHeight
              : tool.slug === 'image-enhancer' && imgUpscale
              ? img.naturalHeight * 2
              : undefined;

          outBlob = await processImageViaServer(primary, {
            width: targetW,
            height: targetH,
            format: imgFormat,
            quality: tool.slug === 'image-compressor' ? Math.min(imgQuality, 65) : imgQuality,
            brightness: tool.slug === 'image-enhancer' ? imgBrightness : 1,
            contrast: tool.slug === 'image-enhancer' ? imgContrast : 1,
            sharpen: tool.slug === 'image-enhancer' ? imgSharpen : false,
            denoise: tool.slug === 'image-enhancer' ? imgDenoise : false,
          });
          outMime = outBlob.type;
          outName = `${primary.name.replace(/\.[^.]+$/, '')}.${imgFormat === 'jpeg' ? 'jpg' : imgFormat}`;
          setResultMeta(
            `Original: ${(primary.size / 1024).toFixed(1)} KB · Processed: ${(outBlob.size / 1024).toFixed(1)} KB`
          );
          break;
        }
        case 'background-remover': {
          setProgress(50);
          const img = await loadImageFromFile(primary);
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d')!.drawImage(img, 0, 0);
          const resCanvas = replaceBackgroundCanvas(c, bgRemoveColor, bgTolerance);
          const mime = bgRemoveColor === 'transparent' ? 'image/png' : 'image/jpeg';
          outBlob = await canvasToBlob(resCanvas, mime, 0.94);
          outMime = mime;
          outName = `${primary.name.replace(/\.[^.]+$/, '')}_nobg.${bgRemoveColor === 'transparent' ? 'png' : 'jpg'}`;
          break;
        }
        case 'image-cropper': {
          setProgress(50);
          const img = await loadImageFromFile(primary);
          const c = document.createElement('canvas');
          const rad = (imgRotateDeg * Math.PI) / 180;
          const rotSwap = imgRotateDeg === 90 || imgRotateDeg === 270;
          const rw = rotSwap ? img.naturalHeight : img.naturalWidth;
          const rh = rotSwap ? img.naturalWidth : img.naturalHeight;
          let cw = rw;
          let ch = rh;
          if (cropPreset === '1:1') {
            cw = ch = Math.min(rw, rh);
          } else if (cropPreset === '4:3') {
            ch = Math.min(rh, Math.round((rw * 3) / 4));
            cw = Math.round((ch * 4) / 3);
          } else if (cropPreset === '16:9') {
            ch = Math.min(rh, Math.round((rw * 9) / 16));
            cw = Math.round((ch * 16) / 9);
          }
          c.width = cw;
          c.height = ch;
          const ctx = c.getContext('2d')!;
          ctx.translate(cw / 2, ch / 2);
          ctx.rotate(rad);
          ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
          outBlob = await canvasToBlob(c, 'image/jpeg', 0.93);
          outMime = 'image/jpeg';
          outName = `${primary.name.replace(/\.[^.]+$/, '')}_cropped.jpg`;
          break;
        }
        case 'photo-collage': {
          setProgress(55);
          const imgs = await Promise.all(files.slice(0, 9).map((f) => loadImageFromFile(f)));
          const cols = imgs.length <= 2 ? imgs.length : imgs.length <= 4 ? 2 : 3;
          const rows = Math.ceil(imgs.length / cols);
          const cell = 520;
          const gap = 18;
          const c = document.createElement('canvas');
          c.width = cols * cell + (cols + 1) * gap;
          c.height = rows * cell + (rows + 1) * gap;
          const ctx = c.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          imgs.forEach((im, idx) => {
            const r = Math.floor(idx / cols);
            const col = idx % cols;
            const x = gap + col * (cell + gap);
            const y = gap + r * (cell + gap);
            const scale = Math.max(cell / im.naturalWidth, cell / im.naturalHeight);
            const dw = im.naturalWidth * scale;
            const dh = im.naturalHeight * scale;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, cell, cell);
            ctx.clip();
            ctx.drawImage(im, x + (cell - dw) / 2, y + (cell - dh) / 2, dw, dh);
            ctx.restore();
          });
          outBlob = await canvasToBlob(c, 'image/jpeg', 0.92);
          outMime = 'image/jpeg';
          outName = `collage_${imgs.length}_photos.jpg`;
          break;
        }
        case 'id-card-maker': {
          setProgress(55);
          const imgs = await Promise.all(files.slice(0, 2).map((f) => loadImageFromFile(f)));
          const c = document.createElement('canvas');
          c.width = 1240;
          c.height = 1754;
          const ctx = c.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          const cardW = 860;
          const cardH = 540;
          imgs.forEach((im, idx) => {
            const x = (c.width - cardW) / 2;
            const y = 220 + idx * (cardH + 140);
            ctx.drawImage(im, x, y, cardW, cardH);
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, cardW, cardH);
          });
          outBlob = await canvasToBlob(c, 'image/jpeg', 0.94);
          outMime = 'image/jpeg';
          outName = 'id_card_a4_sheet.jpg';
          break;
        }
        default:
          throw new Error(`Tool ${tool.name} is not configured.`);
      }

      if (outBlob) {
        setProgress(95);
        setResultBlob(outBlob);
        setResultFileName(outName);
        const saved = await recordProcessedOutput({
          toolSlug: tool.slug,
          toolName: tool.name,
          inputFileName: primary ? primary.name : 'html_input',
          outputFileName: outName,
          mimeType: outMime,
          blob: outBlob,
        });
        setTempLink({ url: saved.downloadUrl, expiresAt: saved.expiresAt });
        setProgress(100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed.');
    } finally {
      setProcessing(false);
    }
  };

  const activePreview = previews.find((p) => p.pageNumber === activePage) || previews[0];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Step 1: Tool Header */}
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
          <ToolIcon iconName={tool.iconName} bg={tool.iconBg} color={tool.iconColor} />
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-950 dark:text-white">
              {tool.name}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{tool.shortDesc}</p>
          </div>
        </div>

        {(files.length > 0 || resultBlob) && (
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Start Again
          </button>
        )}
      </div>

      {/* Step 2: Upload Area */}
      {files.length === 0 && !isNoInputRequired ? (
        <div className="max-w-2xl mx-auto py-10">
          <label className="flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-red-500 transition-colors cursor-pointer text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <FileUp className="w-8 h-8 text-slate-700 dark:text-slate-200" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold text-slate-950 dark:text-white">
                Select {tool.multiple ? 'Files' : 'a File'} for {tool.name}
              </p>
              <p className="text-sm text-slate-500">
                Accepted formats: {tool.accepts}
              </p>
            </div>
            <span
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
            >
              Browse Files
            </span>
            <input
              type="file"
              multiple={tool.multiple}
              accept={tool.accepts}
              onChange={(e) => handleFilePick(e.target.files)}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Step 3 & 5: Options & Process Column */}
          <div className="lg:col-span-5 space-y-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            {/* Uploaded File Queue */}
            {!isNoInputRequired && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    Selected Files ({files.length})
                  </span>
                  {tool.multiple && (
                    <label className="text-xs font-semibold text-red-600 hover:underline cursor-pointer inline-flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add more
                      <input
                        type="file"
                        multiple
                        accept={tool.accepts}
                        onChange={(e) => handleFilePick(e.target.files)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {files.map((f, idx) => (
                    <div
                      key={`${f.name}_${idx}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                    >
                      <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {idx + 1}. {f.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-slate-500 tabular-nums">
                          {(f.size / 1024).toFixed(0)} KB
                        </span>
                        {tool.slug === 'merge-pdf' && idx > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const copy = [...files];
                              [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
                              setFiles(copy);
                            }}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded cursor-pointer"
                            title="Move up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                        )}
                        {tool.slug === 'merge-pdf' && idx < files.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const copy = [...files];
                              [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
                              setFiles(copy);
                            }}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded cursor-pointer"
                            title="Move down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                          aria-label="Remove file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tool-Specific Configs */}
            {tool.slug === 'split-pdf' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSplitMode('range')}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                      splitMode === 'range'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Extract Range
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitMode('all')}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                      splitMode === 'all'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Split Every Page (ZIP)
                  </button>
                </div>
                {splitMode === 'range' && (
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Pages to Extract (e.g. 1-3, 5)
                    </label>
                    <input
                      type="text"
                      value={splitRange}
                      onChange={(e) => setSplitRange(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {tool.slug === 'compress-pdf' && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="block text-xs font-semibold">Compression Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setCompressLevel(lvl)}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border capitalize cursor-pointer ${
                        compressLevel === lvl
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tool.slug === 'watermark-pdf' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Watermark Text</label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">Position</label>
                    <select
                      value={watermarkPos}
                      onChange={(e) => setWatermarkPos(e.target.value as typeof watermarkPos)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="diagonal">Diagonal</option>
                      <option value="center">Center</option>
                      <option value="top-left">Top Left</option>
                      <option value="bottom-right">Bottom Right</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Color</label>
                    <input
                      type="color"
                      value={watermarkColor}
                      onChange={(e) => setWatermarkColor(e.target.value)}
                      className="w-full h-9 rounded border border-slate-300 cursor-pointer"
                    />
                  </div>
                </div>
                <div>
                  <span>Opacity ({Math.round(watermarkOpacity * 100)}%)</span>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={watermarkOpacity}
                    onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <span>Font Size ({watermarkSize} pt)</span>
                  <input
                    type="range"
                    min={16}
                    max={96}
                    value={watermarkSize}
                    onChange={(e) => setWatermarkSize(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {tool.slug === 'page-numbers' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Position</label>
                  <select
                    value={pageNumPos}
                    onChange={(e) => setPageNumPos(e.target.value as typeof pageNumPos)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="bottom-center">Bottom Center</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="top-center">Top Center</option>
                    <option value="top-right">Top Right</option>
                    <option value="top-left">Top Left</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">Format</label>
                    <select
                      value={pageNumFormat}
                      onChange={(e) => setPageNumFormat(e.target.value as typeof pageNumFormat)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="page-of-n">Page 1 of N</option>
                      <option value="number">1, 2, 3</option>
                      <option value="dashed">- 1 -</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Start At</label>
                    <input
                      type="number"
                      min={1}
                      value={pageNumStart}
                      onChange={(e) => setPageNumStart(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                    />
                  </div>
                </div>
              </div>
            )}

            {tool.slug === 'protect-pdf' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Document Password</label>
                  <input
                    type="password"
                    value={pdfPassword}
                    onChange={(e) => setPdfPassword(e.target.value)}
                    placeholder="Enter password (min 3 chars)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <p className="text-slate-500">
                  Passwords are never stored or transmitted; encryption runs locally with 128-bit RC4.
                </p>
              </div>
            )}

            {tool.slug === 'unlock-pdf' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <p className="text-slate-600 dark:text-slate-400">
                  Unlocking requires document authorization and the valid owner or user password.
                </p>
                <input
                  type="password"
                  value={pdfPassword}
                  onChange={(e) => setPdfPassword(e.target.value)}
                  placeholder="Enter PDF password"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unlockAuthorized}
                    onChange={(e) => setUnlockAuthorized(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I confirm I am authorized to remove password protection from this PDF.</span>
                </label>
              </div>
            )}

            {tool.slug === 'html-to-pdf' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Fetch Public Webpage URL (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={htmlUrl}
                      onChange={(e) => setHtmlUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={fetchPublicHtmlUrl}
                      className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold cursor-pointer"
                    >
                      Fetch
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Or Upload .HTML / Edit Markup</label>
                  <input
                    type="file"
                    accept=".html,.htm"
                    onChange={(e) => handleFilePick(e.target.files)}
                    className="block w-full text-xs mb-2"
                  />
                  <textarea
                    rows={7}
                    value={htmlInput}
                    onChange={(e) => setHtmlInput(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>
              </div>
            )}

            {tool.slug === 'crop-pdf' && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                  <div key={side}>
                    <label className="capitalize font-semibold">
                      {side} Margin ({cropMargins[side]} pt)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={180}
                      value={cropMargins[side]}
                      onChange={(e) =>
                        setCropMargins((prev) => ({ ...prev, [side]: Number(e.target.value) }))
                      }
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
            )}

            {tool.slug === 'edit-pdf' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div className="flex flex-wrap gap-1.5">
                  {(['text', 'highlight', 'rect', 'signature'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEditToolMode(m)}
                      className={`px-3 py-1.5 rounded font-semibold capitalize cursor-pointer border ${
                        editToolMode === m
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                  {overlays.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOverlays((prev) => prev.slice(0, -1))}
                      className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Undo2 className="w-3.5 h-3.5" /> Undo
                    </button>
                  )}
                </div>
                {editToolMode === 'text' && (
                  <input
                    type="text"
                    value={overlayText}
                    onChange={(e) => setOverlayText(e.target.value)}
                    placeholder="Text to place on click"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                )}
                {editToolMode === 'signature' && (
                  <SignaturePad onSelectSignature={setSignatureDataUrl} />
                )}
                <p className="text-slate-500">
                  Click anywhere on the page preview on the right to place ({overlays.length} added).
                </p>
              </div>
            )}

            {tool.slug === 'sign-pdf' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <SignaturePad onSelectSignature={setSignatureDataUrl} />
                <p className="text-slate-500">
                  After creating your signature above, click anywhere on the PDF page preview to stamp it ({overlays.length} placed).
                </p>
              </div>
            )}

            {tool.slug === 'redact-pdf' && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <p className="text-slate-600 dark:text-slate-400">
                  Click on the PDF page preview to place permanent black redaction blocks ({overlays.length} placed). Affected pages are rasterized so text cannot be extracted underneath.
                </p>
                {overlays.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOverlays((prev) => prev.slice(0, -1))}
                    className="px-3 py-1.5 rounded border border-slate-300 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> Undo last redaction
                  </button>
                )}
              </div>
            )}

            {tool.slug === 'pdf-forms' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <p className="text-slate-500">
                  Click on the PDF preview to add new text fields ({newFormFields.length} added), or fill detected fields below.
                </p>
                {existingFormFields.map((ef) => (
                  <div key={ef.name}>
                    <label className="block font-semibold mb-1">{ef.name}</label>
                    <input
                      type="text"
                      value={String(formValues[ef.name] ?? '')}
                      onChange={(e) =>
                        setFormValues((prev) => ({ ...prev, [ef.name]: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flattenForm}
                    onChange={(e) => setFlattenForm(e.target.checked)}
                  />
                  <span>Flatten form fields into static PDF text</span>
                </label>
              </div>
            )}

            {tool.slug === 'ocr-pdf' && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <label className="block font-semibold">OCR Recognition Language</label>
                <select
                  value={ocrLang}
                  onChange={(e) => setOcrLang(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="eng">English (eng)</option>
                  <option value="hin">Hindi (hin)</option>
                  <option value="spa">Spanish (spa)</option>
                  <option value="fra">French (fra)</option>
                  <option value="deu">German (deu)</option>
                </select>
              </div>
            )}

            {(tool.slug === 'ai-summarizer' || tool.slug === 'translate-pdf') && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                {tool.slug === 'ai-summarizer' ? (
                  <div>
                    <label className="block font-semibold mb-1">Analysis Mode</label>
                    <select
                      value={aiSummaryMode}
                      onChange={(e) => setAiSummaryMode(e.target.value as typeof aiSummaryMode)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="summarize">Executive Summary &amp; Key Points</option>
                      <option value="explain">Explain Difficult Content</option>
                      <option value="extract">Extract Dates, Names &amp; Tables</option>
                      <option value="outline">Generate Document Outline</option>
                      <option value="notes">Convert into Study Notes</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block font-semibold mb-1">Target Language</label>
                    <select
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {['Spanish', 'French', 'German', 'Hindi', 'Japanese', 'Arabic', 'Chinese (Simplified)', 'Portuguese', 'Italian', 'Korean'].map(
                        (lang) => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                )}

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiConsent}
                    onChange={(e) => setAiConsent(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-emerald-600" />
                    I consent to sending this uploaded document to Gemini AI for processing.
                  </span>
                </label>
              </div>
            )}

            {tool.slug === 'create-workflow' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Workflow Name</label>
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold">Pipeline Steps ({workflowSteps.length})</label>
                  {workflowSteps.map((s, idx) => (
                    <div key={`${s}_${idx}`} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-100 dark:bg-slate-800">
                      <span>
                        {idx + 1}. {ALL_TOOLS.find((t) => t.slug === s)?.name || s}
                      </span>
                      <button
                        type="button"
                        onClick={() => setWorkflowSteps((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-red-500 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['compress-pdf', 'page-numbers', 'watermark-pdf', 'rotate-pdf', 'pdf-to-pdfa'].map((slug) => (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => setWorkflowSteps((prev) => [...prev, slug].slice(0, 10))}
                        className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        + {ALL_TOOLS.find((t) => t.slug === slug)?.name}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => saveWorkflow(workflowName, `${workflowSteps.length}-step PDF automation`, workflowSteps)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold cursor-pointer"
                >
                  Save Workflow ({workflows.length} saved)
                </button>
              </div>
            )}

            {(tool.slug === 'jpg-to-pdf' || tool.slug === 'image-to-pdf') && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">Page Size</label>
                    <select
                      value={imgPageSize}
                      onChange={(e) => setImgPageSize(e.target.value as typeof imgPageSize)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="A4">A4</option>
                      <option value="A3">A3</option>
                      <option value="Letter">Letter</option>
                      <option value="Legal">Legal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Orientation</label>
                    <select
                      value={imgOrientation}
                      onChange={(e) => setImgOrientation(e.target.value as typeof imgOrientation)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>
                <div>
                  <span>Margins ({imgMarginPt} pt)</span>
                  <input
                    type="range"
                    min={0}
                    max={72}
                    value={imgMarginPt}
                    onChange={(e) => setImgMarginPt(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {(tool.slug === 'image-resizer' || tool.slug === 'image-converter' || tool.slug === 'image-compressor') && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                {tool.slug === 'image-resizer' && (
                  <>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setResizeByPercent(false)}
                        className={`flex-1 py-1.5 rounded border font-semibold cursor-pointer ${
                          !resizeByPercent ? 'bg-slate-900 text-white' : ''
                        }`}
                      >
                        By Pixels
                      </button>
                      <button
                        type="button"
                        onClick={() => setResizeByPercent(true)}
                        className={`flex-1 py-1.5 rounded border font-semibold cursor-pointer ${
                          resizeByPercent ? 'bg-slate-900 text-white' : ''
                        }`}
                      >
                        By Percentage
                      </button>
                    </div>
                    {!resizeByPercent ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-semibold mb-1">Width (px)</label>
                          <input
                            type="number"
                            value={imgWidth}
                            onChange={(e) => setImgWidth(Number(e.target.value))}
                            className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold mb-1">Height (px)</label>
                          <input
                            type="number"
                            value={imgHeight}
                            onChange={(e) => setImgHeight(Number(e.target.value))}
                            className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span>Scale ({imgPercent}%)</span>
                        <input
                          type="range"
                          min={10}
                          max={200}
                          value={imgPercent}
                          onChange={(e) => setImgPercent(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">Output Format</label>
                    <select
                      value={imgFormat}
                      onChange={(e) => setImgFormat(e.target.value as typeof imgFormat)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="jpeg">JPG / JPEG</option>
                      <option value="png">PNG</option>
                      <option value="webp">WEBP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Quality ({imgQuality}%)</label>
                    <input
                      type="range"
                      min={15}
                      max={100}
                      value={imgQuality}
                      onChange={(e) => setImgQuality(Number(e.target.value))}
                      className="w-full mt-2"
                    />
                  </div>
                </div>
              </div>
            )}

            {tool.slug === 'image-enhancer' && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <span>Brightness ({imgBrightness.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0.6}
                    max={1.6}
                    step={0.05}
                    value={imgBrightness}
                    onChange={(e) => setImgBrightness(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <span>Contrast ({imgContrast.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0.6}
                    max={1.6}
                    step={0.05}
                    value={imgContrast}
                    onChange={(e) => setImgContrast(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={imgSharpen} onChange={(e) => setImgSharpen(e.target.checked)} />
                  <span>Unsharp Clarity Boost</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={imgDenoise} onChange={(e) => setImgDenoise(e.target.checked)} />
                  <span>Reduce Grain / Noise</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={imgUpscale} onChange={(e) => setImgUpscale(e.target.checked)} />
                  <span>2× Lanczos Resolution Upscale</span>
                </label>
              </div>
            )}

            {tool.slug === 'background-remover' && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <label className="block font-semibold">Replacement Background</label>
                <div className="flex gap-2">
                  {(
                    [
                      ['transparent', 'Transparent PNG'],
                      ['#ffffff', 'White'],
                      ['#1d4ed8', 'Blue'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBgRemoveColor(val)}
                      className={`px-3 py-1.5 rounded border font-semibold cursor-pointer ${
                        bgRemoveColor === val ? 'bg-slate-900 text-white' : ''
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                <div>
                  <span>Color Tolerance ({bgTolerance})</span>
                  <input
                    type="range"
                    min={15}
                    max={85}
                    value={bgTolerance}
                    onChange={(e) => setBgTolerance(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {tool.slug === 'image-cropper' && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Aspect Ratio Crop</label>
                  <div className="flex gap-2">
                    {(['1:1', '4:3', '16:9', 'free'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCropPreset(r)}
                        className={`px-3 py-1.5 rounded border font-semibold cursor-pointer ${
                          cropPreset === r ? 'bg-slate-900 text-white' : ''
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Rotation ({imgRotateDeg}°)</label>
                  <button
                    type="button"
                    onClick={() => setImgRotateDeg((d) => (d + 90) % 360)}
                    className="px-3 py-1.5 rounded border inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Process Button */}
            <button
              type="button"
              disabled={processing}
              onClick={runProcess}
              className="w-full py-3 rounded-lg text-sm font-bold text-white shadow-sm disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing ({progress}%)</span>
                </>
              ) : (
                <span>Process with {tool.name}</span>
              )}
            </button>

            {/* Step 6: Progress Bar */}
            {processing && (
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: 'var(--accent-primary, #dc2626)',
                  }}
                />
              </div>
            )}

            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Step 7 & 8: Completed Result + Download */}
            {(resultBlob || resultText) && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Processing Complete</span>
                </div>
                {resultMeta && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-mono">{resultMeta}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {resultBlob && (
                    <button
                      type="button"
                      onClick={() => {
                        const url = URL.createObjectURL(resultBlob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = resultFileName;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white cursor-pointer"
                      style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
                    >
                      <Download className="w-4 h-4" />
                      Download ({(resultBlob.size / 1024).toFixed(1)} KB)
                    </button>
                  )}
                  {tempLink.url && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(window.location.origin + tempLink.url);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy 60m Expiring Link
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Step 4: Live Preview & Interactive Page Canvas Column */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-950 dark:text-white">
                Live Preview &amp; Interactive Workspace
              </h3>
              {previews.length > 0 && (
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {previews.length} page(s) loaded
                </span>
              )}
            </div>

            {loadingPreviews && (
              <div className="py-16 flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Rendering page previews...</span>
              </div>
            )}

            {/* Rotate / Organize Visual Page Grid */}
            {!loadingPreviews &&
              (tool.slug === 'rotate-pdf' || tool.slug === 'organize-pdf') &&
              previews.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {pageOrder.map((origNum, idx) => {
                    const preview = previews.find((p) => p.pageNumber === origNum);
                    if (!preview) return null;
                    const rot = pageRotations[origNum] || 0;
                    return (
                      <div
                        key={`${origNum}_${idx}`}
                        className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-2 bg-slate-50 dark:bg-slate-950"
                      >
                        <div className="overflow-hidden rounded flex items-center justify-center bg-white h-36">
                          <img
                            src={preview.dataUrl}
                            alt={`Page ${origNum}`}
                            referrerPolicy="no-referrer"
                            style={{ transform: `rotate(${rot}deg)` }}
                            className="max-h-36 object-contain transition-transform"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span>P.{origNum}</span>
                          <div className="flex items-center gap-1">
                            {tool.slug === 'rotate-pdf' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPageRotations((prev) => ({
                                    ...prev,
                                    [origNum]: ((prev[origNum] || 0) + 90) % 360,
                                  }))
                                }
                                className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
                                title="Rotate 90°"
                              >
                                <RotateCw className="w-3 h-3" />
                              </button>
                            )}
                            {tool.slug === 'organize-pdf' && (
                              <>
                                {idx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const copy = [...pageOrder];
                                      [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
                                      setPageOrder(copy);
                                    }}
                                    className="px-1.5 py-0.5 border rounded cursor-pointer"
                                  >
                                    ←
                                  </button>
                                )}
                                {idx < pageOrder.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const copy = [...pageOrder];
                                      [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
                                      setPageOrder(copy);
                                    }}
                                    className="px-1.5 py-0.5 border rounded cursor-pointer"
                                  >
                                    →
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPageOrder((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="p-1 text-red-600 cursor-pointer"
                                  title="Delete page"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            {/* Interactive Single Page Canvas (Edit / Sign / Redact / Crop / Forms) */}
            {!loadingPreviews &&
              !['rotate-pdf', 'organize-pdf'].includes(tool.slug) &&
              activePreview && (
                <div className="space-y-3">
                  {previews.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {previews.map((p) => (
                        <button
                          key={p.pageNumber}
                          type="button"
                          onClick={() => setActivePage(p.pageNumber)}
                          className={`px-2.5 py-1 rounded text-xs font-mono cursor-pointer border ${
                            activePage === p.pageNumber
                              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          P.{p.pageNumber}
                        </button>
                      ))}
                    </div>
                  )}

                  <div
                    onClick={handleCanvasOverlayClick}
                    className="relative inline-block border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden bg-white shadow-sm cursor-crosshair"
                  >
                    <img
                      src={activePreview.dataUrl}
                      alt={`Page ${activePreview.pageNumber}`}
                      referrerPolicy="no-referrer"
                      className="max-h-[540px] w-auto block"
                    />
                    {/* Crop margin preview overlay */}
                    {tool.slug === 'crop-pdf' && (
                      <div
                        className="absolute border-2 border-dashed border-red-600 bg-red-500/10 pointer-events-none"
                        style={{
                          top: `${(cropMargins.top / 842) * 100}%`,
                          right: `${(cropMargins.right / 595) * 100}%`,
                          bottom: `${(cropMargins.bottom / 842) * 100}%`,
                          left: `${(cropMargins.left / 595) * 100}%`,
                        }}
                      />
                    )}
                    {/* Placed overlays */}
                    {overlays
                      .filter((o) => o.pageNumber === activePreview.pageNumber)
                      .map((o) => (
                        <div
                          key={o.id}
                          style={{
                            left: `${o.xRatio * 100}%`,
                            top: `${o.yRatio * 100}%`,
                            width: `${o.wRatio * 100}%`,
                            height: `${o.hRatio * 100}%`,
                            backgroundColor:
                              o.type === 'redact'
                                ? '#000000'
                                : o.type === 'highlight'
                                ? 'rgba(250, 204, 21, 0.45)'
                                : 'transparent',
                            border: o.type === 'rect' ? `2px solid ${o.color || '#dc2626'}` : undefined,
                          }}
                          className="absolute pointer-events-none flex items-center"
                        >
                          {o.type === 'text' && (
                            <span className="text-xs font-semibold px-1 bg-white/80 text-slate-900">
                              {o.text}
                            </span>
                          )}
                          {o.type === 'signature' && o.imageDataUrl && (
                            <img src={o.imageDataUrl} alt="Signature" className="w-full h-full object-contain" />
                          )}
                        </div>
                      ))}
                    {/* Form fields preview */}
                    {newFormFields
                      .filter((f) => f.pageNumber === activePreview.pageNumber)
                      .map((f) => (
                        <div
                          key={f.id}
                          style={{
                            left: `${f.xRatio * 100}%`,
                            top: `${f.yRatio * 100}%`,
                            width: `${f.wRatio * 100}%`,
                            height: `${f.hRatio * 100}%`,
                          }}
                          className="absolute border-2 border-indigo-600 bg-indigo-50/70 text-[10px] font-mono text-indigo-900 px-1 flex items-center pointer-events-none"
                        >
                          {f.name}
                        </div>
                      ))}
                  </div>
                </div>
              )}

            {/* Image Preview */}
            {imagePreviewUrl && (
              <div className="flex flex-col items-center justify-center p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950">
                <img
                  src={imagePreviewUrl}
                  alt="Uploaded image preview"
                  referrerPolicy="no-referrer"
                  className="max-h-96 object-contain rounded"
                />
              </div>
            )}

            {/* PDF to JPG Gallery */}
            {jpgGallery.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                {jpgGallery.map((img) => (
                  <div key={img.name} className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-2">
                    <img src={img.dataUrl} alt={img.name} referrerPolicy="no-referrer" className="w-full h-36 object-contain" />
                    <a
                      href={img.dataUrl}
                      download={img.name}
                      className="block text-center text-xs font-semibold text-red-600 hover:underline"
                    >
                      Download {img.name}
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Compare PDF Side-by-Side Diff */}
            {compareResult && (
              <div className="space-y-4">
                {compareResult.map((p) => (
                  <div key={p.pageNumber} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold">Page {p.pageNumber}</span>
                      <span className="text-red-600">{p.textDiffSummary}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[11px] text-slate-500 mb-1">Document A</p>
                        {p.imgA && <img src={p.imgA} alt="Doc A" className="w-full border rounded" />}
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 mb-1">Document B</p>
                        {p.imgB && <img src={p.imgB} alt="Doc B" className="w-full border rounded" />}
                      </div>
                      <div>
                        <p className="text-[11px] text-red-600 font-semibold mb-1">Visual Diff</p>
                        <img src={p.diffImg} alt="Visual Diff" className="w-full border rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Extracted Text / Markdown / AI Summary Result */}
            {resultText && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Output Text / Markdown</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(resultText)}
                    className="text-xs text-red-600 hover:underline cursor-pointer"
                  >
                    Copy Text
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={12}
                  value={resultText}
                  className="w-full p-3 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
