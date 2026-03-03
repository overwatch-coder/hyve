import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Sparkles, RefreshCcw, Loader2, Star } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";

/* ── Shared Types ── */
interface ExpandableNodeData {
  label: string;
  expanded?: boolean;
  childIds?: string[];
  childCount?: number;
  onToggle?: (nodeId: string) => void;
  [key: string]: unknown;
}

/* ══════════════════════════════════════════════
   Product Node (Root)
   Teal card with product name, score badge, review count
   ══════════════════════════════════════════════ */
function ProductNodeRaw({
  data,
}: {
  data: ExpandableNodeData & {
    score?: number;
    reviewCount?: number;
    category?: string;
  };
  id: string;
}) {
  const score = data.score ?? 0;
  const reviewCount = data.reviewCount ?? 0;
  const category = data.category ?? "";

  return (
    <div
      className="flex flex-col items-center gap-1 px-6 py-4 rounded-xl font-bold text-white select-none cursor-pointer"
      style={{
        background: "hsl(170 45% 32%)",
        boxShadow: "0 4px 20px hsl(170 45% 32% / 0.3)",
        minWidth: 180,
      }}
    >
      {category && (
        <span className="text-[10px] font-medium uppercase tracking-widest opacity-70">
          {category}
        </span>
      )}
      <span className="text-base font-black tracking-tight leading-tight text-center">
        {data.label}
      </span>

      <div className="flex items-center gap-2 mt-1">
        <div className="flex items-center gap-1">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <span className="text-sm font-black">{score}/100</span>
        </div>
        <span className="text-[10px] font-medium opacity-70">
          {reviewCount.toLocaleString()} reviews
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="bg-white/40! border-none! w-2! h-2!"
      />
    </div>
  );
}
export const ProductNode = memo(ProductNodeRaw);

/* ══════════════════════════════════════════════
   Theme Node
   Compact card: name | percentage | progress bar | review count
   ══════════════════════════════════════════════ */
