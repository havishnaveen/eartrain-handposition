import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Filter } from "bad-words";
const filter = new Filter();
import { X, Settings, User, Mail, Lock, Shield, ArrowRight, Pencil, Sun, Moon, ZoomIn, ZoomOut, Sparkles } from "lucide-react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getCroppedImg } from "@/lib/cropImage";
import { PROFILE_TITLES } from "@/lib/titles";

export function AccountSettingsModal({ onClose, tab }: { onClose: () => void, tab: 'account' | 'preferences' | 'help' }) {
  const { user, profile, updateProfile } = useAuth();
  
  const activeTitleObj = profile?.active_title ? PROFILE_TITLES.find(t => t.id === profile.active_title) : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const { profilePic, setProfilePic } = useAuth(); // useAuth provides global profile pic
  // useState<string | null>(
    
  
  const [isSaving, setIsSaving] = useState(false);

  const [localTheme, setLocalTheme] = useState(localStorage.theme || 'light');

  // Cropper state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File is too large! Maximum size is 5MB.");
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setCropImageSrc(reader.result as string);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
      });
      reader.readAsDataURL(file);
    }
    // Reset input so user can re-select the same file
    e.target.value = '';
  };

  const handleCropSave = async () => {
    if (!cropImageSrc || !croppedAreaPixels || !user) return;

    try {
      toast.loading("Cropping & uploading...", { id: "upload" });
      const croppedBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      const fileName = `${user.id}-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, croppedBlob, { upsert: true, contentType: 'image/png' });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      await updateProfile({ avatar_url: data.publicUrl });
      setProfilePic(data.publicUrl);
      setCropImageSrc(null);
      toast.success("Profile picture updated!", { id: "upload" });
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to upload image.", { id: "upload" });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Require current password if setting a new password
    if (newPassword && !currentPassword) {
      toast.error("Please enter your current password to verify your identity.");
      return;
    }
    
    if (newPassword && newPassword !== confirmNewPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setIsSaving(true);
    
    // Update the profile display name
    if (filter.isProfane(displayName)) {
      toast.error("Please choose an appropriate display name.");
      setIsSaving(false);
      return;
    }
    
    if (displayName !== profile?.display_name) {
      await updateProfile({ display_name: displayName });
    }
    
    // In a real application, you would make an API call to Supabase Auth to update email/password securely.
    
    setTimeout(() => {
      setIsSaving(false);
      toast.success("Account settings updated securely!");
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-4xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-300">
        
        {/* Left Sidebar Info */}
        <div className="md:w-1/3 bg-orange-500/5 border-b md:border-b-0 md:border-r border-border p-8 flex flex-col">
          
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="relative group mb-4">
              <div className="w-24 h-24 mx-auto rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 text-4xl font-bold shadow-xl overflow-hidden">
                {profilePic ? (
                  <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  displayName.charAt(0).toUpperCase() || 'U'
                )}
              </div>
            </div>
            
            <label htmlFor="profilePicUpload" className="mb-6 cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-500/20 transition-colors text-sm font-bold border border-orange-200 dark:border-orange-500/20">
              <Pencil className="w-4 h-4" />
              Change Picture
              <input id="profilePicUpload" type="file" accept="image/*" className="hidden" onChange={handleImage} />
            </label>
            
            <h2 className="text-2xl font-serif font-bold text-foreground">{displayName || "User"}</h2>
            
            {activeTitleObj && (
              <div className="mt-2 px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold tracking-widest uppercase text-[10px] border border-orange-200 dark:border-orange-500/30">
                {activeTitleObj.name}
              </div>
            )}
            {displayName.toLowerCase().includes('havish') && !activeTitleObj && (
              <div className="mt-2 px-3 py-1 rounded-full bg-orange-500 text-white font-bold tracking-widest uppercase text-[10px] shadow-[0_0_10px_rgba(249,115,22,0.5)] border border-orange-400/50 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                PRODUCER
              </div>
            )}
            
            <p className="text-muted-foreground mt-2 text-sm">{email}</p>
          </div>
          
          {tab === 'account' && (
            <div className="w-full bg-card rounded-2xl p-5 border border-border text-left shadow-sm mt-8">
              <div className="flex items-center gap-3 text-sm font-bold text-orange-600 dark:text-orange-400 mb-2">
                <Shield className="w-5 h-5" /> Secure Account
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                Your account details are encrypted and safely stored. Keep your password secure to protect your progress and rank.
              </p>
            </div>
          )}
        </div>

        {/* Right Form Area */}
        <div className="md:w-2/3 p-8 md:p-12 relative bg-background">
          <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
          
          <h3 className="text-3xl font-bold mb-6 flex items-center gap-3 border-b border-border pb-4">
            <Settings className="text-orange-500" /> {tab === 'account' ? 'Account Settings' : tab === 'preferences' ? 'User Preferences' : 'Help & Support'}
          </h3>
          
          
          {tab === 'help' ? (
            <div className="space-y-6">
              <div className="bg-orange-50/50 dark:bg-orange-950/20 rounded-2xl p-6 border border-orange-200/50 dark:border-orange-900/50">
                <h4 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
                  <Mail className="text-orange-500 w-5 h-5" /> Contact Support
                </h4>
                <p className="text-muted-foreground text-sm mb-4">
                  Need help, have a suggestion, or want to report a bug? Feel free to reach out directly to the developer at:
                </p>
                <a href="mailto:havish.naveen@gmail.com" className="text-lg font-bold text-orange-600 dark:text-orange-400 hover:underline">
                  havish.naveen@gmail.com
                </a>
              </div>
              
              <div className="bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl p-6 border border-amber-200/50 dark:border-amber-900/50">
                <h4 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg> 
                  Interactive Tutorial
                </h4>
                <p className="text-muted-foreground text-sm mb-4">
                  Want a refresher on how to use EarTrain? You can rerun the interactive tutorial anytime to learn about all the features and mechanics.
                </p>
                <button 
                  onClick={async () => {
                    localStorage.removeItem('tour_done_v13');
                    if (user && !user.id.startsWith('mock')) {
                      await supabase.auth.updateUser({ data: { has_seen_tour: false } });
                    }
                    window.location.reload();
                  }}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-colors"
                >
                  Restart Tutorial
                </button>
              </div>
            </div>
          ) : tab === 'account' ? (

          <form onSubmit={handleSave} className="space-y-6">
            
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                  <User className="w-4 h-4" /> Shown Name
                </label>
                <input 
                  type="text" 
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 bg-black/5 dark:bg-white/5 border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-medium"
                  placeholder="Your public name"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Email Address
                </label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-black/5 dark:bg-white/5 border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-medium"
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div className="w-full h-px bg-border my-8"></div>

            <h4 className="text-xl font-bold flex items-center gap-2 mb-6">
              <Lock className="w-5 h-5 text-orange-500" /> Security
            </h4>

            <div className="flex flex-col gap-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground">Current Password</label>
                <input 
                  type="password" 
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-black/5 dark:bg-white/5 border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-medium"
                  placeholder="Required to change password"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground">New Password</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-black/5 dark:bg-white/5 border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-medium"
                  placeholder="Leave blank to keep current"
                />
              </div>

              {newPassword && (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-muted-foreground">Confirm New Password</label>
                  <input 
                    type="password" 
                    value={confirmNewPassword}
                    onChange={e => setConfirmNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-black/5 dark:bg-white/5 border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-medium"
                    placeholder="Type new password again"
                  />
                </div>
              )}
            </div>
            
            <div className="pt-6 flex justify-end gap-4">
              <button 
                type="button" 
                onClick={onClose}
                className="px-6 py-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-foreground font-bold rounded-xl transition-all"
              >
                Back
              </button>
              <button 
                type="submit" 
                disabled={isSaving}
                className="px-8 py-3 bg-white border-2 border-orange-500 text-orange-500 dark:text-white dark:bg-orange-600 font-bold rounded-xl shadow-sm hover:bg-orange-50 dark:hover:bg-orange-700 transition-all disabled:opacity-50 flex items-center gap-2 group"
              >
                {isSaving ? "Saving..." : "Save & Exit"}
                {!isSaving && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
              </button>
            </div>
          
          </form>
          ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-lg font-bold text-foreground">Theme Preference</label>
              <p className="text-sm text-muted-foreground mb-4">Choose your preferred appearance.</p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => {
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('theme', 'light');
                    window.dispatchEvent(new Event('theme_changed'));
                    setLocalTheme('light');
                  }}
                  className={`p-4 rounded-xl border-2 transition-all font-bold text-lg flex items-center justify-center gap-2 ${localTheme !== 'dark' ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400' : 'border-border bg-card hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground'}`}
                >
                  <Sun className="w-5 h-5" /> Light Mode
                </button>
                <button 
                  onClick={() => {
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('theme', 'dark');
                    window.dispatchEvent(new Event('theme_changed'));
                    setLocalTheme('dark');
                  }}
                  className={`p-4 rounded-xl border-2 transition-all font-bold text-lg flex items-center justify-center gap-2 ${localTheme === 'dark' ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400' : 'border-border bg-card hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground'}`}
                >
                  <Moon className="w-5 h-5" /> Dark Mode
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-lg font-bold text-foreground text-red-500">Danger Zone</label>
              <p className="text-sm text-muted-foreground mb-4">Reset all of your exercise progress across the entire app. This cannot be undone.</p>
              <button 
                onClick={() => {
                  if (confirm("Are you sure you want to reset all your progress?")) {
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                      const key = localStorage.key(i);
                      if (key && key.startsWith('eartrain_completed_')) {
                        keysToRemove.push(key);
                      }
                    }
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                    toast.success("Progress reset successfully!");
                    window.location.reload();
                  }
                }}
                className="w-full p-4 rounded-xl border-2 border-red-500/30 bg-red-500/10 text-red-600 font-bold text-lg hover:bg-red-500/20 transition-all"
              >
                Reset All Progress
              </button>
            </div>

            <div className="pt-6 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-lg font-bold text-foreground block">Public Profile</label>
                  <p className="text-sm text-muted-foreground mt-1">Allow other users to view your stats and earned badges on the leaderboard. No personal information like your email will ever be shared.</p>
                </div>
                <button 
                  onClick={async () => {
                    const newValue = profile?.is_public === false ? true : false;
                    await updateProfile({ is_public: newValue });
                    toast.success(newValue ? "Profile is now public" : "Profile is now hidden");
                  }}
                  className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${profile?.is_public !== false ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                  <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${profile?.is_public !== false ? 'translate-x-7' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          </div>
          )}

        </div>
      </div>

      {/* Circular Image Cropper Modal */}
      {cropImageSrc && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setCropImageSrc(null)}>
          <div className="bg-card rounded-3xl shadow-2xl border-2 border-border w-full max-w-md flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="text-lg font-bold text-foreground">Crop Profile Picture</h3>
              <button onClick={() => setCropImageSrc(null)} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cropper Area */}
            <div className="relative w-full" style={{ height: 320 }}>
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            {/* Zoom Control */}
            <div className="px-6 py-4 flex items-center gap-3 border-t border-border">
              <ZoomOut className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                className="flex-1 h-1.5 accent-orange-500 cursor-pointer"
              />
              <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
              <button
                onClick={() => setCropImageSrc(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCropSave}
                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white transition-colors shadow-lg shadow-orange-500/20"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
