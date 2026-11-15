import React, { useState } from 'react';
import {
  Clock,
  FileText,
  HardDrive,
  LogOut,
  Star,
  Trash2,
  Workflow,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ALL_TOOLS } from '../data/tools';
import { deleteAccountAndData, logoutUser } from '../lib/firebase';
import { ToolDefinition } from '../types';

interface DashboardPageProps {
  onSelectTool: (tool: ToolDefinition) => void;
  onNavigate: (path: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onSelectTool, onNavigate }) => {
  const { user, profile, files, workflows, history, deleteFileRecord, deleteWorkflow } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-display font-bold">Sign in to view your Dashboard</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Access recent documents, favourite tools, saved workflows, storage usage, and download history.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/auth')}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer"
          style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
        >
          Login / Sign Up
        </button>
      </div>
    );
  }

  const favTools = ALL_TOOLS.filter((t) => profile?.favoriteTools?.includes(t.slug));
  const usedMb = ((profile?.storageUsedBytes || 0) / (1024 * 1024)).toFixed(2);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccountAndData();
      onNavigate('/');
    } catch (err) {
      console.error(err);
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 dark:text-white">
            Welcome, {profile?.displayName || user.displayName || user.email}
          </h1>
          <p className="text-sm text-slate-500">
            {user.email} · Manage your documents, workflows, and account preferences.
          </p>
        </div>

        <button
          type="button"
          onClick={async () => {
            await logoutUser();
            onNavigate('/');
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Processed Files</span>
            <FileText className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{files.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Favourite Tools</span>
            <Star className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{favTools.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Saved Workflows</span>
            <Workflow className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{workflows.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Cumulative Processed</span>
            <HardDrive className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{usedMb} MB</p>
        </div>
      </div>

      {/* Favourite Tools */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-950 dark:text-white">Favourite Tools</h2>
        {favTools.length === 0 ? (
          <p className="text-sm text-slate-500">Star any tool card on the homepage to pin it here.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {favTools.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => (t.dedicatedRoute ? onNavigate(t.dedicatedRoute) : onSelectTool(t))}
                className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold hover:border-slate-400 cursor-pointer"
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Saved Workflows */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-950 dark:text-white">Saved Workflows</h2>
        {workflows.length === 0 ? (
          <p className="text-sm text-slate-500">
            No saved workflows yet. Use Create Workflow to chain PDF operations.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-start justify-between gap-3"
              >
                <div>
                  <h3 className="font-bold text-sm">{wf.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">{wf.steps.join(' → ')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteWorkflow(wf.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                  aria-label="Delete workflow"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Files & Download History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="text-base font-bold">Recent Documents</h2>
          {files.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No processed files recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {files.slice(0, 8).map((f) => (
                <div key={f.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="truncate">
                    <p className="font-semibold truncate">{f.fileName}</p>
                    <p className="text-slate-500">
                      {f.toolUsed} · {(f.sizeBytes / 1024).toFixed(1)} KB · {f.retentionMinutes}m retention
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteFileRecord(f.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Clock className="w-4 h-4" /> Download &amp; Processing History
          </h2>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No tool runs recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {history.slice(0, 8).map((h) => (
                <div key={h.id} className="py-2.5 text-xs flex items-center justify-between gap-2">
                  <div className="truncate">
                    <p className="font-semibold">{h.toolName}</p>
                    <p className="text-slate-500 truncate">
                      {h.inputFileName} → {h.outputFileName}
                    </p>
                  </div>
                  <span className="font-mono text-slate-500 tabular-nums shrink-0">
                    {(h.outputSizeBytes / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Account Data Deletion */}
      <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-red-700 dark:text-red-400">Delete Account &amp; Data</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Permanently remove your profile, file metadata, saved workflows, and processing history.
          </p>
        </div>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 rounded-lg text-xs font-semibold border border-red-300 text-red-700 dark:text-red-400 cursor-pointer"
          >
            Delete My Data
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={handleDeleteAccount}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white cursor-pointer"
            >
              {deleting ? 'Deleting...' : 'Confirm Permanent Deletion'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-2 rounded-lg text-xs border border-slate-300 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
