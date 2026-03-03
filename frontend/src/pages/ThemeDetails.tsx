import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MessageCircle,
  TrendingUp,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ThemeDetails() {
  const { productId, themeId } = useParams<{
    productId: string;
    themeId: string;
  }>();

  // Fetch full product data to find the theme
  const {
    data: productData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["product-deep", productId],
    queryFn: async () => {
      const res = await api.get(`/products/${productId}`);
      return res.data;
    },
    enabled: !!productId,
  });

  if (isLoading || !productData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground gap-4">
        <div className="h-10 w-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="font-semibold text-lg">Loading Theme Details...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-destructive">
        Failed to load theme data.
      </div>
    );
  }

  // Find the specific theme
  const theme = productData.themes?.find(
    (t: any) => t.id === parseInt(themeId || "", 10),
  );

  if (!theme) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <h2 className="text-2xl font-bold">Theme Not Found</h2>
        <p className="text-muted-foreground">
          The requested theme could not be found for this product.
        </p>
        <Button asChild className="mt-4">
          <Link to={`/products/${productId}`}>Back to Decision Map</Link>
        </Button>
      </div>
    );
  }

  // Organize claims by sentiment
  const pros =
    theme.claims?.filter((c: any) => c.sentiment_polarity === "positive") || [];
  const cons =
    theme.claims?.filter((c: any) => c.sentiment_polarity === "negative") || [];
  const neutral =
    theme.claims?.filter((c: any) => c.sentiment_polarity === "neutral") || [];

  const score = Math.round(theme.positive_ratio * 100);

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* ── BREADCRUMBS & HEADER ── */}
      <div className="flex flex-col gap-4">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link
            to="/products"
            className="hover:text-foreground transition-colors"
          >
            Products
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link
            to={`/products/${productId}`}
            className="hover:text-foreground transition-colors max-w-[150px] truncate"
          >
            {productData.name}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-medium">{theme.name}</span>
        </nav>

        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
            asChild
          >
            <Link to={`/products/${productId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-black tracking-tight mt-1">
              {theme.name}
            </h1>
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-2 mt-1">
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" />
                {theme.claim_count} Mentions
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                {score}% Positive
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* ── OVERVIEW CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500 mb-2">
              <CheckCircle2 className="h-5 w-5" />
              <h3 className="font-bold text-lg">Positive Feedback</h3>
            </div>
            <p className="text-3xl font-black text-foreground">
              {pros.length}{" "}
              <span className="text-base font-normal text-muted-foreground">
                mentions
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-rose-500/5 border-rose-500/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-500 mb-2">
              <XCircle className="h-5 w-5" />
              <h3 className="font-bold text-lg">Critical Feedback</h3>
            </div>
            <p className="text-3xl font-black text-foreground">
              {cons.length}{" "}
              <span className="text-base font-normal text-muted-foreground">
                mentions
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-secondary/50 border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <FileText className="h-5 w-5" />
              <h3 className="font-bold text-lg">Neutral Mentions</h3>
            </div>
            <p className="text-3xl font-black text-foreground">
              {neutral.length}{" "}
              <span className="text-base font-normal text-muted-foreground">
                mentions
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── EVIDENCE SECTIONS ── */}
      <div className="flex flex-col gap-8 mt-4">
        {/* Positive Sentiments */}
        {pros.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4 border-b border-border/40 pb-2">
              <div className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold">What Users Love</h2>
              <Badge
                variant="outline"
                className="ml-auto bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none"
              >
                {pros.length} Claims
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pros.map((claim: any) => (
                <Card key={`pro-${claim.id}`} className="shadow-sm">
                  <CardContent className="p-5">
                    <h4 className="font-semibold text-foreground mb-2 leading-tight">
                      {claim.claim_text}
                    </h4>
                    {claim.evidence_text && (
                      <div className="mt-3 bg-secondary/50 rounded-md p-3 border border-border/40 relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 rounded-l-md" />
                        <p className="text-sm italic text-foreground/80 pl-2">
                          "{claim.evidence_text}"
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Negative Sentiments */}
        {cons.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4 border-b border-border/40 pb-2">
              <div className="h-6 w-6 rounded-full bg-rose-500/20 flex items-center justify-center">
                <XCircle className="h-4 w-4 text-rose-500" />
              </div>
              <h2 className="text-xl font-bold">Areas for Improvement</h2>
              <Badge
                variant="outline"
                className="ml-auto bg-rose-500/10 text-rose-600 dark:text-rose-400 border-none"
              >
                {cons.length} Claims
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cons.map((claim: any) => (
                <Card
                  key={`con-${claim.id}`}
                  className="shadow-sm border-rose-100 dark:border-rose-900/30"
                >
                  <CardContent className="p-5">
                    <h4 className="font-semibold text-foreground mb-2 leading-tight">
                      {claim.claim_text}
                    </h4>
                    {claim.evidence_text && (
                      <div className="mt-3 bg-secondary/50 rounded-md p-3 border border-border/40 relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 rounded-l-md" />
                        <p className="text-sm italic text-foreground/80 pl-2">
                          "{claim.evidence_text}"
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Neutral Sentiments */}
        {neutral.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4 border-b border-border/40 pb-2">
              <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center">
                <FileText className="h-3 w-3 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-bold text-muted-foreground">
                General Observations
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {neutral.map((claim: any) => (
                <Card
                  key={`neu-${claim.id}`}
                  className="shadow-sm border-dashed"
                >
                  <CardContent className="p-4">
                    <h4 className="font-medium text-sm text-foreground/90">
                      {claim.claim_text}
                    </h4>
                    {claim.evidence_text && (
                      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/30">
                        "{claim.evidence_text}"
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
