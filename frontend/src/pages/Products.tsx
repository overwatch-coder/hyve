import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Link } from "react-router-dom";
import { Eye, TrendingUp, Plus, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function Products() {
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

  return (
    <div className="flex flex-col gap-10 animate-fade-in pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight underline decoration-primary/30 underline-offset-8">
            Products
          </h2>
          <p className="text-sm text-muted-foreground font-medium pt-2">
            Explore your product catalog and analyzed datasets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search products..."
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

      {/* Projects Grid */}
      {isProductsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 bg-muted animate-pulse rounded-2xl border border-border/40"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts?.map((p: any) => (
            <Card
              key={p.id}
              className="group border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden flex flex-col transition-all duration-300 hover:border-primary/40 hover:translate-y-[-4px] hover:shadow-2xl hover:shadow-primary/5"
            >
              <CardContent className="p-6 flex-1 flex flex-col gap-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider border border-primary/20">
                      {p.category || "General"}
                    </span>
                    <h3 className="text-xl font-bold tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
                      {p.name}
                    </h3>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-muted/50 flex flex-col items-center justify-center border border-border/40 group-hover:border-primary/30 transition-all shadow-inner">
                    <p className="text-[10px] font-black text-muted-foreground uppercase leading-none mb-0.5">
                      Sc.
                    </p>
                    <p
                      className={`text-sm font-black ${p.overall_sentiment_score > 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {(p.overall_sentiment_score * 100).toFixed(0)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-secondary/30 border border-border/20 text-center group-hover:bg-secondary/50 transition-colors">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">
                      Themes
                    </p>
                    <p className="text-lg font-bold">{p.themes?.length || 0}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-secondary/30 border border-border/20 text-center group-hover:bg-secondary/50 transition-colors">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">
                      Insights
                    </p>
                    <p className="text-lg font-bold">
                      {p.themes?.reduce(
                        (acc: number, t: any) => acc + (t.claim_count || 0),
                        0,
                      ) || 0}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <span>Performance</span>
                    <span
                      className={
                        p.overall_sentiment_score >= 0.5
                          ? "text-emerald-500"
                          : "text-rose-500"
                      }
                    >
                      {p.overall_sentiment_score >= 0.5
                        ? "STABLE"
                        : "SENSITIVE"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden flex shadow-inner">
                    <div
                      className={`h-full transition-all duration-1000 ${p.overall_sentiment_score >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                      style={{
                        width: `${Math.abs(p.overall_sentiment_score) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-border/30 flex items-center justify-between">
                  <Link to={`/products/${p.id}`} className="flex-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-2 text-xs font-bold hover:bg-primary/5 hover:text-primary rounded-lg h-9 transition-all"
                    >
                      <TrendingUp className="h-3.5 w-3.5" />
                      Analytics
                    </Button>
                  </Link>
                  <div className="flex gap-2">
                    <Link to={`/products/${p.id}`}>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 border-border/40 hover:border-primary/50 hover:text-primary rounded-lg transition-all shadow-sm"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {(!filteredProducts || filteredProducts.length === 0) && (
            <div className="col-span-full h-80 border-2 border-dashed border-border/40 rounded-3xl flex flex-col items-center justify-center gap-4 bg-muted/5 group hover:border-primary/20 transition-all">
              <div className="p-5 rounded-full bg-muted/40 group-hover:bg-primary/5 transition-all">
                <Package className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-all" />
              </div>
              <div className="text-center">
                <p className="font-bold text-muted-foreground text-sm">
                  No projects found matching your search.
                </p>
                <Link to="/new">
                  <button className="text-xs font-black text-primary uppercase tracking-widest mt-3 hover:underline underline-offset-4">
                    Start a new analysis
                  </button>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
