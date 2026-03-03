import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { toast } from "sonner";
import { ShieldCheck, Loader2, Lock, Hexagon, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, isAdmin } = useAdmin();
  const navigate = useNavigate();

  // If already admin, redirect
  if (isAdmin) {
    navigate("/admin", { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsSubmitting(true);
    try {
      await login(password);
      toast.success("Welcome back, Admin");
      navigate("/admin", { replace: true });
    } catch {
      toast.error("Authentication Failed", {
        description: "Invalid admin password.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <Card className="w-full max-w-md border-border/40 shadow-2xl shadow-primary/5">
        <CardContent className="p-8 space-y-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Hexagon className="h-12 w-12 text-primary fill-primary/10" />
              <Activity className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-black tracking-tight">
                Admin Access
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your admin password to manage the platform.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                Admin Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  className="pl-10 h-12 bg-secondary/30 text-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 font-bold text-base gap-2"
              disabled={isSubmitting || !password.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Sign In
                </>
              )}
            </Button>
          </form>

          <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">
            Restricted Access - Authorized Personnel Only
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
