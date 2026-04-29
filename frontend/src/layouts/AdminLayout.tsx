import { useEffect, useState } from "react";
import {
  Outlet,
  Link,
  useLocation,
  useNavigate,
  NavLink,
} from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  LayoutDashboard,
  FlaskConical,
  BarChart2,
  LogOut,
  ChevronDown,
  Menu,
  PanelLeftClose,
  Hexagon,
  Activity,
  Package,
  ChevronRight,
  Rows3,
} from "lucide-react";
import { toast } from "sonner";

// ─── Nav definition ─────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    id: "general",
    label: "General",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/admin", exact: true },
    ],
  },
  {
    id: "research",
    label: "Research",
    items: [
      { label: "Studies", icon: FlaskConical, href: "/admin/experiments/studies", exact: false },
      { label: "Analysis", icon: BarChart2, href: "/admin/experiments/analysis", exact: false },
      { label: "Public Results", icon: Rows3, href: "/admin/experiments/public-results", exact: false },
    ],
  },
];

// ─── Page title helper ───────────────────────────────────────────────────────

function usePageTitle(pathname: string) {
  if (pathname === "/admin") return "Dashboard";
  if (pathname.startsWith("/admin/experiments/studies")) return "Studies";
  if (pathname.startsWith("/admin/experiments/analysis")) return "Analysis";
  if (pathname.startsWith("/admin/experiments/public-results")) return "Public Results";
  if (pathname.startsWith("/admin/experiments/review")) return "Analysis";
  return "Admin";
}

// ─── NavItem ─────────────────────────────────────────────────────────────────

function NavItem({
  item,
  collapsed,
  onClick,
}: {
  item: { label: string; icon: React.ComponentType<{ className?: string }>; href: string; exact: boolean };
  collapsed: boolean;
  onClick?: () => void;
}) {
  const location = useLocation();
  const isActive = item.exact
    ? location.pathname === item.href
    : location.pathname.startsWith(item.href);

  return (
    <NavLink
      to={item.href}
      end={item.exact}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        collapsed && "justify-center px-2",
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon
        className={cn(
          "h-4 w-4 flex-shrink-0 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && isActive && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </NavLink>
  );
}

// ─── NavGroup ────────────────────────────────────────────────────────────────

function NavGroup({
  group,
  collapsed,
  onItemClick,
}: {
  group: (typeof NAV_GROUPS)[0];
  collapsed: boolean;
  onItemClick?: () => void;
}) {
  const [open, setOpen] = useState(true);

  if (collapsed) {
    return (
      <div className="flex flex-col gap-1">
        {group.items.map((item) => (
          <NavItem key={item.href} item={item} collapsed={true} onClick={onItemClick} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* Group header — clickable to collapse */}
      {group.label !== "General" && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-1 mb-0.5 group"
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 group-hover:text-muted-foreground transition-colors flex-1 text-left">
            {group.label}
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 text-muted-foreground/40 transition-transform duration-200",
              !open && "-rotate-90",
            )}
          />
        </button>
      )}
      {(open || group.label === "General") &&
        group.items.map((item) => (
          <NavItem key={item.href} item={item} collapsed={false} onClick={onItemClick} />
        ))}
    </div>
  );
}

// ─── Sidebar content (shared between desktop + sheet) ────────────────────────

function SidebarContent({
  collapsed,
  onItemClick,
  onLogout,
}: {
  collapsed: boolean;
  onItemClick?: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 py-5 shrink-0",
          collapsed && "justify-center px-2",
        )}
      >
        <div className="relative flex-shrink-0">
          <Hexagon className="h-8 w-8 text-primary fill-primary/15" />
          <Activity className="h-3.5 w-3.5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-black tracking-tight">HYVE</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Admin
            </p>
          </div>
        )}
      </div>

      <Separator className="opacity-40 mx-3 w-auto" />

      {/* Nav */}
      <nav className="flex flex-col gap-3 flex-1 overflow-y-auto px-3 py-4 min-h-0">
        {NAV_GROUPS.map((group) => (
          <NavGroup
            key={group.id}
            group={group}
            collapsed={collapsed}
            onItemClick={onItemClick}
          />
        ))}
      </nav>

      <Separator className="opacity-40 mx-3 w-auto" />

      {/* Bottom: back to site + logout */}
      <div className={cn("flex flex-col gap-1 px-3 py-4 shrink-0", collapsed && "items-center")}>
        {!collapsed && (
          <Link
            to="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all"
            onClick={onItemClick}
          >
            <Package className="h-4 w-4 flex-shrink-0" />
            <span>Back to Site</span>
          </Link>
        )}
        <button
          onClick={onLogout}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all w-full",
            collapsed && "justify-center px-2",
          )}
          title={collapsed ? "Sign Out" : undefined}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );
}

// ─── AdminLayout ─────────────────────────────────────────────────────────────

export default function AdminLayout() {
  const { isAdmin, isLoading: authLoading, logout } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageTitle = usePageTitle(location.pathname);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/admin/login", { replace: true });
    }
  }, [authLoading, isAdmin, navigate]);

  // Close mobile sheet on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
    toast.success("Logged out");
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground gap-3">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="font-semibold">Verifying credentials…</span>
      </div>
    );
  }

  if (!isAdmin) return null;

  const sidebarW = collapsed ? "w-16" : "w-60";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <aside
        className={cn(
          "relative hidden md:flex flex-col flex-shrink-0 border-r border-border/40 bg-background/95 backdrop-blur-sm transition-all duration-200",
          sidebarW,
        )}
      >
        {/* Collapse toggle at top-right of sidebar */}
        <div className="absolute top-4 z-10" style={{ left: collapsed ? "3.5rem" : "14.5rem" }}>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-background shadow-sm text-muted-foreground hover:text-foreground transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <PanelLeftClose className="h-3 w-3" />
            )}
          </button>
        </div>

        <SidebarContent
          collapsed={collapsed}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="flex items-center gap-3 border-b border-border/40 bg-background/95 backdrop-blur-sm h-14 px-4 md:px-6 shrink-0">
          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 flex flex-col">
              <SheetHeader className="sr-only">
                <SheetTitle>Admin Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto">
                <SidebarContent
                  collapsed={false}
                  onItemClick={() => setMobileOpen(false)}
                  onLogout={handleLogout}
                />
              </div>
            </SheetContent>
          </Sheet>

          {/* Page title */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 hidden md:block">
              Admin
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/30 hidden md:block" />
            <h1 className="text-sm font-black tracking-tight truncate">{pageTitle}</h1>
          </div>

          {/* Desktop: back to site */}
          <Link
            to="/"
            className="hidden md:flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            <Package className="h-3.5 w-3.5" />
            Site
          </Link>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
