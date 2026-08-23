import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { Logo } from './Logo';

export function VerifyEmailRoute() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        setStatus('error');
        setErrorMessage('No verification token provided.');
        return;
      }

      try {
        // Find user by verification token
        const { data: profiles, error: fetchError } = await supabase
          .from('profiles')
          .select('id')
          .eq('verification_token', token)
          .single();

        if (fetchError || !profiles) {
          setStatus('error');
          setErrorMessage('Invalid or expired verification link.');
          return;
        }

        // Update profile to mark as verified
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            is_email_verified: true,
            verification_token: null // invalidate token
          })
          .eq('id', profiles.id);

        if (updateError) {
          setStatus('error');
          setErrorMessage('Failed to verify email. Please try again.');
          return;
        }

        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || 'An unexpected error occurred.');
      }
    }

    verifyToken();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8 text-center border border-gray-100 dark:border-zinc-800">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
            <Loader2 className="w-16 h-16 text-amber-500 animate-spin mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Verifying Email</h2>
            <p className="text-gray-500 dark:text-gray-400">Please wait while we securely verify your link...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in slide-in-from-bottom-4 duration-500">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Email Verified!</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8">
              Thank you for verifying your email address. Your account is now fully secure.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-all hover:-translate-y-0.5"
            >
              Go to Dashboard
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in slide-in-from-bottom-4 duration-500">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-6">
              <XCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Verification Failed</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8">
              {errorMessage}
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-900 dark:text-white rounded-xl font-bold transition-all hover:-translate-y-0.5"
            >
              Return to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
