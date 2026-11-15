import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import sharp from 'sharp';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3000;
const TEMP_DIR = '/tmp/ilovedocuments_temp';
const RETENTION_MINUTES = 60;
const TOKEN_SECRET = process.env.TEMP_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Cleanup expired temporary files every 10 minutes
setInterval(() => {
  try {
    const now = Date.now();
    const entries = fs.readdirSync(TEMP_DIR);
    for (const entry of entries) {
      if (entry.endsWith('.meta.json')) {
        const metaPath = path.join(TEMP_DIR, entry);
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          if (meta.expiresAt && now > meta.expiresAt) {
            const dataPath = path.join(TEMP_DIR, meta.storageName);
            if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
            fs.unlinkSync(metaPath);
          }
        } catch {
          // ignore malformed meta
        }
      }
    }
  } catch {
    // ignore cleanup error
  }
}, 10 * 60 * 1000);

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function signDownloadToken(fileId: string, expiresAt: number): string {
  const payload = `${fileId}:${expiresAt}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return `${expiresAt}.${sig}`;
}

function verifyDownloadToken(fileId: string, token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const expiresAt = Number(parts[0]);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = signDownloadToken(fileId, expiresAt);
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.startsWith('10.') ||
    lower.startsWith('192.168.') ||
    lower.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(lower)
  ) {
    return true;
  }
  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB cap
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, retentionMinutes: RETENTION_MINUTES });
  });

  // Server-side Sharp image processing
  app.post('/api/images/process', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
      }
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedMimes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: 'Unsupported image MIME type. Allowed: JPG, PNG, WEBP.' });
      }

      const width = req.body.width ? Number(req.body.width) : undefined;
      const height = req.body.height ? Number(req.body.height) : undefined;
      const format = (req.body.format || 'jpeg').toLowerCase();
      const quality = Math.min(100, Math.max(10, Number(req.body.quality) || 85));
      const rotate = req.body.rotate ? Number(req.body.rotate) : 0;
      const brightness = req.body.brightness ? Number(req.body.brightness) : 1;
      const contrast = req.body.contrast ? Number(req.body.contrast) : 1;
      const sharpen = req.body.sharpen === 'true';
      const denoise = req.body.denoise === 'true';
      const grayscale = req.body.grayscale === 'true';
      const fit = (req.body.fit || 'inside') as 'inside' | 'cover' | 'fill' | 'contain';

      let pipeline = sharp(req.file.buffer).rotate();

      if (rotate && [90, 180, 270].includes(rotate)) {
        pipeline = pipeline.rotate(rotate);
      }

      if (width || height) {
        pipeline = pipeline.resize({
          width: width && width > 0 ? Math.min(width, 8000) : undefined,
          height: height && height > 0 ? Math.min(height, 8000) : undefined,
          fit,
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: false,
        });
      }

      if (grayscale) {
        pipeline = pipeline.grayscale();
      }

      if (brightness !== 1) {
        pipeline = pipeline.modulate({ brightness: Math.max(0.2, Math.min(2.5, brightness)) });
      }

      if (contrast !== 1) {
        const c = Math.max(0.5, Math.min(2.5, contrast));
        const offset = 128 * (1 - c);
        pipeline = pipeline.linear(c, offset);
      }

      if (denoise) {
        pipeline = pipeline.median(3);
      }

      if (sharpen) {
        pipeline = pipeline.sharpen({ sigma: 1.2 });
      }

      let outBuffer: Buffer;
      let outMime = 'image/jpeg';
      if (format === 'png') {
        outBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        outMime = 'image/png';
      } else if (format === 'webp') {
        outBuffer = await pipeline.webp({ quality }).toBuffer();
        outMime = 'image/webp';
      } else {
        outBuffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
        outMime = 'image/jpeg';
      }

      res.setHeader('Content-Type', outMime);
      res.setHeader('X-Output-Size', String(outBuffer.length));
      return res.send(outBuffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image processing failed';
      return res.status(500).json({ error: msg });
    }
  });

  // Temporary secure expiring file storage
  app.post('/api/files/temp', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }
      const fileId = crypto.randomBytes(12).toString('hex');
      const safeOriginal = req.file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 120) || 'document';
      const storageName = `${fileId}_${safeOriginal}`;
      const expiresAt = Date.now() + RETENTION_MINUTES * 60 * 1000;

      fs.writeFileSync(path.join(TEMP_DIR, storageName), req.file.buffer);
      fs.writeFileSync(
        path.join(TEMP_DIR, `${fileId}.meta.json`),
        JSON.stringify({
          fileId,
          storageName,
          originalName: safeOriginal,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          expiresAt,
        })
      );

      const token = signDownloadToken(fileId, expiresAt);
      const downloadUrl = `/api/files/download/${fileId}?token=${encodeURIComponent(token)}`;
      return res.json({
        fileId,
        downloadToken: token,
        downloadUrl,
        expiresAt,
        retentionMinutes: RETENTION_MINUTES,
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to store temporary file.' });
    }
  });

  app.get('/api/files/download/:fileId', (req, res) => {
    try {
      const fileId = req.params.fileId;
      const token = String(req.query.token || '');
      if (!/^[a-f0-9]{24}$/.test(fileId) || !verifyDownloadToken(fileId, token)) {
        return res.status(403).json({ error: 'Invalid or expired download link.' });
      }
      const metaPath = path.join(TEMP_DIR, `${fileId}.meta.json`);
      if (!fs.existsSync(metaPath)) {
        return res.status(404).json({ error: 'File expired or deleted.' });
      }
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const dataPath = path.join(TEMP_DIR, meta.storageName);
      if (!fs.existsSync(dataPath)) {
        return res.status(404).json({ error: 'File data not found.' });
      }
      res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${meta.originalName}"`);
      return fs.createReadStream(dataPath).pipe(res);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Download failed.' });
    }
  });

  app.delete('/api/files/temp/:fileId', (req, res) => {
    try {
      const fileId = req.params.fileId;
      if (!/^[a-f0-9]{24}$/.test(fileId)) {
        return res.status(400).json({ error: 'Invalid fileId.' });
      }
      const metaPath = path.join(TEMP_DIR, `${fileId}.meta.json`);
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const dataPath = path.join(TEMP_DIR, meta.storageName);
        if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
        fs.unlinkSync(metaPath);
      }
      return res.json({ deleted: true });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Delete failed.' });
    }
  });

  // Safe HTML fetch for HTML-to-PDF
  app.post('/api/tools/fetch-html', async (req, res) => {
    try {
      const rawUrl = String(req.body?.url || '').trim();
      if (!rawUrl) return res.status(400).json({ error: 'URL is required.' });
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return res.status(400).json({ error: 'Invalid URL format.' });
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHostname(parsed.hostname)) {
        return res.status(400).json({ error: 'Only public HTTP/HTTPS URLs are permitted.' });
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(parsed.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'ILoveDocuments-HTML2PDF/1.0' },
      });
      clearTimeout(timer);
      if (!response.ok) {
        return res.status(400).json({ error: `Failed to fetch webpage (${response.status}).` });
      }
      const html = (await response.text()).slice(0, 1_500_000);
      return res.json({ html });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch HTML.' });
    }
  });

  // Gemini AI: Document Analysis (Summarize, Explain, Extract, Outline, Notes)
  app.post('/api/ai/analyze', async (req, res) => {
    try {
      const { consentAccepted, mode, documentText, documentName, customPrompt, imageBase64, imageMimeType } = req.body || {};
      if (!consentAccepted) {
        return res.status(400).json({ error: 'Explicit user consent is required before sending document data to Gemini AI.' });
      }
      if (!documentText && !imageBase64) {
        return res.status(400).json({ error: 'Please upload or select a document first.' });
      }

      const ai = getGeminiClient();
      const taskPrompts: Record<string, string> = {
        summarize: 'Create a structured executive summary with Key Takeaways (bullet points), Core Arguments, and Action Items.',
        explain: 'Explain the complex concepts, jargon, and technical or legal sections of this document in plain, clear everyday language.',
        extract: 'Extract all important structured entities: Dates & Deadlines, People & Organizations, Key Figures/Amounts, and Tabular Data formatted in clean Markdown tables.',
        outline: 'Generate a hierarchical document outline with numbered sections and concise 1-line descriptions.',
        notes: 'Convert this document into clean, organized study/reference notes with headings, bold key terms, and quick review questions.',
        custom: customPrompt || 'Analyze this document thoroughly.',
      };

      const instruction = taskPrompts[mode] || taskPrompts.summarize;
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (imageBase64 && imageMimeType) {
        parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
      }
      parts.push({
        text: `Document Name: ${documentName || 'Uploaded Document'}\n\nTask: ${instruction}\n\nDocument Content:\n${String(documentText || '').slice(0, 120000)}`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction:
            'You are a precision document analysis assistant for I Love Documents. Ground every statement strictly in the provided document. Never invent facts not present in the source.',
        },
      });

      return res.json({ result: response.text || 'No analysis generated.' });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'AI analysis failed.' });
    }
  });

  // Gemini AI: Translate PDF pages preserving structure
  app.post('/api/ai/translate', async (req, res) => {
    try {
      const { consentAccepted, pages, targetLanguage } = req.body || {};
      if (!consentAccepted) {
        return res.status(400).json({ error: 'Explicit user consent is required before translating via AI.' });
      }
      if (!Array.isArray(pages) || pages.length === 0 || !targetLanguage) {
        return res.status(400).json({ error: 'Document pages and target language are required.' });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Translate each page's text accurately into ${targetLanguage}, preserving headings, paragraphs, bullet lists, and numeric values.\n\nPages JSON:\n${JSON.stringify(pages.slice(0, 30))}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pageNumber: { type: Type.INTEGER },
                translatedText: { type: Type.STRING },
              },
              required: ['pageNumber', 'translatedText'],
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '[]').trim());
      return res.json({ translatedPages: parsed });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Translation failed.' });
    }
  });

  // Gemini AI: Multi-turn Q&A chat grounded in document
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { consentAccepted, documentText, documentName, history, question } = req.body || {};
      if (!consentAccepted) {
        return res.status(400).json({ error: 'Explicit user consent is required before using the AI assistant.' });
      }
      if (!question || !documentText) {
        return res.status(400).json({ error: 'Document context and question are required.' });
      }

      const ai = getGeminiClient();
      const formattedHistory = Array.isArray(history)
        ? history
            .slice(-10)
            .map((m: { role: string; text: string }) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
            .join('\n')
        : '';

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Document Name: ${documentName || 'Selected Document'}\n\nDocument Excerpt:\n${String(documentText).slice(0, 100000)}\n\nConversation History:\n${formattedHistory}\n\nUser Question: ${question}`,
        config: {
          systemInstruction:
            'Answer the user question strictly using the provided document content. If the answer is not in the document, clearly state that it is not present in the uploaded file.',
        },
      });

      return res.json({ answer: response.text || 'Unable to generate an answer.' });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'AI chat failed.' });
    }
  });

  // Gemini Vision: Accurate Passport Face Bounding Box Detection
  app.post('/api/ai/detect-face', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body || {};
      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ error: 'Image data is required.' });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            {
              text: 'Detect the primary human face (from crown of hair/top of head to chin, and left ear to right ear) in this portrait photograph. Return normalized bounding box coordinates from 0 to 1000.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              found: { type: Type.BOOLEAN },
              ymin: { type: Type.INTEGER },
              xmin: { type: Type.INTEGER },
              ymax: { type: Type.INTEGER },
              xmax: { type: Type.INTEGER },
            },
            required: ['found', 'ymin', 'xmin', 'ymax', 'xmax'],
          },
        },
      });

      const box = JSON.parse((response.text ?? '{"found":false,"ymin":150,"xmin":300,"ymax":650,"xmax":700}').trim());
      return res.json(box);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Face detection failed.' });
    }
  });

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`I Love Documents server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
