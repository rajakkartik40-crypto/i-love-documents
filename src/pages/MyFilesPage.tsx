import React from 'react';
import { Clock, FileText, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const MyFilesPage: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const { user, files, sessionDocs, removeSessionDoc, deleteFileRecord } = useAuth();

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-950 dark:text-white">My Files</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Review your active session documents and cloud-saved processed file records.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
          <Clock className="w-4 h-4 text-emerald-600" />
          <span>Temporary server files auto-delete after 60 minutes</span>
        </div>
      </div>

      {/* In-Session Uploaded Files */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-950 dark:text-white">
          Current Session Documents ({sessionDocs.length})
        </h2>
        {sessionDocs.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-500">
            Files you upload on the Homepage or AI Assistant appear here for quick access during this session.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sessionDocs.map((d) => (
              <div
                key={d.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 truncate">
                  <FileText className="w-5 h-5 text-red-600 shrink-0" />
                  <div className="truncate">
                    <p className="text-sm font-semibold truncate">{d.name}</p>
                    <p className="text-xs font-mono text-slate-500 tabular-nums">
                      {(d.sizeBytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeSessionDoc(d.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                  aria-label="Remove document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cloud Processed File Metadata */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-950 dark:text-white">
          Saved Processed File History
        </h2>
        {!user ? (
          <div className="p-8 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Private File Metadata Sync
              </p>
              <p className="text-xs text-slate-500">
                Sign in with Google or Email to track your processed documents and manage deletions across sessions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/auth')}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer"
              style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
            >
              Sign In
            </button>
          </div>
        ) : files.length === 0 ? (
          <p className="text-sm text-slate-500">No processed documents recorded yet.</p>
        ) : (
          <div className="overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">Tool Used</th>
                  <th className="py-3 px-4 text-right">Size</th>
                  <th className="py-3 px-4">Retention</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {files.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-semibold">{f.fileName}</td>
                    <td className="py-3 px-4 text-slate-500">{f.toolUsed}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {(f.sizeBytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3 px-4 text-slate-500">{f.retentionMinutes} min auto-expiry</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => deleteFileRecord(f.id)}
                        className="text-red-600 hover:underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
