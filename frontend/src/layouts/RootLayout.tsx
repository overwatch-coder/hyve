import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Activity, Hexagon, X, AlertCircle, ShieldCheck } from "lucide-react";

export default function RootLayout() {
  const location = useLocation();
  const [showDisclaimer, setShowDisclaimer] = useState(true);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Global Disclaimer Banner */}
      {showDisclaimer && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs sm:text-sm text-amber-600 dark:text-amber-500 relative z-50">
          <div className="flex items-center gap-2 max-w-7xl mx-auto flex-1 justify-center text-center">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>
              <strong className="font-semibold">Disclaimer:</strong> The
              analysis and decision trees provided are based entirely on
              aggregated product reviews and should not be used alone to make
              purchasing decisions.
            </p>
          </div>
          <button
            onClick={() => setShowDisclaimer(false)}
            className="p-1 hover:bg-amber-500/20 rounded-md transition-colors shrink-0 ml-2"
            aria-label="Close disclaimer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <header className="h-16 border-b border-border/40 bg-background/50 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-40">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="relative shrink-0">
            <Hexagon className="h-7 w-7 text-primary fill-primary/10 transition-colors duration-300 group-hover:fill-primary/20" />
            <Activity className="h-3.5 w-3.5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <span className="text-xl font-bold tracking-tight">HYVE</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/dashboard"
            className={`text-sm font-semibold transition-colors ${
              location.pathname === "/dashboard"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Dashboard
          </Link>
          <Link
            to="/products"
            className={`text-sm font-semibold transition-colors ${
              location.pathname === "/products"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Products
          </Link>
          <Link
            to="/admin"
            className={`text-sm font-semibold transition-colors flex items-center gap-1.5 ${
              location.pathname.startsWith("/admin")
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <div className="text-xs font-medium text-muted-foreground hidden sm:block">
            Systems Status:{" "}
            <span className="text-emerald-500 font-bold ml-1">Operational</span>
          </div>
          <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-[10px] font-black text-primary">
            JS
          </div>
        </div>
      </header>

      <main className="flex-1 px-8 pt-8 pb-12">
        <Outlet />
      </main>

      <footer className="h-12 border-t border-border/40 flex items-center justify-between px-8 text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
        <p>© {new Date().getFullYear()} HYVE - SHOP WITH INTELLIGENCE</p>
        <div className="flex gap-4">
          <span className="hover:text-foreground cursor-pointer transition-colors">
            v1.0.0
          </span>
          <span className="hover:text-foreground cursor-pointer transition-colors">
            Privacy
          </span>
        </div>
      </footer>

      <Toaster />
    </div>
  );
}
