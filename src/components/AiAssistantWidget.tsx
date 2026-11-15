import React, { useState } from 'react';
import { Bot, FileText, Loader2, Send, ShieldCheck, Upload, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { extractPdfTextPages } from '../lib/pdfEngine';

export const AiAssistantWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [error, setError] = useState('');
  const { sessionDocs, addSessionDoc } = useAuth();

  const activeDoc = sessionDocs.find((d) => d.id === selectedDocId) || sessionDocs[0] || null;

  const handleUploadForAi = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      let extractedText = '';
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const pages = await extractPdfTextPages(await file.arrayBuffer());
        extractedText = pages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join('\n\n');
      } else {
        extractedText = await file.text();
      }
      if (!extractedText.trim()) {
        extractedText = `(Uploaded file: ${file.name}, size ${file.size} bytes — no plain text layer detected; try OCR PDF first for scanned PDFs.)`;
      }
      const id = `doc_${Date.now()}`;
      addSessionDoc({
        id,
        name: file.name,
        mimeType: file.type || 'application/pdf',
        sizeBytes: file.size,
        extractedText,
        file,
      });
      setSelectedDocId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read document.');
    }
  };

  const runQuickAction = async (mode: 'summarize' | 'explain' | 'extract' | 'outline' | 'notes') => {
    if (!activeDoc) {
      setError('Please upload or select a document first.');
      return;
    }
    if (!consent) {
      setError('Please check the consent confirmation to send this document to Gemini AI.');
      return;
    }
    setError('');
    setLoading(true);
    const labelMap = {
      summarize: 'Summarize this document',
      explain: 'Explain difficult concepts in plain language',
      extract: 'Extract dates, names, amounts, and tables',
      outline: 'Generate structured outline',
      notes: 'Convert document into study notes',
    };
    setMessages((prev) => [...prev, { role: 'user', text: labelMap[mode] }]);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consentAccepted: true,
          mode,
          documentName: activeDoc.name,
          documentText: activeDoc.extractedText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI request failed');
      setMessages((prev) => [...prev, { role: 'assistant', text: data.result }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    if (!activeDoc) {
      setError('Upload or select a document first.');
      return;
    }
    if (!consent) {
      setError('Please confirm consent before sending document content to AI.');
      return;
    }
    const q = question.trim();
    setQuestion('');
    setError('');
    const nextHistory = [...messages, { role: 'user' as const, text: q }];
    setMessages(nextHistory);
    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consentAccepted: true,
          documentName: activeDoc.name,
          documentText: activeDoc.extractedText,
          history: nextHistory,
          question: q,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI chat failed');
      setMessages((prev) => [...prev, { role: 'assistant', text: data.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI chat failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] cursor-pointer"
        style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
        aria-label="Open AI Document Assistant"
      >
        <Bot className="w-4 h-4" />
        <span>AI Assistant</span>
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[78vh]">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-red-600" />
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                AI Document Assistant
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Close AI Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-slate-50 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              {sessionDocs.length > 0 ? (
                <select
                  value={activeDoc?.id || ''}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="flex-1 text-xs px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  {sessionDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <FileText className="w-4 h-4" />
                  <span>No document selected</span>
                </div>
              )}

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload</span>
                <input type="file" accept=".pdf,.txt,.md,.csv" onChange={handleUploadForAi} className="hidden" />
              </label>
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span>
                <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-emerald-600" />
                I consent to send only the selected document to Gemini AI for analysis.
              </span>
            </label>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['summarize', 'Summarize'],
                  ['explain', 'Explain'],
                  ['extract', 'Extract Tables/Dates'],
                  ['outline', 'Outline'],
                  ['notes', 'Study Notes'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  disabled={loading}
                  onClick={() => runQuickAction(mode)}
                  className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
            {messages.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload or choose an explicitly selected PDF/text file above, confirm consent, and ask any question or run an action.
              </p>
            )}
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`text-xs leading-relaxed p-3 rounded-lg whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white dark:bg-slate-700 ml-8'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 mr-4'
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analyzing selected document...</span>
              </div>
            )}
            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2.5">
                {error}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSendQuestion}
            className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about this document..."
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={loading}
              className="p-2 rounded-lg text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
              aria-label="Send question"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
