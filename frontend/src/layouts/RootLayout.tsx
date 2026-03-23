import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  Activity,
  Hexagon,
  X,
  AlertCircle,
  ShieldCheck,
  BarChart2,
  Menu,
  ShoppingBag,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export default function RootLayout() {
  const location = useLocation();
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  // On the explore / product detail page we want full-bleed — no padding
  const isProductPage = /^\/products\/[^/]+$/.test(location.pathname);

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

      <header className="h-16 border-b border-border/40 bg-background/50 backdrop-blur-md flex items-center justify-between px-4 md:px-8 sticky top-0 z-40">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="relative shrink-0">
            <Hexagon className="h-6 w-6 md:h-7 md:w-7 text-primary fill-primary/10 transition-colors duration-300 group-hover:fill-primary/20" />
            <Activity className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <span className="text-lg md:text-xl font-bold tracking-tight">
            HYVE
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/products"
            className={`text-sm font-semibold transition-colors ${
              location.pathname === "/products"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Analysis
          </Link>
          <Link
            to="/amazon"
            className={`text-sm font-semibold transition-colors flex items-center gap-1.5 ${
              location.pathname.startsWith("/amazon")
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Amazon
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
          <Link
            to="/test-analytics"
            className={`text-sm font-semibold transition-colors flex items-center gap-1.5 ${
              location.pathname === "/test-analytics"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            A/B Results
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="text-[10px] md:text-xs font-medium text-muted-foreground hidden sm:block">
            Systems Status:{" "}
            <span className="text-emerald-500 font-bold ml-1">Operational</span>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-72 bg-background/95 backdrop-blur-xl border-l border-border/40"
              >
                <SheetHeader className="text-left mb-8">
                  <SheetTitle className="flex items-center gap-2.5">
                    <div className="relative shrink-0">
                      <Hexagon className="h-6 w-6 text-primary fill-primary/10" />
                      <Activity className="h-3 w-3 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <span className="text-lg font-bold tracking-tight">
                      HYVE
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4">
                  <Link
                    to="/products"
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm",
                      location.pathname === "/products"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <Activity className="h-4 w-4" />
                    Analysis
                  </Link>
                  <Link
                    to="/amazon"
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm",
                      location.pathname.startsWith("/amazon")
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Amazon Search
                  </Link>
                  <Link
                    to="/admin"
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm",
                      location.pathname.startsWith("/admin")
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Admin Portal
                  </Link>
                  <Link
                    to="/test-analytics"
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm",
                      location.pathname === "/test-analytics"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <BarChart2 className="h-4 w-4" />
                    A/B Results
                  </Link>
                </div>

                <div className="absolute bottom-8 left-6 right-6 p-4 rounded-2xl bg-primary/5 border border-primary/10 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                    Status
                  </p>
                  <p className="text-xs font-bold text-emerald-500">
                    Systems Operational
                  </p>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-[10px] font-black text-primary">
            SCI
          </div>
        </div>
      </header>

      <main
        className={
          isProductPage
            ? "flex-1 flex flex-col overflow-hidden"
            : "flex-1 px-4 md:px-8 pt-4 md:pt-8 pb-8 md:pb-12"
        }
      >
        <Outlet />
      </main>

      {!isProductPage && (
        <footer className="h-auto md:h-12 border-t border-border/40 flex flex-col md:flex-row items-center justify-between px-4 md:px-8 py-4 md:py-0 text-[9px] md:text-[10px] text-muted-foreground uppercase font-bold tracking-widest gap-4">
          <p className="text-center md:text-left">
            © {new Date().getFullYear()} HYVE - SHOP WITH INTELLIGENCE
          </p>
          <div className="flex gap-4">
            <span className="hover:text-foreground cursor-pointer transition-colors">
              v1.0.0
            </span>
            <span className="hover:text-foreground cursor-pointer transition-colors">
              Privacy
            </span>
          </div>
        </footer>
      )}

      <Toaster />
    </div>
  );
}
