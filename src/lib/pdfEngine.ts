import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  PDFString,
} from 'pdf-lib';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { createWorker } from 'tesseract.js';
import { encryptPdfBytes } from './pdfEncrypt';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PdfPagePreview {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
  text: string;
}

export interface PdfEditOverlay {
  id: string;
  pageNumber: number;
  type: 'text' | 'highlight' | 'rect' | 'signature' | 'image' | 'redact';
  xRatio: number; // 0..1 from left
  yRatio: number; // 0..1 from top
  wRatio: number;
  hRatio: number;
  text?: string;
  color?: string;
  fontSize?: number;
  imageDataUrl?: string;
}

export interface PdfFormFieldSpec {
  id: string;
  name: string;
  type: 'text' | 'checkbox' | 'dropdown';
  pageNumber: number;
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
  options?: string[];
  defaultValue?: string;
}

function hexToRgbTuple(hex = '#000000'): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [0, 0, 0];
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

export async function getPdfPageCount(bytes: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

export async function renderPdfPages(
  bytes: ArrayBuffer,
  scale = 0.65,
  maxPages = 50,
  password?: string
): Promise<PdfPagePreview[]> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    password,
  });
  const pdf = await loadingTask.promise;
  const count = Math.min(pdf.numPages, maxPages);
  const results: PdfPagePreview[] = [];

  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();

    results.push({
      pageNumber: i,
      dataUrl: canvas.toDataURL('image/jpeg', 0.85),
      width: viewport.width,
      height: viewport.height,
      text,
    });
  }
  return results;
}

export async function extractPdfTextPages(
  bytes: ArrayBuffer,
  password?: string
): Promise<{ pageNumber: number; text: string; lines: string[][] }[]> {
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    password,
  }).promise;

  const pages: { pageNumber: number; text: string; lines: string[][] }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const rowMap = new Map<number, { x: number; str: string }[]>();

    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 6) * 6;
      const x = item.transform[4];
      if (!rowMap.has(y)) rowMap.set(y, []);
      rowMap.get(y)!.push({ x, str: item.str });
    }

    const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a);
    const lines: string[][] = [];
    for (const y of sortedYs) {
      const cells = rowMap
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((c) => c.str.trim())
        .filter(Boolean);
      if (cells.length > 0) lines.push(cells);
    }

    pages.push({
      pageNumber: i,
      text: lines.map((l) => l.join(' ')).join('\n'),
      lines,
    });
  }
  return pages;
}

export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const file of files) {
    const buf = await file.arrayBuffer();
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }
  return merged.save();
}

export async function splitPdf(
  file: File,
  mode: 'range' | 'all',
  rangeText: string
): Promise<{ blob: Blob; fileName: string }> {
  const buf = await file.arrayBuffer();
  const src = await PDFDocument.load(buf);
  const total = src.getPageCount();

  if (mode === 'all') {
    const zip = new JSZip();
    for (let i = 0; i < total; i++) {
      const out = await PDFDocument.create();
      const [copied] = await out.copyPages(src, [i]);
      out.addPage(copied);
      const bytes = await out.save();
      zip.file(`page_${i + 1}.pdf`, bytes);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return { blob: zipBlob, fileName: `${file.name.replace(/\.pdf$/i, '')}_split.zip` };
  }

  // Parse ranges like "1-3, 5, 7-8"
  const indices = new Set<number>();
  for (const part of rangeText.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [sStr, eStr] = trimmed.split('-');
      const s = Math.max(1, parseInt(sStr, 10) || 1);
      const e = Math.min(total, parseInt(eStr, 10) || total);
      for (let p = s; p <= e; p++) indices.add(p - 1);
    } else {
      const p = parseInt(trimmed, 10);
      if (p >= 1 && p <= total) indices.add(p - 1);
    }
  }
  if (indices.size === 0) {
    throw new Error('No valid page numbers specified in range.');
  }
  const out = await PDFDocument.create();
  const sorted = Array.from(indices).sort((a, b) => a - b);
  const copied = await out.copyPages(src, sorted);
  for (const p of copied) out.addPage(p);
  const outBytes = await out.save();
  return {
    blob: new Blob([outBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    fileName: `${file.name.replace(/\.pdf$/i, '')}_extracted.pdf`,
  };
}

export async function compressPdf(
  file: File,
  level: 'low' | 'medium' | 'high',
  onProgress?: (pct: number) => void
): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  if (level === 'low') {
    onProgress?.(40);
    const doc = await PDFDocument.load(buf);
    doc.setTitle('');
    doc.setProducer('I Love Documents');
    onProgress?.(90);
    return doc.save({ useObjectStreams: true });
  }

  // Medium / High: rasterize pages with JPEG re-compression at tuned DPI/quality
  const scale = level === 'medium' ? 1.35 : 0.95;
  const quality = level === 'medium' ? 0.72 : 0.5;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const out = await PDFDocument.create();

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const origViewport = page.getViewport({ scale: 1 });
    const renderViewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const jpgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    const jpgImg = await out.embedJpg(jpgBytes);
    const outPage = out.addPage([origViewport.width, origViewport.height]);
    outPage.drawImage(jpgImg, {
      x: 0,
      y: 0,
      width: origViewport.width,
      height: origViewport.height,
    });
    onProgress?.(Math.round((i / pdf.numPages) * 95));
  }
  return out.save({ useObjectStreams: true });
}

