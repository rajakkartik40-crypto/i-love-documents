import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { AiAssistantWidget } from './components/AiAssistantWidget';
import { HomePage } from './pages/HomePage';
import { getToolBySlug } from './data/tools';
import { ToolDefinition } from './types';

const ToolWorkspacePage = lazy(() =>
  import('./pages/ToolWorkspacePage').then((m) => ({ default: m.ToolWorkspacePage }))
);
const PassportPhotoPage = lazy(() =>
  import('./pages/PassportPhotoPage').then((m) => ({ default: m.PassportPhotoPage }))
);
const ScannerPage = lazy(() =>
  import('./pages/ScannerPage').then((m) => ({ default: m.ScannerPage }))
);
const ThemesPage = lazy(() =>
  import('./pages/ThemesPage').then((m) => ({ default: m.ThemesPage }))
);
const AuthPage = lazy(() =>
  import('./pages/AuthPage').then((m) => ({ default: m.AuthPage }))
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const MyFilesPage = lazy(() =>
  import('./pages/MyFilesPage').then((m) => ({ default: m.MyFilesPage }))
);
const AboutPage = lazy(() =>
  import('./pages/StaticPages').then((m) => ({ default: m.AboutPage }))
);
const PrivacyPage = lazy(() =>
  import('./pages/StaticPages').then((m) => ({ default: m.PrivacyPage }))
);
const TermsPage = lazy(() =>
  import('./pages/StaticPages').then((m) => ({ default: m.TermsPage }))
);
const ContactPage = lazy(() =>
  import('./pages/StaticPages').then((m) => ({ default: m.ContactPage }))
);

function AppRouter() {
  const [path, setPath] = useState<string>(() => window.location.pathname || '/');
  const [preloadedFiles, setPreloadedFiles] = useState<File[]>([]);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (nextPath: string) => {
    if (nextPath !== path) {
      window.history.pushState({}, '', nextPath);
      setPath(nextPath);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectTool = (tool: ToolDefinition, files?: File[]) => {
    setPreloadedFiles(files || []);
    if (tool.dedicatedRoute) {
      navigate(tool.dedicatedRoute);
    } else {
      navigate(`/tool/${tool.slug}`);
    }
  };

  const renderRoute = () => {
    if (path === '/' || path === '/tools') {
      return (
        <HomePage
          key={path}
          initialCategory="all"
          onSelectTool={handleSelectTool}
          onNavigate={navigate}
        />
      );
    }
    if (path === '/pdf-tools') {
      return (
        <HomePage
          key="pdf-tools"
          initialCategory="organize"
          pageTitle="Complete PDF Utilities"
          pageSubtitle="Merge, split, compress, convert Office documents, edit, sign, OCR, redact, and automate PDFs."
          onSelectTool={handleSelectTool}
          onNavigate={navigate}
        />
      );
    }
    if (path === '/image-tools') {
      return (
        <HomePage
          key="image-tools"
          initialCategory="image"
          pageTitle="Advanced Image & Photo Tools"
          pageSubtitle="Passport Size Photo Maker, Image to PDF, Resizer, Enhancer, Background Remover, Collage & ID Card layouts."
          onSelectTool={handleSelectTool}
          onNavigate={navigate}
        />
      );
    }
    if (path === '/ai-tools') {
      return (
        <HomePage
          key="ai-tools"
          initialCategory="intelligence"
          pageTitle="AI Document Intelligence"
          pageSubtitle="Summarize lengthy PDFs, translate pages preserving structure, and run OCR on scanned documents."
          onSelectTool={handleSelectTool}
          onNavigate={navigate}
        />
      );
    }
    if (path === '/passport-photo') {
      return <PassportPhotoPage onBack={() => navigate('/')} />;
    }
    if (path === '/scanner') {
      return <ScannerPage onBack={() => navigate('/')} />;
    }
    if (path === '/themes') {
      return <ThemesPage />;
    }
    if (path === '/auth') {
      return <AuthPage onSuccess={() => navigate('/dashboard')} />;
    }
    if (path === '/dashboard') {
      return <DashboardPage onSelectTool={handleSelectTool} onNavigate={navigate} />;
    }
    if (path === '/my-files') {
      return <MyFilesPage onNavigate={navigate} />;
    }
    if (path === '/about') {
      return <AboutPage />;
    }
    if (path === '/privacy') {
      return <PrivacyPage />;
    }
    if (path === '/terms') {
      return <TermsPage />;
    }
    if (path === '/contact') {
      return <ContactPage />;
    }
    if (path.startsWith('/tool/')) {
      const slug = path.replace('/tool/', '').trim();
      const tool = getToolBySlug(slug);
      if (tool) {
        return (
          <ToolWorkspacePage
            key={tool.slug}
            tool={tool}
            initialFiles={preloadedFiles}
            onBack={() => navigate('/')}
          />
        );
      }
    }

    return (
      <HomePage
        initialCategory="all"
        onSelectTool={handleSelectTool}
        onNavigate={navigate}
      />
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar currentPath={path} onNavigate={navigate} />
      <div className="flex-1">
        <Suspense
          fallback={
            <div className="py-24 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading workspace...</span>
            </div>
          }
        >
          {renderRoute()}
        </Suspense>
      </div>
      <Footer onNavigate={navigate} />
      <AiAssistantWidget />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