function ThemeNodeRaw({
  data,
}: {
  data: ExpandableNodeData & { themeData?: any; color?: string };
}) {
  const theme = data.themeData;
  const positiveRatio = theme?.positive_ratio ?? 0.5;
  const score = Math.round(positiveRatio * 100);
  const claimCount = theme?.claim_count ?? 0;

  // Color the progress bar based on score
  const barColor =
    score >= 70
      ? "hsl(160 64% 43%)"
      : score >= 40
        ? "hsl(38 92% 50%)"
        : "hsl(0 72% 51%)";
  const negBarColor = "hsl(0 72% 51%)";

  return (
    <div
      className="flex flex-col rounded-lg select-none cursor-pointer transition-all duration-200 hover:shadow-lg"
      style={{
        background: "hsl(170 40% 96%)",
        border: `1.5px solid hsl(170 35% 82%)`,
        minWidth: 180,
        maxWidth: 220,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="bg-border! border-none! w-2! h-2!"
      />

      {/* Header row: name + score */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <span className="text-xs font-bold text-gray-800 leading-tight flex-1 mr-2">
          {theme?.name ?? data.label}
        </span>
        <span
          className="text-xs font-black shrink-0"
          style={{ color: barColor }}
        >
          {score}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-3 pb-1">
        <div className="w-full h-1.5 bg-gray-200 rounded-full flex overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${score}%`, background: barColor }}
          />
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${100 - score}%`, background: negBarColor }}
          />
        </div>
      </div>

      {/* Review count */}
      <div className="px-3 pb-2.5">
        <span className="text-[10px] font-semibold" style={{ color: barColor }}>
          {claimCount.toLocaleString()} reviews
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="bg-border! border-none! w-2! h-2!"
      />
    </div>
  );
}
export const ThemeNode = memo(ThemeNodeRaw);

/* ══════════════════════════════════════════════
   Claim Node (Leaf)
   Colored dot + text + mini bar + mention count
   ══════════════════════════════════════════════ */
function ClaimNodeRaw({
  data,
}: {
  data: ExpandableNodeData & { fullClaim?: any };
  id: string;
}) {
  const claim = data.fullClaim;
  const sentiment = claim?.sentiment_polarity;
  const isPositive = sentiment === "positive";
  const isNeutral = sentiment === "neutral";

  const dotColor = isPositive
    ? "hsl(160 64% 43%)"
    : isNeutral
      ? "hsl(220 14% 50%)"
      : "hsl(0 72% 51%)";

  const barColor = isPositive ? "hsl(160 64% 43%)" : "hsl(0 72% 51%)";
  const severity = claim?.severity ?? 50;
  const mentions =
    claim?.mention_count ?? Math.max(1, Math.round(severity * 50));

  return (
    <div
      className="flex flex-col rounded-lg select-none cursor-pointer transition-all duration-200 hover:shadow-md"
      style={{
        background: "hsl(170 40% 96%)",
        border: `1.5px solid hsl(170 35% 82%)`,
        minWidth: 180,
        maxWidth: 220,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="bg-border! border-none! w-2! h-2!"
      />

      {/* Dot + claim text */}
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-1.5">
        <div
          className="h-2 w-2 rounded-full mt-1 shrink-0"
          style={{ background: dotColor }}
        />
        <p className="text-[11px] font-semibold text-gray-800 leading-snug">
          {data.label}
        </p>
      </div>

      {/* Mini progress bar + mentions */}
      <div className="flex items-center gap-2 px-3 pb-2.5">
        <div className="flex-1 h-1 bg-gray-200 rounded-full flex overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(severity * 100, 100)}%`,
              background: barColor,
            }}
          />
        </div>
        <span className="text-[9px] font-bold text-gray-500 shrink-0">
          {severity > 0 ? Math.round(severity * 100) : 50}%
        </span>
        <span className="text-[9px] font-medium text-gray-400 shrink-0">
          {mentions.toLocaleString()} mentions
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="bg-border! border-none! w-2! h-2!"
      />
    </div>
  );
}
export const ClaimNode = memo(ClaimNodeRaw);

/* ══════════════════════════════════════════════
   Summary Node (Terminal)
   AI Summary with advice, regeneration
   ══════════════════════════════════════════════ */
function SummaryNodeRaw({ data }: { data: any; id: string }) {
  const { summary, advices, score, productId } = data;
  const [focusMode, setFocusMode] = useState(false);
  const [focusText, setFocusText] = useState("");
  const queryClient = useQueryClient();

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/products/${productId}/summary/regenerate`, {
        focus: focusText || null,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product", productId?.toString()],
      });
      setFocusMode(false);
      setFocusText("");
      toast.success("Summary Regenerated", {
        description: "The AI summary has been updated.",
      });
    },
    onError: (err: any) => {
      toast.error("Regeneration Failed", { description: err.message });
    },
  });

  return (
    <div
      className="flex flex-col gap-3 p-5 rounded-2xl max-w-[320px] select-text transition-all duration-500 ease-out animate-in fade-in slide-in-from-top-4"
      style={{
        background:
          "linear-gradient(145deg, hsl(228 20% 12%), hsl(228 24% 15%))",
        border: "1px solid hsl(243 75% 59% / 0.5)",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 hsl(243 75% 59% / 0.2)",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="bg-primary! border-none! w-3! h-3!"
      />

      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Summary
        </h3>
        {score !== undefined && (
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              Net Sentiment
            </span>
            <span
              className={`text-lg font-black ${score > 0 ? "text-emerald-400" : score < 0 ? "text-red-400" : "text-gray-400"}`}
            >
              {score > 0 ? "+" : ""}
              {(score * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {summary || "Analyzing product reviews..."}
          </p>
        </div>

        {advices && advices.length > 0 && (
          <div className="space-y-2 bg-black/20 p-3 rounded-xl border border-white/5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-primary/80">
              Key Advice
            </h4>
            <ul className="space-y-1.5">
              {advices.map((advice: string, idx: number) => (
                <li
                  key={idx}
                  className="text-[11px] text-gray-300 leading-snug flex items-start gap-1.5"
                >
                  <span className="text-primary mt-0.5">•</span>
                  <span>{advice}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-3 border-t border-white/10 mt-2">
          {!focusMode ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-2 bg-black/20 hover:bg-black/40 border-white/10 text-muted-foreground hover:text-white"
              onClick={() => setFocusMode(true)}
            >
              <RefreshCcw className="h-3 w-3" />
              Regenerate Summary
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                placeholder="Focus on e.g., 'battery life'..."
                className="h-8 text-xs bg-black/50 border-white/20 text-white placeholder:text-muted-foreground"
                value={focusText}
                onChange={(e) => setFocusText(e.target.value)}
                disabled={regenerateMutation.isPending}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-7 text-xs hover:bg-white/10 px-2"
                  onClick={() => {
                    setFocusMode(false);
                    setFocusText("");
                  }}
                  disabled={regenerateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="flex-2 h-7 text-xs gap-1"
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending}
                >
                  {regenerateMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {regenerateMutation.isPending ? "Generating..." : "Go"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export const SummaryNode = memo(SummaryNodeRaw);
