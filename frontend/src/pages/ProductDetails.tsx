import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useParams, Link } from "react-router-dom";
import {
  ChevronRight,
  MessageSquare,
  Layers,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Star,
  ArrowRight,
  BarChart3,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSentimentVerdict, getSentimentColor } from "@/lib/sentiment";

interface SentimentCounts {
  positive: number;
  negative: number;
  neutral: number;
}

interface ThemeAnalytics {
  id: number;
  name: string;
  claim_count: number;
  positive_ratio: number;
  avg_severity: number;
  sentiment_counts: SentimentCounts;
}

interface RiskStrengthItem {
  theme: string;
  ratio: number;
  severity_avg: number;
}

interface AnalyticsData {
  product_id: number;
  product_name: string;
  category: string;
  review_count: number;
  claim_count: number;
  overall_sentiment: number;
  critical_risk_factor: RiskStrengthItem | null;
  strongest_selling_point: RiskStrengthItem | null;
  theme_breakdown: ThemeAnalytics[];
}

export default function ProductDetails() {
  const { productId } = useParams<{ productId: string }>();

  const { data, isLoading, isError } = useQuery<AnalyticsData>({
    queryKey: ["product-analytics", productId],
    queryFn: async () => {
      const res = await api.get(`/products/${productId}/analytics`);
      return res.data;
    },
    enabled: !!productId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-destructive font-medium">
          Failed to load analytics. Ensure the backend is running and reviews
          have been ingested.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 animate-fade-in py-4">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col gap-4">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link
            to="/products"
            className="hover:text-foreground transition-colors"
          >
            Products
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium truncate max-w-[200px]">
            {data.product_name}
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-medium">Analytics</span>
        </nav>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-4xl font-extrabold tracking-tight text-foreground">
              {data.product_name}
            </h2>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                {data.category}
              </span>
              <p className="text-muted-foreground text-sm font-medium">
                Deep Consumer Analytics
              </p>
            </div>
          </div>
          <Link to={`/products/${productId}`}>
            <Button className="h-11 px-6 gap-2 font-semibold shadow-lg shadow-primary/20 transition-all hover:translate-y-[-2px] hover:shadow-primary/30 active:translate-y-0">
              Explore Decision Map
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          {
            label: "Total Reviews",
            value: data.review_count,
            icon: MessageSquare,
            color: "text-blue-500",
            bg: "bg-blue-500/10",
            description: "Verified consumer feedback",
          },
          {
            label: "AI Claims",
            value: data.claim_count,
            icon: Layers,
            color: "text-indigo-500",
            bg: "bg-indigo-500/10",
            description: "Extracted insights",
          },
          {
            label: "Consumer Reception",
            value: getSentimentVerdict(data.overall_sentiment),
            icon: data.overall_sentiment >= 0.5 ? TrendingUp : TrendingDown,
            color: getSentimentColor(data.overall_sentiment),
            bg:
              data.overall_sentiment >= 0.7
                ? "bg-emerald-500/10"
                : data.overall_sentiment >= 0.45
                  ? "bg-amber-500/10"
                  : "bg-rose-500/10",
            description: `${Math.round(data.overall_sentiment * 100)}% positive reviews · Higher = better`,
          },
          {
            label: "Active Themes",
            value: data.theme_breakdown.length,
            icon: BarChart3,
            color: "text-amber-500",
            bg: "bg-amber-500/10",
            description: "Clustered categories",
          },
        ].map((stat) => (
          <Card
            key={stat.label}
            className="border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden group hover:border-border/80 transition-all duration-300"
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 space-y-1">
                <p className="text-3xl font-bold tracking-tight">
                  {stat.value}
                </p>
                <p className="text-sm font-semibold text-foreground/90">
                  {stat.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk & Strength Analysis */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Critical Risk Factor */}
          <Card className="border-border/40 bg-card/40 overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-rose-500 uppercase tracking-wider">
                <AlertTriangle className="h-4 w-4" />
                Critical Risk Factor
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {data.critical_risk_factor ? (
                <div className="space-y-4">
                  <h4 className="text-xl font-bold">
                    {data.critical_risk_factor.theme}
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Negative Impact
                      </span>
                      <span className="font-bold text-rose-500">
                        {Math.round(data.critical_risk_factor.ratio * 100)}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500"
                        style={{
                          width: `${data.critical_risk_factor.ratio * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
                    <div className="p-1 px-2 rounded bg-rose-500 text-white text-[10px] font-black">
                      AVG SEVERITY:{" "}
                      {data.critical_risk_factor.severity_avg.toFixed(1)}
                    </div>
                    <p className="text-[10px] text-rose-500/80 font-medium">
                      Requires immediate attention
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                  </div>
                  <p className="text-sm text-muted-foreground italic">
                    All metrics within safe thresholds
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Strongest Selling Point */}
          <Card className="border-border/40 bg-card/40 overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-500 uppercase tracking-wider">
                <Star className="h-4 w-4" />
                Strongest Selling Point
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {data.strongest_selling_point ? (
                <div className="space-y-4">
                  <h4 className="text-xl font-bold">
                    {data.strongest_selling_point.theme}
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Positive Affinity
                      </span>
                      <span className="font-bold text-emerald-500">
                        {Math.round(data.strongest_selling_point.ratio * 100)}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${data.strongest_selling_point.ratio * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                    <div className="p-1 px-2 rounded bg-emerald-500 text-white text-[10px] font-black">
                      STRENGTH:{" "}
                      {data.strongest_selling_point.severity_avg.toFixed(1)}
                    </div>
                    <p className="text-[10px] text-emerald-500/80 font-medium">
                      Primary brand differentiator
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic py-8 text-center">
                  Establishing baseline performance...
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Theme Breakdown Table */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-border/40 bg-card/40 h-full">
            <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold">
                Theme Distribution
              </CardTitle>
              <div className="flex gap-2">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" /> POS
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold">
                  <div className="h-2 w-2 rounded-full bg-rose-500" /> NEG
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground text-[10px] uppercase font-bold border-b border-border/40">
                    <th className="text-left p-4 font-bold">Theme</th>
                    <th className="text-center p-4">Volume</th>
                    <th className="text-center p-4">Severity</th>
                    <th className="p-4 text-right">
                      Sentiment
                      <br />
                      <span className="text-[8px] normal-case font-medium opacity-60">
                        Green = positive · Red = negative
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {data.theme_breakdown.map((theme) => (
                    <tr
                      key={theme.id}
                      className="group transition-colors hover:bg-muted/20"
                    >
                      <td className="p-4">
                        <div className="font-bold text-foreground">
                          {theme.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-medium">
                          ID: #{theme.id}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="px-2 py-1 rounded bg-secondary text-[11px] font-black">
                          {theme.claim_count}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`text-xs font-black p-1 px-2 rounded ${
                            theme.avg_severity >= 0.7
                              ? "bg-rose-500/10 text-rose-500"
                              : theme.avg_severity >= 0.4
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-emerald-500/10 text-emerald-500"
                          }`}
                        >
                          {theme.avg_severity.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="h-2 w-32 bg-secondary rounded-full overflow-hidden flex">
                            <div
                              className="h-full bg-emerald-500"
                              style={{
                                width: `${theme.positive_ratio * 100}%`,
                              }}
                            />
                            <div
                              className="h-full bg-rose-500"
                              style={{
                                width: `${(1 - theme.positive_ratio) * 100}%`,
                              }}
                            />
                          </div>
                          <div className="flex gap-2 text-[10px] font-bold">
                            <span className="text-emerald-500">
                              {theme.sentiment_counts.positive}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-rose-500">
                              {theme.sentiment_counts.negative}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
