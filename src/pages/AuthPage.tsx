import React, { useState } from 'react';
import { Lock, Mail, User as UserIcon } from 'lucide-react';
import {
  resetPassword,
  signInEmail,
  signInWithGoogle,
  signUpEmail,
} from '../lib/firebase';
import { BrandLogo } from '../components/BrandLogo';

export const AuthPage: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleGoogle = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await signInWithGoogle();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const cred = await signInEmail(email, password);
        if (!cred.user.emailVerified) {
          setMessage('Please verify your email address via the verification link sent to your inbox before accessing cloud storage.');
        } else {
          onSuccess();
        }
      } else if (mode === 'signup') {
        await signUpEmail(email, password, displayName || email.split('@')[0]);
        setMessage('Account created! Please check your inbox and verify your email address before signing in.');
        setMode('login');
      } else {
        await resetPassword(email);
        setMessage('Password reset email sent. Please check your inbox.');
        setMode('login');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      if (msg.includes('operation-not-allowed')) {
        setError(
          'Email/Password sign-in is not yet enabled in the Firebase Console for this project. Use Google Sign-In below or enable Email/Password under Authentication > Sign-in method.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[78vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-7 space-y-6 shadow-sm">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <BrandLogo size="sm" />
          </div>
          <h1 className="text-xl font-display font-bold text-slate-950 dark:text-white">
            {mode === 'login' ? 'Sign in to your account' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </h1>
          <p className="text-xs text-slate-500">
            Save favorite tools, multi-step workflows, theme preferences, and processing history.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Continue with Google</span>
        </button>

        <div className="relative text-center text-xs text-slate-400">
          <span className="bg-white dark:bg-slate-900 px-3 relative z-10">or with email</span>
          <div className="border-t border-slate-200 dark:border-slate-800 absolute inset-x-0 top-1/2" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold mb-1">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Kartik Rajak"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <label className="block text-xs font-semibold mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-2.5 rounded-lg">
              {error}
            </div>
          )}
          {message && (
            <div className="text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-2.5 rounded-lg">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-bold text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-primary, #dc2626)' }}
          >
            {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
          {mode !== 'login' ? (
            <button type="button" onClick={() => setMode('login')} className="hover:underline cursor-pointer">
              Back to Sign In
            </button>
          ) : (
            <button type="button" onClick={() => setMode('signup')} className="hover:underline cursor-pointer">
              Create an account
            </button>
          )}
          {mode === 'login' && (
            <button type="button" onClick={() => setMode('forgot')} className="hover:underline cursor-pointer">
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
