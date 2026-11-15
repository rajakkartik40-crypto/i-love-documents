import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ActiveSessionDoc,
  FileRecord,
  HistoryEntry,
  SavedWorkflow,
  ThemeId,
  UserProfile,
} from '../types';
import { useTheme } from './ThemeContext';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  profile: UserProfile | null;
  files: FileRecord[];
  workflows: SavedWorkflow[];
  history: HistoryEntry[];
  sessionDocs: ActiveSessionDoc[];
  addSessionDoc: (docItem: ActiveSessionDoc) => void;
  removeSessionDoc: (id: string) => void;
  toggleFavoriteTool: (slug: string) => Promise<void>;
  saveThemeToProfile: (theme: {
    themeId: ThemeId;
    themeMode: 'light' | 'dark';
    customAccentColor?: string;
    customBgColor?: string;
  }) => Promise<void>;
  recordProcessedOutput: (params: {
    toolSlug: string;
    toolName: string;
    inputFileName: string;
    outputFileName: string;
    mimeType: string;
    blob: Blob;
    saveTempLink?: boolean;
  }) => Promise<{ downloadUrl?: string; expiresAt?: number }>;
  deleteFileRecord: (fileId: string) => Promise<void>;
  saveWorkflow: (name: string, description: string, steps: string[]) => Promise<void>;
  deleteWorkflow: (workflowId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOCAL_WORKFLOWS_KEY = 'ilovedocs_guest_workflows_v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_WORKFLOWS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sessionDocs, setSessionDocs] = useState<ActiveSessionDoc[]>([]);
  const { hydrateFromProfile } = useTheme();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) {
        setProfile(null);
        setFiles([]);
        setHistory([]);
        return;
      }

      if (!u.emailVerified) return;

      const userPath = `users/${u.uid}`;
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (!snap.exists()) {
          const initial: UserProfile = {
            uid: u.uid,
            displayName: (u.displayName || u.email?.split('@')[0] || 'User').slice(0, 120),
            email: u.email || '',
            themeId: 'default',
            themeMode: 'light',
            favoriteTools: ['merge-pdf', 'compress-pdf', 'passport-photo-maker'],
            storageUsedBytes: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(doc(db, 'users', u.uid), initial);
        } else {
          const data = snap.data() as UserProfile;
          hydrateFromProfile({
            themeId: data.themeId || 'default',
            mode: data.themeMode || 'light',
            customAccentColor: data.customAccentColor || '#dc2626',
            customBgColor: data.customBgColor || '#ffffff',
          });
        }
      } catch (err) {
        console.warn('Profile bootstrap warning:', err);
      }

      // Attach snapshots
      const unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        (d) => {
          if (d.exists()) {
            setProfile(d.data() as UserProfile);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, userPath)
      );

      const filesPath = `users/${u.uid}/files`;
      const unsubFiles = onSnapshot(
        query(collection(db, filesPath), where('ownerId', '==', u.uid), orderBy('createdAt', 'desc')),
        (snap) => {
          setFiles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FileRecord, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, filesPath)
      );

      const wfPath = `users/${u.uid}/workflows`;
      const unsubWf = onSnapshot(
        query(collection(db, wfPath), where('ownerId', '==', u.uid), orderBy('updatedAt', 'desc')),
        (snap) => {
          setWorkflows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedWorkflow, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, wfPath)
      );

      const histPath = `users/${u.uid}/history`;
      const unsubHist = onSnapshot(
        query(collection(db, histPath), where('ownerId', '==', u.uid), orderBy('createdAt', 'desc')),
        (snap) => {
          setHistory(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HistoryEntry, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, histPath)
      );

      return () => {
        unsubProfile();
        unsubFiles();
        unsubWf();
        unsubHist();
      };
    });

    return () => unsub();
  }, []);

  const addSessionDoc = (docItem: ActiveSessionDoc) => {
    setSessionDocs((prev) => [docItem, ...prev.filter((d) => d.id !== docItem.id)].slice(0, 12));
  };

  const removeSessionDoc = (id: string) => {
    setSessionDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const toggleFavoriteTool = async (slug: string) => {
    if (!user || !user.emailVerified || !profile) return;
    const current = profile.favoriteTools || [];
    const next = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug].slice(0, 32);
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        favoriteTools: next,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const saveThemeToProfile = async (theme: {
    themeId: ThemeId;
    themeMode: 'light' | 'dark';
    customAccentColor?: string;
    customBgColor?: string;
  }) => {
    if (!user || !user.emailVerified) return;
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        themeId: theme.themeId,
        themeMode: theme.themeMode,
        customAccentColor: (theme.customAccentColor || '#dc2626').slice(0, 20),
        customBgColor: (theme.customBgColor || '#ffffff').slice(0, 20),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const recordProcessedOutput = async (params: {
    toolSlug: string;
    toolName: string;
    inputFileName: string;
    outputFileName: string;
    mimeType: string;
    blob: Blob;
    saveTempLink?: boolean;
  }): Promise<{ downloadUrl?: string; expiresAt?: number }> => {
    let downloadUrl: string | undefined;
    let downloadToken: string | undefined;
    let expiresAt: number | undefined;
    const retentionMinutes = 60;

    if (params.saveTempLink !== false && params.blob.size <= 25 * 1024 * 1024) {
      try {
        const form = new FormData();
        form.append('file', params.blob, params.outputFileName);
        const res = await fetch('/api/files/temp', { method: 'POST', body: form });
        if (res.ok) {
          const data = await res.json();
          downloadUrl = data.downloadUrl;
          downloadToken = data.downloadToken;
          expiresAt = data.expiresAt;
        }
      } catch {
        // non-blocking temp link creation
      }
    }

    if (user && user.emailVerified) {
      const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const filePath = `users/${user.uid}/files/${id}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'files', id), {
          ownerId: user.uid,
          fileName: params.outputFileName.slice(0, 255),
          mimeType: (params.mimeType || 'application/octet-stream').slice(0, 128),
          sizeBytes: params.blob.size,
          toolUsed: params.toolSlug.slice(0, 64),
          retentionMinutes,
          ...(downloadToken ? { downloadToken: downloadToken.slice(0, 256) } : {}),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, filePath);
      }

      const histId = `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const histPath = `users/${user.uid}/history/${histId}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'history', histId), {
          ownerId: user.uid,
          toolSlug: params.toolSlug.slice(0, 64),
          toolName: params.toolName.slice(0, 80),
          inputFileName: params.inputFileName.slice(0, 255),
          outputFileName: params.outputFileName.slice(0, 255),
          outputSizeBytes: params.blob.size,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, histPath);
      }

      try {
        const nextBytes = Math.min(10737418240, (profile?.storageUsedBytes || 0) + params.blob.size);
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: profile?.displayName || user.displayName || 'User',
          storageUsedBytes: nextBytes,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // ignore quota update error
      }
    }

    return { downloadUrl, expiresAt };
  };

  const deleteFileRecord = async (fileId: string) => {
    if (!user || !user.emailVerified) return;
    const path = `users/${user.uid}/files/${fileId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'files', fileId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const saveWorkflow = async (name: string, description: string, steps: string[]) => {
    const cleanSteps = steps.slice(0, 10);
    if (!cleanSteps.length) return;
    if (user && user.emailVerified) {
      const id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const path = `users/${user.uid}/workflows/${id}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'workflows', id), {
          ownerId: user.uid,
          name: name.slice(0, 100),
          description: description.slice(0, 300),
          steps: cleanSteps,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    } else {
      const localWf: SavedWorkflow = {
        id: `local_${Date.now()}`,
        ownerId: 'guest',
        name: name.slice(0, 100),
        description: description.slice(0, 300),
        steps: cleanSteps,
      };
      const updated = [localWf, ...workflows].slice(0, 15);
      setWorkflows(updated);
      localStorage.setItem(LOCAL_WORKFLOWS_KEY, JSON.stringify(updated));
    }
  };

  const deleteWorkflow = async (workflowId: string) => {
    if (user && user.emailVerified && !workflowId.startsWith('local_')) {
      const path = `users/${user.uid}/workflows/${workflowId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'workflows', workflowId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    } else {
      const updated = workflows.filter((w) => w.id !== workflowId);
      setWorkflows(updated);
      localStorage.setItem(LOCAL_WORKFLOWS_KEY, JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        profile,
        files,
        workflows,
        history,
        sessionDocs,
        addSessionDoc,
        removeSessionDoc,
        toggleFavoriteTool,
        saveThemeToProfile,
        recordProcessedOutput,
        deleteFileRecord,
        saveWorkflow,
        deleteWorkflow,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
