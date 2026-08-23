import { AlertCircle, Mail, X } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useState } from "react";

export function EmailVerificationBanner() {
  const { user, profile } = useAuth();
  const [isVisible, setIsVisible] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // If user is verified, or it's a mock user (they don't need verification), or dismissed
  if (!user || user.id.startsWith('mock') || !isVisible || profile?.is_email_verified) {
    return null;
  }

  const dismiss = () => {
    setIsVisible(false);
  };

  const handleResend = async () => {
    if (!user.email) return;
    setIsSending(true);

    if (user.id.startsWith('mock')) {
      setTimeout(() => {
        setIsSending(false);
        toast.success("Verification email sent! Please check your inbox (and spam folder).");
        dismiss();
      }, 800);
      return;
    }

    try {
      const token = crypto.randomUUID();
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ verification_token: token })
        .eq('id', user.id);
        
      if (updateError) throw updateError;

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, token })
      });

      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const textError = await res.text();
        throw new Error(`Server returned a non-JSON response: ${textError.substring(0, 50)}...`);
      }

      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Failed to send email');

      toast.success("Verification email sent! Please check your inbox (and spam folder).");
    } catch (error: any) {
      toast.error(error.message || "Failed to send email.");
      console.error("Custom verification error:", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-400 relative">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-sm font-medium pr-10">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>Please verify your email address to fully secure your account.</span>
        </div>
        <button 
          onClick={handleResend}
          disabled={isSending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30 rounded-full font-bold transition-colors disabled:opacity-50 text-xs sm:text-sm whitespace-nowrap"
        >
          <Mail className="w-3.5 h-3.5" />
          {isSending ? "Sending..." : "Resend Email"}
        </button>
      </div>
      <button 
        onClick={dismiss}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-amber-500/10 rounded-full transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
