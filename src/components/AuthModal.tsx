/// <reference types="vite/client" />
import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { toast } from "sonner"
import { UserCircle } from "lucide-react"
import { useAuth } from "@/lib/useAuth"

export function AuthModal({ customTrigger }: { customTrigger?: React.ReactNode }) {
  const { mockSignIn, mockSignUp } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [username, setUsername] = useState("")

  const IS_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co';

  const handleAuth = async (action: 'signin' | 'signup') => {

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }


    if (action === 'signup') {
      if (!username) {
        toast.error("Please enter a username");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        toast.error("Password must be at least 8 characters long");
        return;
      }
      if (!/[A-Z]/.test(password)) {
        toast.error("Password must contain at least one uppercase letter");
        return;
      }
      if (!/[a-z]/.test(password)) {
        toast.error("Password must contain at least one lowercase letter");
        return;
      }
      if (!/[0-9]/.test(password)) {
        toast.error("Password must contain at least one number");
        return;
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        toast.error("Password must contain at least one special character");
        return;
      }
    }

    setIsLoading(true)
    try {
      if (IS_MOCK) {
        if (action === 'signup') {
          mockSignUp(email, username);
          toast.success("Successfully signed up (Local Sandbox)!");
        } else {
          mockSignIn(email);
          toast.success("Successfully signed in (Local Sandbox)!");
        }
        setIsOpen(false);
        return;
      }
      if (action === 'signup') {
        if (!IS_MOCK) {
          const { data: existingUser } = await supabase.from('profiles').select('id').ilike('display_name', username).maybeSingle();
          if (existingUser) {
            toast.error("That username is taken!");
            setIsLoading(false);
            return;
          }
        }
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: username
            }
          }
        })
        if ((signUpData && !signUpData.user) || (signUpData?.user && signUpData.user.identities && signUpData.user.identities.length === 0)) {
          throw new Error("That email is already in use, if it is you, sign in!");
        }
        if (error) {
          if (error.message.toLowerCase().includes("already registered") || error.message.toLowerCase().includes("already exists")) {
            throw new Error("That user already exists, sign in!");
          }
          throw error;
        }
        toast.success("Successfully signed up!")
        setIsOpen(false)
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        toast.success("Successfully signed in!")
        setIsOpen(false)
      }
    } catch (error: any) {
      toast.error(error.message || "Authentication failed")
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Please enter your email address first.");
      return;
    }
    try {
      setIsLoading(true);
      if (IS_MOCK) {
        toast.success("Password reset is not available in sandbox mode.");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      toast.success("Password reset email sent! Check your inbox.");
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset email.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {customTrigger || (
          <Button variant="outline" className="gap-2 rounded-full px-5">
            <UserCircle className="w-5 h-5 text-muted-foreground" />
            Sign In
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] p-0 border-border bg-card overflow-hidden">
        <div className="p-8 pb-4 bg-gradient-to-br from-brandPurple/10 to-transparent">
          <DialogHeader>
            <DialogTitle className="text-3xl mb-1">Welcome</DialogTitle>
            <DialogDescription>
              Sign in to track your progress and earn achievements.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="p-8 pt-2">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="w-full grid grid-cols-2 mb-8">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="m@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button className="w-full mt-4 bg-orange-500 hover:bg-orange-600 text-white shadow-md dark:bg-orange-600 dark:hover:bg-orange-700" disabled={isLoading} onClick={() => handleAuth('signin')}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="w-full text-center text-sm text-muted-foreground hover:text-orange-500 transition-colors cursor-pointer mt-2 font-medium"
              >
                Forgot your password?
              </button>
            </TabsContent>
            <TabsContent value="signup" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" type="text" placeholder="Beethoven" value={username} onChange={e => setUsername(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="m@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input id="signup-password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              <Button className="w-full mt-4 bg-orange-500 hover:bg-orange-600 text-white shadow-md dark:bg-orange-600 dark:hover:bg-orange-700" disabled={isLoading} onClick={() => handleAuth('signup')}>
                {isLoading ? "Signing up..." : "Sign Up"}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
