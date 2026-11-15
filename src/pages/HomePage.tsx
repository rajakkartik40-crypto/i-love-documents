import React, { useMemo, useState } from 'react';
import {
  Camera,
  FileUp,
  Search,
  Star,
  UserSquare2,
  X,
} from 'lucide-react';
import { ALL_TOOLS, TOOL_CATEGORIES } from '../data/tools';
import { ToolCategory, ToolDefinition } from '../types';
import { BrandLogo } from '../components/BrandLogo';
import { ToolIcon } from '../components/ToolIcon';
import { useAuth } from '../context/AuthContext';
import { extractPdfTextPages } from '../lib/pdfEngine';

interface HomePageProps {
  initialCategory?: ToolCategory;
  pageTitle?: string;
  pageSubtitle?: string;
  onSelectTool: (tool: ToolDefinition, preloadedFiles?: File[]) => void;
  onNavigate: (path: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  initialCategory = 'all',
  pageTitle,
  pageSubtitle,
  onSelectTool,
  onNavigate,
}) => {
  const [category, setCategory] = useState<ToolCategory>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { profile, toggleFavoriteTool, addSessionDoc } = useAuth();

  const handleFilesAdded = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList);
    setDroppedFiles((prev) => [...prev, ...arr]);

    // Also register text-readable files for AI Document Assistant if user opens it
    for (const f of arr.slice(0, 3)) {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        try {
          const pages = await extractPdfTextPages(await f.arrayBuffer());
          const extractedText = pages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join('\n\n');
          addSessionDoc({
            id: `doc_${f.name}_${f.size}`,
            name: f.name,
            mimeType: 'application/pdf',
            sizeBytes: f.size,
            extractedText: extractedText || `(Scanned PDF: ${f.name})`,
            file: f,
          });
        } catch {
          // ignore encrypted/corrupted preview parse
        }
      }
    }
  };

  const recommendedTools = useMemo(() => {
    if (droppedFiles.length === 0) return [];
    const first = droppedFiles[0].name.toLowerCase();
    if (first.endsWith('.pdf')) {
      return ALL_TOOLS.filter((t) =>
        ['merge-pdf', 'compress-pdf', 'split-pdf', 'pdf-to-word', 'edit-pdf'].includes(t.slug)
      );
    }
    if (/\.(jpg|jpeg|png|webp)$/.test(first)) {
      return ALL_TOOLS.filter((t) =>
        ['passport-photo-maker', 'image-to-pdf', 'image-resizer', 'image-enhancer', 'background-remover'].includes(
          t.slug
        )
      );
    }
    if (/\.(docx|doc)$/.test(first)) {
      return ALL_TOOLS.filter((t) => t.slug === 'word-to-pdf');
    }
    if (/\.(xlsx|xls|csv)$/.test(first)) {
      return ALL_TOOLS.filter((t) => t.slug === 'excel-to-pdf');
    }
    if (/\.(pptx|ppt)$/.test(first)) {
      return ALL_TOOLS.filter((t) => t.slug === 'powerpoint-to-pdf');
    }
    return ALL_TOOLS.slice(0, 5);
  }, [droppedFiles]);

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_TOOLS.filter((tool) => {
      if (category !== 'all') {
        if (category === 'image' && tool.group !== 'image') return false;
        else if (category === 'scanner' && tool.group !== 'scanner') return false;
        else if (category !== 'image' && category !== 'scanner' && tool.category !== category) return false;
      }
      if (!q) return true;
      return (
        tool.name.toLowerCase().includes(q) ||
        tool.shortDesc.toLowerCase().includes(q) ||
        tool.slug.includes(q)
      );
    });
  }, [category, searchQuery]);

  const openTool = (tool: ToolDefinition) => {
    if (tool.dedicatedRoute) {
      onNavigate(tool.dedicatedRoute);
      return;
    }
    onSelectTool(tool, droppedFiles.length > 0 ? droppedFiles : undefined);
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200/70 dark:border-slate-800/70 bg-gradient-to-b from-slate-50/90 via-white to-white dark:from-slate-900/60 dark:via-slate-950 dark:to-slate-950">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-10">
          <div className="max-w-4xl mx-auto text-center space-y-4">
            {/* Big, Unmistakable Website Title + Creator Name */}
            <div className="space-y-1.5">
              <div className="flex justify-center">
                <BrandLogo size="xl" />
              </div>
              <p className="text-sm sm:text-base font-medium text-slate-600 dark:text-slate-300">
                Created by <span className="font-bold text-slate-950 dark:text-white">Kartik Rajak</span>
              </p>
            </div>

            <h1 className="text-3xl sm:text-5xl font-display font-extrabold tracking-tight text-slate-950 dark:text-white text-balance pt-2">
              {pageTitle || 'Everything You Need for Your Documents.'}
            </h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
              {pageSubtitle ||
                'Convert, edit, enhance, organize and manage your documents with powerful tools in one place.'}
            </p>

            {/* Quick Spotlight Actions: Passport Photo + Scanner */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('/passport-photo')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
              >
                <UserSquare2 className="w-4 h-4" />
                <span>Create Passport Photo</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/scanner')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Scan Document</span>
              </button>
            </div>

            {/* Search Bar + Drag & Drop Upload Box */}
            <div className="pt-4 max-w-3xl mx-auto space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search any document tool..."
                  className="w-full pl-11 pr-4 py-3 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white shadow-xs"
                />
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFilesAdded(e.dataTransfer.files);
                }}
                className={`rounded-xl border-2 border-dashed p-5 transition-colors ${
                  isDragging
                    ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20'
                    : 'border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <FileUp className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Drag and drop files here, or browse multiple files
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Supports PDF, JPG, JPEG, PNG, WEBP, DOCX, XLSX, PPTX
                      </p>
                    </div>
                  </div>

                  <label
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer shrink-0 hover:opacity-90"
                    style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
                  >
                    Browse Files
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,.xlsx,.xls,.csv,.pptx,.ppt,.html"
                      onChange={(e) => handleFilesAdded(e.target.files)}
                      className="hidden"
                    />
                  </label>
                </div>

                {droppedFiles.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-left space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Queued Files ({droppedFiles.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setDroppedFiles([])}
                        className="text-xs text-slate-500 hover:text-red-600 cursor-pointer"
                      >
                        Clear queue
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {droppedFiles.map((f, idx) => (
                        <div
                          key={`${f.name}_${idx}`}
                          className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200"
                        >
                          <span className="truncate max-w-[180px]">{f.name}</span>
                          <span className="font-mono text-slate-500 tabular-nums">
                            {(f.size / 1024).toFixed(0)} KB
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setDroppedFiles((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label="Remove file"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {recommendedTools.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs text-slate-500">Quick launch:</span>
                        {recommendedTools.map((t) => (
                          <button
                            key={t.slug}
                            type="button"
                            onClick={() => openTool(t)}
                            className="px-3 py-1 rounded-md text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 cursor-pointer"
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Clean Category Filter Row (like screenshot) */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {TOOL_CATEGORIES.map((cat) => {
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    active
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-slate-900 dark:border-white'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Neat & Simple 5-Column Tool Grid */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {filteredTools.length === 0 ? (
          <div className="text-center py-16 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              No tools matched "{searchQuery}"
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Try clearing your search or switching to All Tools.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategory('all');
              }}
              className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredTools.map((tool) => {
              const isFav = profile?.favoriteTools?.includes(tool.slug);
              return (
                <div
                  key={tool.slug}
                  onClick={() => openTool(tool)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openTool(tool);
                    }
                  }}
                  className="group relative flex flex-col justify-between p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 hover:shadow-md transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-slate-900"
                >
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <ToolIcon
                        iconName={tool.iconName}
                        bg={tool.iconBg}
                        color={tool.iconColor}
                      />
                      {profile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteTool(tool.slug);
                          }}
                          className={`p-1.5 rounded-md transition-opacity cursor-pointer ${
                            isFav
                              ? 'text-amber-500 opacity-100'
                              : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-500'
                          }`}
                          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                      )}
                    </div>

                    <h2 className="text-[17px] font-display font-bold text-slate-950 dark:text-white leading-snug mb-2">
                      {tool.name}
                    </h2>
                    <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {tool.shortDesc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