export async function pdfToWord(file: File): Promise<Blob> {
  const pages = await extractPdfTextPages(await file.arrayBuffer());
  const children: Paragraph[] = [];

  for (const p of pages) {
    children.push(
      new Paragraph({
        text: `Page ${p.pageNumber}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      })
    );
    for (const line of p.lines) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line.join(' '), size: 22 })],
          spacing: { after: 80 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  return Packer.toBlob(doc);
}

export async function pdfToPowerPoint(file: File): Promise<Blob> {
  const buf = await file.arrayBuffer();
  const previews = await renderPdfPages(buf, 1.4, 40);
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  for (const p of previews) {
    const slide = pptx.addSlide();
    slide.addImage({
      data: p.dataUrl,
      x: 0.4,
      y: 0.3,
      w: 9.2,
      h: 5.0,
      sizing: { type: 'contain', w: 9.2, h: 5.0 },
    });
    if (p.text) {
      slide.addNotes(p.text);
    }
  }
  const out = await pptx.write({ outputType: 'blob' });
  return out as Blob;
}

export async function pdfToExcel(file: File): Promise<Blob> {
  const pages = await extractPdfTextPages(await file.arrayBuffer());
  const wb = XLSX.utils.book_new();
  for (const p of pages) {
    const rows = p.lines.length > 0 ? p.lines : [['(No extractable text on this page)']];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, `Page_${p.pageNumber}`);
  }
  const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arr], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function typesetLinesToPdf(
  lines: string[],
  title?: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;
  const maxWidth = pageWidth - margin * 2;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  if (title) {
    page.drawText(title.slice(0, 80), {
      x: margin,
      y,
      size: 16,
      font: boldFont,
      color: rgb(0.06, 0.09, 0.16),
    });
    y -= 28;
  }

  const wrapLine = (text: string, size: number): string[] => {
    const words = text.split(/\s+/);
    const wrapped: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
        if (current) wrapped.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) wrapped.push(current);
    return wrapped.length ? wrapped : [''];
  };

  for (const rawLine of lines) {
    const safeLine = rawLine.replace(/[^\x20-\x7E\n]/g, ' ');
    const wrapped = wrapLine(safeLine, 10.5);
    for (const wLine of wrapped) {
      if (y < margin + 18) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      if (wLine) {
        page.drawText(wLine, {
          x: margin,
          y,
          size: 10.5,
          font,
          color: rgb(0.12, 0.15, 0.22),
        });
      }
      y -= 15;
    }
    y -= 4;
  }

  return doc.save();
}

export async function wordToPdf(file: File): Promise<Uint8Array> {
  if (/\.doc$/i.test(file.name)) {
    throw new Error('Legacy binary .doc files cannot be parsed directly in browser; please save as .docx first.');
  }
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  const lines = result.value.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) lines.push('(Empty DOCX document)');
  return typesetLinesToPdf(lines, file.name.replace(/\.docx$/i, ''));
}

export async function powerpointToPdf(file: File): Promise<Uint8Array> {
  if (/\.ppt$/i.test(file.name)) {
    throw new Error('Legacy binary .ppt files are not supported; please save as .pptx first.');
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideKeys = Object.keys(zip.files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return na - nb;
    });

  if (slideKeys.length === 0) {
    throw new Error('No slides found inside PPTX archive.');
  }

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < slideKeys.length; i++) {
    const xml = await zip.files[slideKeys[i]].async('string');
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    const paragraphs = Array.from(parsed.getElementsByTagName('a:p'))
      .map((p) =>
        Array.from(p.getElementsByTagName('a:t'))
          .map((t) => t.textContent || '')
          .join('')
          .trim()
      )
      .filter(Boolean);

    const page = doc.addPage([960, 540]);
    page.drawRectangle({ x: 0, y: 0, width: 960, height: 540, color: rgb(0.99, 0.99, 1) });
    page.drawText(`Slide ${i + 1}`, {
      x: 48,
      y: 495,
      size: 11,
      font: bold,
      color: rgb(0.45, 0.5, 0.58),
    });

    let y = 445;
    paragraphs.forEach((pText, idx) => {
      const clean = pText.replace(/[^\x20-\x7E]/g, ' ');
      const fontSize = idx === 0 ? 22 : 14;
      const useFont = idx === 0 ? bold : regular;
      const chunks = clean.match(/.{1,78}(\s|$)/g) || [clean];
      for (const ch of chunks) {
        if (y < 45) break;
        page.drawText(ch.trim(), {
          x: 52,
          y,
          size: fontSize,
          font: useFont,
          color: rgb(0.08, 0.1, 0.16),
        });
        y -= fontSize + 10;
      }
      y -= 6;
    });
  }

  return doc.save();
}

export async function excelToPdf(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false });
    let page = doc.addPage([841.89, 595.28]); // A4 Landscape
    let y = 550;

    page.drawText(`Sheet: ${sheetName}`, {
      x: 40,
      y,
      size: 14,
      font: bold,
      color: rgb(0.06, 0.09, 0.16),
    });
    y -= 26;

    for (let r = 0; r < rows.length; r++) {
      if (y < 40) {
        page = doc.addPage([841.89, 595.28]);
        y = 550;
      }
      const row = rows[r] || [];
      const colCount = Math.min(Math.max(row.length, 1), 8);
      const colW = (841.89 - 80) / colCount;
      for (let c = 0; c < colCount; c++) {
        const val = String(row[c] ?? '').replace(/[^\x20-\x7E]/g, ' ').slice(0, 22);
        page.drawRectangle({
          x: 40 + c * colW,
          y: y - 4,
          width: colW,
          height: 18,
          borderColor: rgb(0.84, 0.87, 0.91),
          borderWidth: 0.6,
          color: r === 0 ? rgb(0.94, 0.96, 0.98) : rgb(1, 1, 1),
        });
        page.drawText(val, {
          x: 44 + c * colW,
          y: y + 1,
          size: 8.5,
          font: r === 0 ? bold : regular,
          color: rgb(0.1, 0.12, 0.18),
        });
      }
      y -= 18;
    }
  }
  return doc.save();
}

export async function pdfToJpgZip(
  file: File,
  scale = 2,
  quality = 0.9
): Promise<{ blob: Blob; images: { name: string; dataUrl: string }[]; fileName: string }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const zip = new JSZip();
  const images: { name: string; dataUrl: string }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const name = `page_${i}.jpg`;
    images.push({ name, dataUrl });
    const b64 = dataUrl.split(',')[1];
    zip.file(name, b64, { base64: true });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    blob,
    images,
    fileName: `${file.name.replace(/\.pdf$/i, '')}_images.zip`,
  };
}

export async function imagesToPdf(
  files: File[],
  options: {
    pageSize: 'A4' | 'A3' | 'Letter' | 'Legal' | 'Custom';
    orientation: 'portrait' | 'landscape';
    marginPt: number;
    customWidthPt?: number;
    customHeightPt?: number;
  }
): Promise<Uint8Array> {
  const sizes: Record<string, [number, number]> = {
    A4: [595.28, 841.89],
    A3: [841.89, 1190.55],
    Letter: [612, 792],
    Legal: [612, 1008],
    Custom: [options.customWidthPt || 595.28, options.customHeightPt || 841.89],
  };

  let [pw, ph] = sizes[options.pageSize] || sizes.A4;
  if (options.orientation === 'landscape' && pw < ph) {
    [pw, ph] = [ph, pw];
  } else if (options.orientation === 'portrait' && pw > ph) {
    [pw, ph] = [ph, pw];
  }

  const doc = await PDFDocument.create();
  for (const file of files) {
    const imgUrl = URL.createObjectURL(file);
    const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = imgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    canvas.getContext('2d')!.drawImage(imgEl, 0, 0);
    URL.revokeObjectURL(imgUrl);

    const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const jpgBytes = Uint8Array.from(atob(jpgDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    const embedded = await doc.embedJpg(jpgBytes);

    const page = doc.addPage([pw, ph]);
    const availW = Math.max(20, pw - options.marginPt * 2);
    const availH = Math.max(20, ph - options.marginPt * 2);
    const scale = Math.min(availW / embedded.width, availH / embedded.height);
    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;

    page.drawImage(embedded, {
      x: (pw - drawW) / 2,
      y: (ph - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }
  return doc.save();
}

export async function watermarkPdf(
  file: File,
  options: {
    text: string;
    opacity: number;
    fontSize: number;
    rotation: number;
    color: string;
    position: 'center' | 'diagonal' | 'top-left' | 'bottom-right';
  }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const [r, g, b] = hexToRgbTuple(options.color);
  const pages = doc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textW = font.widthOfTextAtSize(options.text, options.fontSize);
    let x = (width - textW) / 2;
    let y = height / 2;
    let angle = options.rotation;

    if (options.position === 'diagonal') {
      angle = 45;
      x = width * 0.22;
      y = height * 0.35;
    } else if (options.position === 'top-left') {
      x = 40;
      y = height - 60;
      angle = 0;
    } else if (options.position === 'bottom-right') {
      x = Math.max(40, width - textW - 40);
      y = 40;
      angle = 0;
    }

    page.drawText(options.text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(r, g, b),
      opacity: options.opacity,
      rotate: degrees(angle),
    });
  }
  return doc.save();
}

export async function rotatePdf(
  file: File,
  pageRotations: Record<number, number>
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const pages = doc.getPages();
  pages.forEach((page, idx) => {
    const addDeg = pageRotations[idx + 1] || 0;
    if (addDeg !== 0) {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + addDeg) % 360));
    }
  });
  return doc.save();
}

export async function htmlToPdf(htmlString: string): Promise<Uint8Array> {
  const parsed = new DOMParser().parseFromString(htmlString, 'text/html');
  parsed.querySelectorAll('script,style,noscript').forEach((el) => el.remove());
  const title = parsed.title || 'Converted HTML Document';
  const rawText = (parsed.body?.innerText || parsed.body?.textContent || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (rawText.length === 0) rawText.push('(No readable text content found in HTML)');
  return typesetLinesToPdf(rawText, title);
}

export async function unlockPdf(file: File, password: string): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  // Verify password via pdfjs-dist first
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buf.slice(0)),
    password,
  }).promise;

  // Rebuild clean unlocked PDF preserving rendered fidelity
  const out = await PDFDocument.create();
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const orig = page.getViewport({ scale: 1 });
    const render = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(render.width);
    canvas.height = Math.ceil(render.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: render, canvas }).promise;
    const jpgUrl = canvas.toDataURL('image/jpeg', 0.93);
    const jpgBytes = Uint8Array.from(atob(jpgUrl.split(',')[1]), (c) => c.charCodeAt(0));
    const embedded = await out.embedJpg(jpgBytes);
    const outPage = out.addPage([orig.width, orig.height]);
    outPage.drawImage(embedded, { x: 0, y: 0, width: orig.width, height: orig.height });
  }
  return out.save();
}

export async function protectPdf(file: File, password: string): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return encryptPdfBytes(new Uint8Array(buf), password);
}

export async function organizePdf(
  file: File,
  pageOrder: number[] // 1-based original page numbers in desired order
): Promise<Uint8Array> {
  const src = await PDFDocument.load(await file.arrayBuffer());
  const out = await PDFDocument.create();
  const indices = pageOrder.map((p) => p - 1).filter((idx) => idx >= 0 && idx < src.getPageCount());
  const copied = await out.copyPages(src, indices);
  for (const p of copied) out.addPage(p);
  return out.save();
}

export async function convertToPdfA(file: File): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const nowIso = new Date().toISOString();
  doc.setTitle(file.name.replace(/\.pdf$/i, ''));
  doc.setProducer('I Love Documents PDF/A-1b Archival Engine');
  doc.setCreator('I Love Documents');
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());

  const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>1</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${file.name}</rdf:li></rdf:Alt></dc:title>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreateDate>${nowIso}</xmp:CreateDate>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const metadataStream = doc.context.flateStream(new TextEncoder().encode(xmp), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML'),
  });
  const metadataRef = doc.context.register(metadataStream);
  doc.catalog.set(PDFName.of('Metadata'), metadataRef);

  const outputIntent = doc.context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
  });
  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([outputIntent]));

  return doc.save({ useObjectStreams: false });
}

export async function repairPdf(file: File): Promise<{ bytes: Uint8Array; method: string }> {
  const buf = await file.arrayBuffer();
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    const out = await PDFDocument.create();
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const p of pages) out.addPage(p);
    return { bytes: await out.save(), method: 'Structural Cross-Reference Rebuild' };
  } catch {
    // Fallback: PDF.js tolerant stream recovery
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const out = await PDFDocument.create();
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const orig = page.getViewport({ scale: 1 });
      const render = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(render.width);
      canvas.height = Math.ceil(render.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport: render, canvas }).promise;
      const jpgUrl = canvas.toDataURL('image/jpeg', 0.92);
      const jpgBytes = Uint8Array.from(atob(jpgUrl.split(',')[1]), (c) => c.charCodeAt(0));
      const embedded = await out.embedJpg(jpgBytes);
      const outPage = out.addPage([orig.width, orig.height]);
      outPage.drawImage(embedded, { x: 0, y: 0, width: orig.width, height: orig.height });
    }
    return { bytes: await out.save(), method: 'Deep Page-Stream Recovery' };
  }
}

export async function addPageNumbers(
  file: File,
  options: {
    position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
    startNumber: number;
    format: 'number' | 'page-of-n' | 'dashed';
    fontSize: number;
  }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;

  pages.forEach((page, idx) => {
    const { width, height } = page.getSize();
    const num = options.startNumber + idx;
    let label = String(num);
    if (options.format === 'page-of-n') label = `Page ${num} of ${total + options.startNumber - 1}`;
    if (options.format === 'dashed') label = `- ${num} -`;

    const tw = font.widthOfTextAtSize(label, options.fontSize);
    let x = (width - tw) / 2;
    let y = 24;

    if (options.position.includes('left')) x = 32;
    if (options.position.includes('right')) x = width - tw - 32;
    if (options.position.includes('top')) y = height - 28;

    page.drawText(label, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(0.15, 0.18, 0.24),
    });
  });

  return doc.save();
}

export async function ocrPdf(
  file: File,
  language = 'eng',
  onProgress?: (pct: number) => void
): Promise<{ pdfBytes: Uint8Array; extractedText: string }> {
  const worker = await createWorker(language);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const allText: string[] = [];

  try {
    if (file.type.startsWith('image/')) {
      onProgress?.(20);
      const url = URL.createObjectURL(file);
      const { data } = await worker.recognize(url);
      allText.push(data.text);

      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new Image();
        el.onload = () => res(el);
        el.onerror = rej;
        el.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const jpgUrl = c.toDataURL('image/jpeg', 0.9);
      const jpgBytes = Uint8Array.from(atob(jpgUrl.split(',')[1]), (ch) => ch.charCodeAt(0));
      const embedded = await out.embedJpg(jpgBytes);
      const page = out.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      // Embed searchable invisible text layer
      const cleanLines = data.text.replace(/[^\x20-\x7E\n]/g, ' ').split('\n').slice(0, 80);
      cleanLines.forEach((line, idx) => {
        if (line.trim()) {
          page.drawText(line.slice(0, 110), {
            x: 24,
            y: Math.max(20, embedded.height - 30 - idx * 14),
            size: 10,
            font,
            opacity: 0.01,
          });
        }
      });
      onProgress?.(100);
    } else {
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const orig = page.getViewport({ scale: 1 });
        const render = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(render.width);
        canvas.height = Math.ceil(render.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: render, canvas }).promise;

        const { data } = await worker.recognize(canvas);
        allText.push(`--- Page ${i} ---\n${data.text}`);

        const jpgUrl = canvas.toDataURL('image/jpeg', 0.9);
        const jpgBytes = Uint8Array.from(atob(jpgUrl.split(',')[1]), (ch) => ch.charCodeAt(0));
        const embedded = await out.embedJpg(jpgBytes);
        const outPage = out.addPage([orig.width, orig.height]);
        outPage.drawImage(embedded, { x: 0, y: 0, width: orig.width, height: orig.height });

        const cleanLines = data.text.replace(/[^\x20-\x7E\n]/g, ' ').split('\n').slice(0, 80);
        cleanLines.forEach((line, idx) => {
          if (line.trim()) {
            outPage.drawText(line.slice(0, 110), {
              x: 24,
              y: Math.max(20, orig.height - 30 - idx * 14),
              size: 9,
              font,
              opacity: 0.01,
            });
          }
        });
        onProgress?.(Math.round((i / pdf.numPages) * 100));
      }
    }
  } finally {
    await worker.terminate();
  }

  return {
    pdfBytes: await out.save(),
    extractedText: allText.join('\n\n'),
  };
}

export async function comparePdfs(
  fileA: File,
  fileB: File
): Promise<{
  pages: Array<{
    pageNumber: number;
    imgA: string;
    imgB: string;
    diffImg: string;
    diffPercent: number;
    textDiffSummary: string;
  }>;
}> {
  const [bufA, bufB] = await Promise.all([fileA.arrayBuffer(), fileB.arrayBuffer()]);
  const [pdfA, pdfB] = await Promise.all([
    pdfjsLib.getDocument({ data: new Uint8Array(bufA) }).promise,
    pdfjsLib.getDocument({ data: new Uint8Array(bufB) }).promise,
  ]);

  const maxPages = Math.min(Math.max(pdfA.numPages, pdfB.numPages), 15);
  const results = [];

  for (let i = 1; i <= maxPages; i++) {
    const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
      if (pageNum > pdf.numPages) return { canvas: null, text: '' };
      const page = await pdf.getPage(pageNum);
      const vp = page.getViewport({ scale: 1.1 });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c }).promise;
      const tc = await page.getTextContent();
      const text = tc.items.map((x) => ('str' in x ? x.str : '')).join(' ');
      return { canvas: c, text };
    };

    const [resA, resB] = await Promise.all([renderPage(pdfA, i), renderPage(pdfB, i)]);
    const w = Math.max(resA.canvas?.width || 400, resB.canvas?.width || 400);
    const h = Math.max(resA.canvas?.height || 550, resB.canvas?.height || 550);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = w;
    diffCanvas.height = h;
    const diffCtx = diffCanvas.getContext('2d')!;
    diffCtx.fillStyle = '#ffffff';
    diffCtx.fillRect(0, 0, w, h);

    const dataA = resA.canvas
      ? resA.canvas.getContext('2d')!.getImageData(0, 0, resA.canvas.width, resA.canvas.height)
      : null;
    const dataB = resB.canvas
      ? resB.canvas.getContext('2d')!.getImageData(0, 0, resB.canvas.width, resB.canvas.height)
      : null;

    const outImg = diffCtx.createImageData(w, h);
    let changedPixels = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const inA = dataA && x < dataA.width && y < dataA.height;
        const inB = dataB && x < dataB.width && y < dataB.height;
        const idxA = inA ? (y * dataA.width + x) * 4 : 0;
        const idxB = inB ? (y * dataB.width + x) * 4 : 0;

        const rA = inA ? dataA.data[idxA] : 255;
        const gA = inA ? dataA.data[idxA + 1] : 255;
        const bA = inA ? dataA.data[idxA + 2] : 255;

        const rB = inB ? dataB.data[idxB] : 255;
        const gB = inB ? dataB.data[idxB + 1] : 255;
        const bB = inB ? dataB.data[idxB + 2] : 255;

        const delta = Math.abs(rA - rB) + Math.abs(gA - gB) + Math.abs(bA - bB);
        if (delta > 45) {
          changedPixels++;
          outImg.data[idx] = 220;
          outImg.data[idx + 1] = 38;
          outImg.data[idx + 2] = 38;
          outImg.data[idx + 3] = 255;
        } else {
          outImg.data[idx] = Math.round(rB * 0.25 + 255 * 0.75);
          outImg.data[idx + 1] = Math.round(gB * 0.25 + 255 * 0.75);
          outImg.data[idx + 2] = Math.round(bB * 0.25 + 255 * 0.75);
          outImg.data[idx + 3] = 255;
        }
      }
    }
    diffCtx.putImageData(outImg, 0, 0);

    const diffPercent = Number(((changedPixels / (w * h)) * 100).toFixed(2));
    const wordsA = new Set(resA.text.split(/\s+/).filter(Boolean));
    const wordsB = new Set(resB.text.split(/\s+/).filter(Boolean));
    let added = 0;
    let removed = 0;
    wordsB.forEach((word) => {
      if (!wordsA.has(word)) added++;
    });
    wordsA.forEach((word) => {
      if (!wordsB.has(word)) removed++;
    });

    results.push({
      pageNumber: i,
      imgA: resA.canvas ? resA.canvas.toDataURL('image/jpeg', 0.85) : '',
      imgB: resB.canvas ? resB.canvas.toDataURL('image/jpeg', 0.85) : '',
      diffImg: diffCanvas.toDataURL('image/jpeg', 0.85),
      diffPercent,
      textDiffSummary: `${diffPercent}% visual delta · +${added} new tokens · -${removed} removed tokens`,
    });
  }

  return { pages: results };
}

/**
 * Permanently redacts pages with redaction boxes by rasterizing affected pages
 * with solid black blocks baked into pixels so underlying text objects are destroyed.
 */
export async function applyPermanentRedactions(
  file: File,
  redactions: PdfEditOverlay[]
): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(buf.slice(0));
  const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  const outDoc = await PDFDocument.create();

  for (let p = 1; p <= pdfJsDoc.numPages; p++) {
    const pageBoxes = redactions.filter((r) => r.pageNumber === p);
    if (pageBoxes.length === 0) {
      const [copied] = await outDoc.copyPages(srcDoc, [p - 1]);
      outDoc.addPage(copied);
      continue;
    }

    const page = await pdfJsDoc.getPage(p);
    const orig = page.getViewport({ scale: 1 });
    const render = page.getViewport({ scale: 2.2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(render.width);
    canvas.height = Math.ceil(render.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport: render, canvas }).promise;

    ctx.fillStyle = '#000000';
    for (const box of pageBoxes) {
      ctx.fillRect(
        box.xRatio * canvas.width,
        box.yRatio * canvas.height,
        box.wRatio * canvas.width,
        box.hRatio * canvas.height
      );
    }

    const jpgUrl = canvas.toDataURL('image/jpeg', 0.94);
    const jpgBytes = Uint8Array.from(atob(jpgUrl.split(',')[1]), (c) => c.charCodeAt(0));
    const embedded = await outDoc.embedJpg(jpgBytes);
    const outPage = outDoc.addPage([orig.width, orig.height]);
    outPage.drawImage(embedded, { x: 0, y: 0, width: orig.width, height: orig.height });
  }

  return outDoc.save();
}

export async function cropPdf(
  file: File,
  marginsPt: { top: number; right: number; bottom: number; left: number }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const newW = Math.max(40, width - marginsPt.left - marginsPt.right);
    const newH = Math.max(40, height - marginsPt.top - marginsPt.bottom);
    page.setCropBox(marginsPt.left, marginsPt.bottom, newW, newH);
    page.setMediaBox(marginsPt.left, marginsPt.bottom, newW, newH);
  }
  return doc.save();
}

export async function applyPdfForms(
  file: File,
  fields: PdfFormFieldSpec[],
  fillValues: Record<string, string | boolean>,
  flatten = false
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const form = doc.getForm();
  const pages = doc.getPages();

  // Fill existing fields if present
  for (const existing of form.getFields()) {
    const name = existing.getName();
    if (name in fillValues) {
      const val = fillValues[name];
      try {
        if (typeof val === 'boolean') {
          const cb = form.getCheckBox(name);
          if (val) cb.check();
          else cb.uncheck();
        } else {
          const tf = form.getTextField(name);
          tf.setText(String(val));
        }
      } catch {
        // ignore type mismatch
      }
    }
  }

  // Create newly added fields
  for (const spec of fields) {
    const page = pages[spec.pageNumber - 1] || pages[0];
    const { width, height } = page.getSize();
    const x = spec.xRatio * width;
    const y = height - (spec.yRatio + spec.hRatio) * height;
    const w = Math.max(24, spec.wRatio * width);
    const h = Math.max(18, spec.hRatio * height);

    if (spec.type === 'text') {
      const tf = form.createTextField(spec.name);
      tf.setText(String(fillValues[spec.name] ?? spec.defaultValue ?? ''));
      tf.addToPage(page, { x, y, width: w, height: h });
    } else if (spec.type === 'checkbox') {
      const cb = form.createCheckBox(spec.name);
      if (fillValues[spec.name]) cb.check();
      cb.addToPage(page, { x, y, width: Math.min(w, 24), height: Math.min(h, 24) });
    } else if (spec.type === 'dropdown') {
      const dd = form.createDropdown(spec.name);
      const opts = spec.options?.length ? spec.options : ['Option A', 'Option B', 'Option C'];
      dd.addOptions(opts);
      dd.select(String(fillValues[spec.name] ?? opts[0]));
      dd.addToPage(page, { x, y, width: w, height: h });
    }
  }

  if (flatten) {
    form.flatten();
  }
  return doc.save();
}

export async function inspectPdfFormFields(file: File): Promise<{ name: string; type: string; value: string }[]> {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const form = doc.getForm();
  return form.getFields().map((f) => ({
    name: f.getName(),
    type: f.constructor.name,
    value: '',
  }));
}

export async function pdfToMarkdown(file: File): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const sections: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string; h: number }[]>();

    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 5) * 5;
      const x = item.transform[4];
      const h = Math.abs(item.transform[0]) || 11;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str: item.str, h });
    }

    const sortedYs = Array.from(rows.keys()).sort((a, b) => b - a);
    const mdLines: string[] = [`<!-- Page ${i} -->`];

    for (const y of sortedYs) {
      const items = rows.get(y)!.sort((a, b) => a.x - b.x);
      const avgH = items.reduce((s, x) => s + x.h, 0) / items.length;
      const lineText = items.map((x) => x.str.trim()).join(' ').trim();
      if (!lineText) continue;

      if (items.length >= 3 && items.some((x) => x.x > 200)) {
        // Possible table row
        mdLines.push(`| ${items.map((x) => x.str.trim()).join(' | ')} |`);
      } else if (avgH >= 18) {
        mdLines.push(`# ${lineText}`);
      } else if (avgH >= 14) {
        mdLines.push(`## ${lineText}`);
      } else if (/^[•\-*]\s/.test(lineText)) {
        mdLines.push(`- ${lineText.replace(/^[•\-*]\s*/, '')}`);
      } else {
        mdLines.push(lineText);
      }
    }

    sections.push(mdLines.join('\n\n'));
  }

  return sections.join('\n\n---\n\n');
}

export async function applyPdfEditsAndSignature(
  file: File,
  overlays: PdfEditOverlay[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const ov of overlays) {
    const page = pages[ov.pageNumber - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const x = ov.xRatio * width;
    const w = ov.wRatio * width;
    const h = ov.hRatio * height;
    const y = height - ov.yRatio * height - h;

    if (ov.type === 'text' && ov.text) {
      const [r, g, b] = hexToRgbTuple(ov.color || '#0F172A');
      page.drawText(ov.text.replace(/[^\x20-\x7E]/g, ' '), {
        x,
        y: height - ov.yRatio * height - (ov.fontSize || 14),
        size: ov.fontSize || 14,
        font,
        color: rgb(r, g, b),
      });
    } else if (ov.type === 'highlight') {
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: rgb(0.98, 0.85, 0.15),
        opacity: 0.35,
      });
    } else if (ov.type === 'rect') {
      const [r, g, b] = hexToRgbTuple(ov.color || '#DC2626');
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        borderColor: rgb(r, g, b),
        borderWidth: 2,
      });
    } else if ((ov.type === 'signature' || ov.type === 'image') && ov.imageDataUrl) {
      const base64 = ov.imageDataUrl.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const embedded = ov.imageDataUrl.includes('image/png')
        ? await doc.embedPng(bytes)
        : await doc.embedJpg(bytes);
      page.drawImage(embedded, { x, y, width: w, height: h });
    }
  }

  return doc.save();
}
