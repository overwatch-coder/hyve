import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Link } from "react-router-dom";
import {
  Eye,
  TrendingUp,
  Package,
  Layers,
  BarChart3,
  Search,
  Plus,
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: productsData, isLoading: isProductsLoading } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const res = await api.get("/products");
      return res.data.items;
    },
  });

  const filteredProducts = productsData?.filter(
    (p: any) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const stats = [
    {
      label: "Active Products",
      value: productsData?.length || 0,
      icon: Package,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Analyzed Themes",
      value:
        productsData?.reduce(
          (acc: number, p: any) => acc + (p.themes?.length || 0),
          0,
        ) || 0,
      icon: BarChart3,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Claims Extracted",
      value:
        productsData?.reduce(
          (acc: number, p: any) =>
            acc +
            p.themes?.reduce(
              (tAcc: number, t: any) => tAcc + (t.claim_count || 0),
              0,
            ),
          0,
        ) || 0,
      icon: Layers,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
    },
  ];

  return (
    <div className="flex flex-col gap-10 animate-fade-in pb-12">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="border-border/40 bg-card/40 backdrop-blur-sm transition-all hover:border-border/80"
          >
            <CardContent className="p-6 flex items-center gap-5">
              <div className={`p-3 rounded-2xl ${stat.bg} ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-3xl font-black tracking-tight mt-1">
                  {isProductsLoading ? "..." : stat.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight underline decoration-primary/30 underline-offset-8">
            Dashboard
          </h2>
          <p className="text-sm text-muted-foreground font-medium pt-2">
            Manage and explore your AI-analyzed product datasets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search projects..."
              className="pl-10 bg-card text-xs h-10 border-border/40 focus:border-primary/40 focus:ring-primary/10 rounded-xl transition-all shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Link to="/new">
            <Button className="h-10 px-6 gap-2 font-bold shadow-lg shadow-primary/20 rounded-xl hover:translate-y-[-2px] transition-all active:translate-y-0">
              <Plus className="h-4 w-4" />
              New Analysis
            </Button>
          </Link>
        </div>
      </div>

      {/* Dashboard Table */}
      {isProductsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-16 bg-muted animate-pulse rounded-xl border border-border/40"
            />
          ))}
        </div>
      ) : (
        <div className="border border-border/40 bg-card/40 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Product
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Category
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">
                    Sentiment
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">
                    Themes
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">
                    Insights
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Status
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right border-l border-border/20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredProducts?.map((p: any) => (
                  <tr
                    key={p.id}
                    className="group hover:bg-primary/5 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-8 w-8 rounded-lg flex items-center justify-center ${p.status === "processing" ? "bg-primary/10 animate-pulse" : "bg-secondary/50"}`}
                        >
                          <Bot
                            className={`h-4 w-4 ${p.status === "processing" ? "text-primary" : "text-muted-foreground"}`}
                          />
                        </div>
                        <p className="text-sm font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                          {p.name}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider border border-primary/20">
                        {p.category || "General"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`text-xs font-black ${p.overall_sentiment_score > 0 ? "text-emerald-500" : "text-rose-500"}`}
                        >
                          {(p.overall_sentiment_score * 100).toFixed(0)}%
                        </span>
                        <div className="h-1 w-16 bg-secondary rounded-full overflow-hidden shadow-inner">
                          <div
                            className={`h-full transition-all duration-1000 ${p.overall_sentiment_score >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                            style={{
                              width: `${Math.abs(p.overall_sentiment_score) * 100}%`,
                            }}
                          />
                        </div>
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
                    <td className="px-6 py-4">
                      {p.status === "processing" ? (
                        <div className="flex items-center gap-2 text-primary animate-pulse">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            Processing
                          </span>
                        </div>
                      ) : p.status === "error" ? (
                        <div className="flex items-center gap-2 text-rose-500">
                          <XCircle className="h-3 w-3" />
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            Error
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-emerald-500">
                          <CheckCircle2 className="h-3 w-3" />
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            Ready
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right border-l border-border/20">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/products/${p.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 gap-2 text-[10px] font-black uppercase tracking-wider hover:bg-primary/10 hover:text-primary transition-all"
                            disabled={p.status === "processing"}
                          >
                            <TrendingUp className="h-3 w-3" />
                            Analytics
                          </Button>
                        </Link>
                        <Link to={`/products/${p.id}`}>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-border/40 hover:border-primary/50 hover:text-primary rounded-lg transition-all shadow-sm"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(!filteredProducts || filteredProducts.length === 0) && (
            <div className="h-64 flex flex-col items-center justify-center gap-4 bg-muted/5">
              <Package className="h-10 w-10 text-muted-foreground/30" />
              <div className="text-center">
                <p className="font-bold text-muted-foreground text-sm">
                  No projects found.
                </p>
                <Link to="/new">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Plus className="h-4 w-4" /> Analyze Another
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
