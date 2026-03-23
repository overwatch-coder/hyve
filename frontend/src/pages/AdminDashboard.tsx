import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "@/hooks/useAdmin";
import api from "@/lib/api";
import { toast } from "sonner";
import { getSentimentVerdict, getSentimentColor } from "@/lib/sentiment";
import {
  Trash2,
  Eye,
  TrendingUp,
  Package,
  MessageSquare,
  Layers,
  ShieldCheck,
  LogOut,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AdminDashboard() {
  const {
    isAdmin,
    isLoading: authLoading,
    logout,
    getAuthHeaders,
  } = useAdmin();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/admin/login", { replace: true });
    }
  }, [authLoading, isAdmin, navigate]);

  // Fetch products
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const res = await api.get("/products?size=100");
      return res.data.items;
    },
    enabled: isAdmin,
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await api.get("/stats");
      return res.data;
    },
    enabled: isAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: async (productId: number) => {
      await api.delete(`/products/${productId}`, {
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Product deleted successfully");
    },
    onError: (err: any) => {
      toast.error("Failed to delete product", {
        description: err.response?.data?.detail || err.message,
      });
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground gap-3">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="font-semibold">Verifying credentials...</span>
      </div>
    );
  }

  if (!isAdmin) return null;

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
    toast.success("Logged out");
  };

  return (
    <div className="flex flex-col gap-8 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-3xl font-black tracking-tight">
              Admin Dashboard
            </h2>
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            Manage products, view analytics, and oversee the platform.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="default" asChild className="gap-2 h-10">
            <Link to="/admin/experiments/review">
              <ShieldCheck className="h-4 w-4" /> Experiment QC
            </Link>
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-border/40 h-10"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {statsData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Products",
              value: statsData.total_products,
              icon: Package,
              color: "text-primary",
            },
            {
              label: "Claims",
              value: statsData.total_claims,
              icon: MessageSquare,
              color: "text-emerald-500",
            },
            {
              label: "Themes",
              value: statsData.total_themes,
              icon: Layers,
              color: "text-amber-500",
            },
            {
              label: "Avg. Reception",
              value: getSentimentVerdict(statsData.avg_sentiment),
              icon: TrendingUp,
              color: getSentimentColor(statsData.avg_sentiment),
              hint: `${(statsData.avg_sentiment * 100).toFixed(0)}% of reviews are positive`,
            },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/40 shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`p-2.5 rounded-xl bg-muted/50 ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    {stat.label}
                  </p>
                  <p className="text-xl font-black" title={(stat as any).hint}>
                    {stat.value}
                  </p>
                  {(stat as any).hint && (
                    <p className="text-[9px] text-muted-foreground/60 font-bold mt-0.5">
                      {(stat as any).hint}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Products Table */}
      <Card className="border-border/40 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30 bg-muted/30">
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Category
                </th>
                <th className="px-6 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Score
                </th>
                <th className="px-6 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Themes
                </th>
                <th className="px-6 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Claims
                </th>
                <th className="px-6 py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {productsLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/20">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="h-5 bg-muted animate-pulse rounded w-full" />
                      </td>
                    </tr>
                  ))
                : productsData?.map((p: any) => (
                    <tr
                      key={p.id}
                      className="border-b border-border/20 hover:bg-muted/10 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="font-bold text-sm">{p.name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider">
                          {p.category || "General"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span
                            className={`text-xs font-black ${getSentimentColor(p.overall_sentiment_score)}`}
                          >
                            {getSentimentVerdict(p.overall_sentiment_score)}
                          </span>
                          <div
                            className="h-1.5 w-20 bg-secondary rounded-full overflow-hidden flex"
                            title={`${(p.overall_sentiment_score * 100).toFixed(0)}% positive reviews · Higher is better`}
                          >
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{
                                width: `${p.overall_sentiment_score * 100}%`,
                              }}
                            />
                            <div
                              className="h-full bg-rose-500 transition-all"
                              style={{
                                width: `${(1 - p.overall_sentiment_score) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-[9px] font-bold text-muted-foreground/60">
                            {(p.overall_sentiment_score * 100).toFixed(0)}% pos
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-bold">
                          {p.themes?.length || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-bold">
                          {p.themes?.reduce(
                            (acc: number, t: any) => acc + (t.claim_count || 0),
                            0,
                          ) || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/products/${p.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 gap-1.5 text-[10px] font-black uppercase tracking-wider hover:text-primary"
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </Button>
                          </Link>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 border-border/40 text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/5 rounded-lg transition-all"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                  <AlertTriangle className="h-5 w-5 text-destructive" />
                                  Delete "{p.name}"?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will
                                  permanently delete the product along with all
                                  its reviews, claims, themes, and analysis
                                  data.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteMutation.mutate(p.id)}
                                >
                                  Delete Permanently
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}

              {!productsLoading &&
                (!productsData || productsData.length === 0) && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-sm text-muted-foreground"
                    >
                      No products found.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
