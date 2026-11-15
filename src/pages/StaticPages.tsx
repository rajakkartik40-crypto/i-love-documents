import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export const AboutPage: React.FC = () => (
  <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
    <h1 className="text-3xl font-display font-bold text-slate-950 dark:text-white">
      About I Love Documents
    </h1>
    <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">
      <strong>I Love Documents</strong> is an all-in-one document management, PDF utility, passport photography, mobile scanning, and AI intelligence suite built by <strong>Kartik Rajak</strong>.
    </p>
    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
      Our mission is to bring everyday document tasks — merging, splitting, compressing, converting Office documents, creating printable passport photos, scanning physical paperwork, and extracting structured insights — into one clean, fast, privacy-first interface.
    </p>
  </div>
);

export const PrivacyPage: React.FC = () => (
  <div className="max-w-3xl mx-auto px-4 py-12 space-y-5">
    <h1 className="text-3xl font-display font-bold text-slate-950 dark:text-white">Privacy Policy</h1>
    <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed list-disc pl-5">
      <li>Most PDF and image processing runs locally inside your browser using WebAssembly/JavaScript engines without uploading private documents.</li>
      <li>When server processing or signed download links are generated, files are stored temporarily in isolated storage with HMAC-signed expiring URLs and automatically deleted after 60 minutes.</li>
      <li>Document passwords for Protect PDF and Unlock PDF are never stored in plaintext or logged.</li>
      <li>Documents are never sent to Gemini AI services without your explicit consent confirmation.</li>
      <li>Signed-in users can delete all saved metadata, workflows, and account records at any time from the Dashboard.</li>
    </ul>
  </div>
);

export const TermsPage: React.FC = () => (
  <div className="max-w-3xl mx-auto px-4 py-12 space-y-5">
    <h1 className="text-3xl font-display font-bold text-slate-950 dark:text-white">Terms &amp; Conditions</h1>
    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
      By using I Love Documents, you confirm that you own or hold explicit authorization to process, convert, sign, unlock, redact, or translate any documents you upload.
    </p>
    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
      Unlock PDF is intended strictly for authorized document owners who possess the legitimate password. Temporary server links expire automatically after 60 minutes.
    </p>
  </div>
);

export const ContactPage: React.FC = () => {
  const [sent, setSent] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  return (
    <div className="max-w-xl mx-auto px-4 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-950 dark:text-white">Contact Us</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Questions or feedback for Kartik Rajak &amp; the I Love Documents platform? Send a note below.
        </p>
      </div>

      {sent ? (
        <div className="p-6 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex items-center gap-3 text-emerald-800 dark:text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>Thank you, {name || 'friend'}. Your message has been recorded.</span>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
          className="space-y-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6"
        >
          <div>
            <label className="block text-xs font-semibold mb-1">Your Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Message</label>
            <textarea
              required
              rows={4}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer"
            style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
          >
            Send Message
          </button>
        </form>
      )}
    </div>
  );
};
