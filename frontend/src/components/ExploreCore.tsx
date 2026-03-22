import { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import HYVEAccordion from "@/components/HYVEAccordion";
import {
  LayoutGrid,
  ListTree,
  Play,
  X,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
  RefreshCcw,
  Sparkles,
  ArrowRight,
  GitBranch,
  Info,
  Loader2,
  Bot,
  Zap,
  Quote,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getSentimentVerdict, getSentimentColor } from "@/lib/sentiment";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  ProductNode,
  ClaimNode,
  ThemeNode,
  SentimentNode,
  QuoteNode,
} from "@/components/graph-nodes";
import { Link } from "react-router-dom";

/* ── Custom node-type registry ── */
const nodeTypes = {
  product: ProductNode,
  theme: ThemeNode,
  sentiment: SentimentNode,
  claim: ClaimNode,
  quote: QuoteNode,
};

/* ──────────────────────────────────────────────
   Dagre Auto-Layout (Tight spacing)
   ────────────────────────────────────────────── */
const getLayoutedElements = (nodes: any[], edges: any[], direction = "TB") => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    ranksep: 60,
    nodesep: 24,
    marginx: 20,
    marginy: 20,
  });

  nodes.forEach((node) => {
    let w = 200;
    let h = 60;
    if (node.type === "product") {
      w = 200;
      h = 80;
    }
    if (node.type === "theme") {
      w = 200;
      h = 70;
    }
    if (node.type === "claim") {
      w = 210;
      h = 70;
    }
    if (node.type === "quote") {
      w = 260;
      h = 100;
    }
    g.setNode(node.id, { width: w, height: h });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const isHorizontal = direction === "LR";
  nodes.forEach((node) => {
    const pos = g.node(node.id);
    node.targetPosition = isHorizontal ? "left" : "top";
    node.sourcePosition = isHorizontal ? "right" : "bottom";
    node.position = {
      x: pos.x - pos.width / 2,
      y: pos.y - pos.height / 2,
    };
  });

  return { nodes, edges };
};

/* ──────────────────────────────────────────────
   Build graph: Product → Themes → Claims
   ────────────────────────────────────────────── */
function buildGraphFromProduct(product: any, analyticsData: any) {
  const nodes: any[] = [];
  const edges: any[] = [];

  const productNodeId = `product-${product.id}`;
  const themeChildIds: string[] = [];

  const score = analyticsData
    ? Math.round((analyticsData.overall_sentiment || 0) * 100)
    : 0;
  const reviewCount = analyticsData?.review_count ?? 0;
  const category = analyticsData?.category ?? product?.category ?? "";

  product.themes?.forEach((theme: any) => {
    const themeId = `theme-${theme.id}`;
    themeChildIds.push(themeId);

    const posSentimentId = `sentiment-pos-${theme.id}`;
    const negSentimentId = `sentiment-neg-${theme.id}`;

    const posClaims =
      theme.claims?.filter((c: any) => c.sentiment_polarity === "positive") ||
      [];
    const negClaims =
      theme.claims?.filter((c: any) => c.sentiment_polarity !== "positive") ||
      [];

    const sentimentNodes: string[] = [];

    // --- POSITIVE GROUP ---
    if (posClaims.length > 0) {
      sentimentNodes.push(posSentimentId);
      const claimIds: string[] = [];

      posClaims.forEach((claim: any) => {
        const claimId = `claim-${claim.id}`;
        const quoteId = `quote-${claim.id}`;
        claimIds.push(claimId);
        nodes.push({
          id: claimId,
          type: "claim",
          data: {
            label:
              claim.claim_text.length > 70
                ? claim.claim_text.substring(0, 70) + "..."
                : claim.claim_text,
            fullClaim: claim,
            expanded: false,
            childIds: [quoteId],
            childCount: 1,
          },
          position: { x: 0, y: 0 },
          hidden: true,
        });

        nodes.push({
          id: quoteId,
          type: "quote",
          data: {
            quote:
              claim.evidence_text || claim.context_text || claim.claim_text,
            author: "Verified User",
            source: "Consumer Review",
            rating: 5,
          },
          position: { x: 0, y: 0 },
          hidden: true,
        });

        edges.push({
          id: `e-${claimId}-${quoteId}`,
          source: claimId,
          target: quoteId,
          type: "smoothstep",
          style: {
            stroke: "hsl(220 15% 85%)",
            strokeWidth: 1.5,
            opacity: 0.6,
            strokeDasharray: "4 4",
          },
          hidden: true,
        });

        edges.push({
          id: `e-${posSentimentId}-${claimId}`,
          source: posSentimentId,
          target: claimId,
          type: "smoothstep",
          style: { stroke: "hsl(160 64% 43%)", strokeWidth: 1.5, opacity: 0.4 },
          hidden: true,
        });
      });

      const totalPosMentions = posClaims.reduce(
        (acc: number, c: any) => acc + (c.mention_count || 1),
        0,
      );

      nodes.push({
        id: posSentimentId,
        type: "sentiment",
        data: {
          label: "Pros",
          type: "pos",
          expanded: false,
          childIds: claimIds,
          childCount: claimIds.length,
          mentionCount: totalPosMentions,
        },
        position: { x: 0, y: 0 },
        hidden: true,
      });

      edges.push({
        id: `e-${themeId}-${posSentimentId}`,
        source: themeId,
        target: posSentimentId,
        type: "smoothstep",
        style: { stroke: "hsl(160 64% 43%)", strokeWidth: 2, opacity: 0.6 },
        hidden: true,
      });
    }

    // --- NEGATIVE GROUP ---
    if (negClaims.length > 0) {
      sentimentNodes.push(negSentimentId);
      const claimIds: string[] = [];

      negClaims.forEach((claim: any) => {
        const claimId = `claim-${claim.id}`;
        const quoteId = `quote-${claim.id}`;
        claimIds.push(claimId);
        nodes.push({
          id: claimId,
          type: "claim",
          data: {
            label:
              claim.claim_text.length > 70
                ? claim.claim_text.substring(0, 70) + "..."
                : claim.claim_text,
            fullClaim: claim,
            expanded: false,
            childIds: [quoteId],
            childCount: 1,
          },
          position: { x: 0, y: 0 },
          hidden: true,
        });

        nodes.push({
          id: quoteId,
          type: "quote",
          data: {
            quote:
              claim.evidence_text || claim.context_text || claim.claim_text,
            author: "Verified User",
            source: "Consumer Review",
            rating: 1,
          },
          position: { x: 0, y: 0 },
          hidden: true,
        });

        edges.push({
          id: `e-${claimId}-${quoteId}`,
          source: claimId,
          target: quoteId,
          type: "smoothstep",
          style: {
            stroke: "hsl(220 15% 85%)",
            strokeWidth: 1.5,
            opacity: 0.6,
            strokeDasharray: "4 4",
          },
          hidden: true,
        });

        edges.push({
          id: `e-${negSentimentId}-${claimId}`,
          source: negSentimentId,
          target: claimId,
          type: "smoothstep",
          style: { stroke: "hsl(0 72% 51%)", strokeWidth: 1.5, opacity: 0.4 },
          hidden: true,
        });
      });

      const totalNegMentions = negClaims.reduce(
        (acc: number, c: any) => acc + (c.mention_count || 1),
        0,
      );

      nodes.push({
        id: negSentimentId,
        type: "sentiment",
        data: {
          label: "Cons",
          type: "neg",
          expanded: false,
          childIds: claimIds,
          childCount: claimIds.length,
          mentionCount: totalNegMentions,
        },
        position: { x: 0, y: 0 },
        hidden: true,
      });

      edges.push({
        id: `e-${themeId}-${negSentimentId}`,
        source: themeId,
        target: negSentimentId,
        type: "smoothstep",
        style: { stroke: "hsl(0 72% 51%)", strokeWidth: 2, opacity: 0.6 },
        hidden: true,
      });
    }

    // Theme node
    nodes.push({
      id: themeId,
      type: "theme",
      data: {
        label: theme.name,
        themeData: theme,
        expanded: false,
        childIds: sentimentNodes,
        childCount: sentimentNodes.length,
      },
      position: { x: 0, y: 0 },
      hidden: true,
    });

    // Edge: Product → Theme
    edges.push({
      id: `e-product-${product.id}-${themeId}`,
      source: productNodeId,
      target: themeId,
      type: "smoothstep",
      style: { stroke: "hsl(170 35% 55%)", strokeWidth: 1.5, opacity: 0.6 },
      hidden: true,
    });
  });

  // Product root node
  nodes.push({
    id: productNodeId,
    type: "product",
    data: {
      label:
        product.name?.length > 30
          ? product?.name?.slice(0, 30) + "..."
          : product?.name,
      score,
      reviewCount,
      category,
      expanded: false,
      childIds: themeChildIds,
      childCount: themeChildIds.length,
    },
    position: { x: 0, y: 0 },
    hidden: false,
  });

  return getLayoutedElements(nodes, edges);
}

/* ── Helpers ── */
function getAllDescendantIds(nodeId: string, nodes: any[]): string[] {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node?.data?.childIds?.length) return [];
  const directChildren: string[] = node.data.childIds;
  let all = [...directChildren];
  for (const cid of directChildren) {
    all = all.concat(getAllDescendantIds(cid, nodes));
  }
  return all;
}

export interface ExploreContentProps {
  analyticsData: any;
  productData: any;
  productId: string;
  onRefresh: () => void;
  viewMode: "accordion" | "graph" | "traditional";
  setViewMode: (mode: "accordion" | "graph" | "traditional") => void;
  hideExperimentTrigger?: boolean;
  isExperiment?: boolean;
  onStartExperiment?: () => void;
}

// --- Traditional Reviews View Subcomponent ---

function ExpandableText({
  text,
  limit = 200,
}: {
  text: string;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text && text.length > limit;

  return (
    <div className="space-y-1 mt-1">
      <p
        className={cn(
          "text-sm font-medium leading-relaxed text-foreground/80 whitespace-pre-wrap",
          !expanded && isLong && "line-clamp-4",
        )}
      >
        {text}
      </p>
      {isLong && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? "Read Less" : "Read More"}
        </button>
      )}
    </div>
  );
}

function TraditionalReviewsView({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["product-traditional-reviews", productId, page],
    queryFn: async () => {
      const res = await api.get(
        `/products/${productId}/reviews?page=${page}&size=20`,
      );
      return res.data;
    },
    enabled: !!productId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const reviews = data?.items || [];
  const totalPages = data?.pages || 1;

  if (reviews.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        No raw feedback has been collected for this product yet.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      {reviews.map((r: any) => (
        <Card
          key={r.id}
          className="border-border/30 bg-card/40 rounded-xl shadow-sm"
        >
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between pb-1 border-b border-border/10">
              <span className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-1">
                {r.source.includes("amazon")
                  ? "Amazon Review"
                  : r.source || "Consumer"}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
            {r.star_rating != null && (
              <div className="flex gap-0.5 mt-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Sparkles
                    key={s}
                    className={cn(
                      "h-3 w-3",
                      s <= r.star_rating
                        ? "text-amber-400 fill-amber-400"
                        : "text-muted-foreground/20",
                    )}
                  />
                ))}
              </div>
            )}
            <ExpandableText text={r.original_text || ""} />
          </CardContent>
        </Card>
      ))}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4 pb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
// -------------------------------------------

export function ExploreContentImpl({
  analyticsData,
  productData,
  productId,
  onRefresh: _onRefresh,
  viewMode,
  setViewMode,
  hideExperimentTrigger = false,
  isExperiment = false,
  onStartExperiment,
}: ExploreContentProps) {
  const queryClient = useQueryClient();
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [regenFocus, setRegenFocus] = useState("");

  const handleRegenerate = () => {
    regenerateSummary.mutate(regenFocus);
    setShowRegenModal(false);
    setRegenFocus("");
  };
  const { fitView, setCenter } = useReactFlow();
  const fitViewCalled = useRef(false);
  const matrixRef = useRef<HTMLDivElement>(null);
  const [searchQuery] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([] as any[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any[]);

  // ── Chatbot State ──
  const [chatQuery, setChatQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "ai"; content: string }[]
  >([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [activeRole, setActiveRole] = useState<"consumer" | "seller">(
    "consumer",
  );
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const regenerateSummary = useMutation({
    mutationFn: async (focus: string) => {
      const res = await api.post(`/products/${productId}/summary/regenerate`, {
        focus: focus || null,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-deep", productId],
      });
      queryClient.invalidateQueries({
        queryKey: ["product-analytics", productId],
      });
      toast.success("Summary Regenerated", {
        description: "The AI summary has been updated with fresh insights.",
      });
    },
    onError: (err: any) => {
      toast.error("Regeneration Failed", {
        description: err.message || "Failed to communicate with AI core.",
      });
    },
  });

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isChatLoading]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim() || isChatLoading || isChatStreaming) return;

    const userMsg = chatQuery;
    setChatQuery("");
    setChatHistory((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsChatLoading(true);

    try {
      const baseUrl = api.defaults.baseURL || "http://localhost:8000";
      const response = await fetch(`${baseUrl}/products/${productId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg }),
      });

      if (!response.ok) throw new Error("Failed to connect to AI");
      if (!response.body) throw new Error("No response body from AI");

      setIsChatLoading(false);
      setIsChatStreaming(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = "";

      // Add initial empty AI message
      setChatHistory((prev) => [...prev, { role: "ai", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMsg += chunk;

        setChatHistory((prev) => {
          const next = [...prev];
          if (next.length > 0) {
            next[next.length - 1].content = assistantMsg;
          }
          return next;
        });
      }
    } catch (err: any) {
      console.error("Chat Error:", err);
      setChatHistory((prev) => [
        ...prev,
        {
          role: "ai",
          content:
            "Sorry, I'm having trouble connecting to my brain right now. Please try again soon.",
        },
      ]);
    } finally {
      setIsChatLoading(false);
      setIsChatStreaming(false);
    }
  };

  const toggleNodeExpansion = useCallback(
    (nodeId: string) => {
      setNodes((prevNodes) => {
        const clickedNode = prevNodes.find((n) => n.id === nodeId);
        if (!clickedNode?.data?.childIds?.length) return prevNodes;
        const isExpanding = !clickedNode.data.expanded;
        if (isExpanding) {
          const siblingsToCollapse = prevNodes.filter(
            (n) =>
              n.type === clickedNode.type &&
              n.id !== clickedNode.id &&
              n.data?.expanded,
          );
          const siblingDescendantIds = new Set(
            siblingsToCollapse.flatMap((s) =>
              getAllDescendantIds(s.id, prevNodes),
            ),
          );
          const directChildIds = new Set(clickedNode.data.childIds as string[]);
          const nextNodes = prevNodes.map((node) => {
            if (node.id === nodeId)
              return { ...node, data: { ...node.data, expanded: true } };
            if (siblingsToCollapse.some((s) => s.id === node.id))
              return { ...node, data: { ...node.data, expanded: false } };
            if (siblingDescendantIds.has(node.id))
              return {
                ...node,
                hidden: true,
                data: { ...node.data, expanded: false },
              };
            if (directChildIds.has(node.id)) return { ...node, hidden: false };
            return node;
          });
          const layouted = getLayoutedElements(
            nextNodes.filter((n) => !n.hidden),
            edges.filter(
              (e) =>
                !nextNodes.find((n) => n.id === e.source)?.hidden &&
                !nextNodes.find((n) => n.id === e.target)?.hidden,
            ),
          );
          return nextNodes.map((n) => {
            const lNode = layouted.nodes.find((ln) => ln.id === n.id);
            return lNode ? { ...n, position: lNode.position } : n;
          });
        } else {
          const allDescendantIds = new Set(
            getAllDescendantIds(nodeId, prevNodes),
          );
          const nextNodes = prevNodes.map((node) => {
            if (node.id === nodeId)
              return { ...node, data: { ...node.data, expanded: false } };
            if (allDescendantIds.has(node.id))
              return {
                ...node,
                hidden: true,
                data: { ...node.data, expanded: false },
              };
            return node;
          });
          const layouted = getLayoutedElements(
            nextNodes.filter((n) => !n.hidden),
            edges.filter(
              (e) =>
                !nextNodes.find((n) => n.id === e.source)?.hidden &&
                !nextNodes.find((n) => n.id === e.target)?.hidden,
            ),
          );
          return nextNodes.map((n) => {
            const lNode = layouted.nodes.find((ln) => ln.id === n.id);
            return lNode ? { ...n, position: lNode.position } : n;
          });
        }
      });

      setTimeout(() => {
        setNodes((latestNodes) => {
          const hiddenNodeIds = new Set(
            latestNodes.filter((n) => n.hidden).map((n) => n.id),
          );
          setEdges((prevEdges) =>
            prevEdges.map((edge) => ({
              ...edge,
              hidden:
                hiddenNodeIds.has(edge.source) ||
                hiddenNodeIds.has(edge.target),
            })),
          );
          const clickedNode = latestNodes.find((n) => n.id === nodeId);
          if (clickedNode && !clickedNode.hidden) {
            setTimeout(
              () =>
                setCenter(
                  clickedNode.position.x + 100,
                  clickedNode.position.y + 40,
                  { zoom: 1.1, duration: 600 },
                ),
              50,
            );
          } else {
            setTimeout(() => fitView({ padding: 0.25, duration: 600 }), 50);
          }
          return latestNodes;
        });
      }, 10);
    },
    [setNodes, setEdges, fitView, setCenter, edges],
  );

  const handleNodeDoubleClick = useCallback(
    (_: any, node: any) => toggleNodeExpansion(node.id),
    [toggleNodeExpansion],
  );
  const expandAll = useCallback(() => {
    setNodes((nds) => {
      const expanded = nds.map((n) => ({
        ...n,
        hidden: false,
        data: { ...n.data, expanded: true },
      }));
      const layouted = getLayoutedElements(
        expanded,
        edges.map((e) => ({ ...e, hidden: false })),
      );
      return layouted.nodes;
    });
    setEdges((eds) => eds.map((e) => ({ ...e, hidden: false })));
    setTimeout(() => fitView({ padding: 0.15, duration: 800 }), 50);
  }, [setNodes, setEdges, fitView, edges]);

  const collapseAll = useCallback(() => {
    setNodes((nds) => {
      const collapsed = nds.map((n) => ({
        ...n,
        hidden: n.type !== "product",
        data: { ...n.data, expanded: false },
      }));
      const layouted = getLayoutedElements(
        collapsed.filter((n) => !n.hidden),
        [],
      );
      return collapsed.map((n) => {
        const lNode = layouted.nodes.find((ln: any) => ln.id === n.id);
        return lNode ? { ...n, position: lNode.position } : n;
      });
    });
    setTimeout(() => {
      setNodes((latest) => {
        const hiddenIds = new Set(
          latest.filter((n) => n.hidden).map((n) => n.id),
        );
        setEdges((prev) =>
          prev.map((e) => ({
            ...e,
            hidden: hiddenIds.has(e.source) || hiddenIds.has(e.target),
          })),
        );
        return latest;
      });
      fitView({ padding: 0.25, duration: 600 });
    }, 10);
  }, [setNodes, setEdges, fitView]);

  const resetLayout = useCallback(() => {
    if (productData && analyticsData) {
      const graph = buildGraphFromProduct(productData, analyticsData);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setTimeout(() => fitView({ padding: 0.25, duration: 600 }), 50);
    }
  }, [productData, analyticsData, setNodes, setEdges, fitView]);

  useEffect(() => {
    if (productData && analyticsData && nodes.length === 0) {
      const graph = buildGraphFromProduct(productData, analyticsData);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      fitViewCalled.current = false;
    }
  }, [productData, analyticsData, setNodes, setEdges, nodes.length]);

  useEffect(() => {
    if (nodes.length > 0 && !fitViewCalled.current) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.25, duration: 600 });
        fitViewCalled.current = true;
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [nodes, fitView]);

  const scrollToMatrix = useCallback(() => {
    matrixRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="flex flex-col animate-fade-in flex-1 overflow-y-auto scroll-smooth bg-background">
      {/* ── PAGE HERO ── */}
      <div className="px-4 md:px-8 pt-4 md:pt-6 pb-4 border-b border-border/20 bg-card/30">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link
            to="/products"
            className="hover:text-foreground transition-colors"
          >
            Products
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground/60 truncate max-w-[200px]">
            {analyticsData?.category || productData?.category || "Category"}
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-semibold text-[10px] uppercase tracking-widest">
            {productData?.name?.slice(0, 20) || "Product"}
          </span>
        </nav>

        {!isExperiment && (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="min-w-0">
                <h1 className="text-xl md:text-3xl font-black text-foreground uppercase max-w-2xl">
                  {productData?.name || "Product Analysis"}
                </h1>
                <div className="flex items-center gap-3 mt-1.5 overflow-x-auto no-scrollbar pb-1">
                  {productData?.overall_sentiment_score != null && (
                    <div
                      className={cn(
                        "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border shrink-0",
                        productData.overall_sentiment_score >= 0.7
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : productData.overall_sentiment_score >= 0.4
                            ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-600 border-rose-500/20",
                      )}
                    >
                      {productData.overall_sentiment_score >= 0.5 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {getSentimentVerdict(productData.overall_sentiment_score)}
                      <span className="opacity-60 font-medium">·</span>
                      {Math.round(productData.overall_sentiment_score * 100)}%
                    </div>
                  )}
                  {analyticsData?.review_count && (
                    <span className="text-[10px] text-muted-foreground font-medium shrink-0 whitespace-nowrap">
                      {analyticsData.review_count.toLocaleString()} reviews
                      analyzed
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
              <Tabs
                value={viewMode}
                onValueChange={(v) => setViewMode(v as any)}
                className="w-full sm:w-auto"
              >
                <TabsList className="h-10 w-full sm:w-auto bg-muted/60 border border-border/30">
                  <TabsTrigger
                    value="graph"
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-4"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Graph
                  </TabsTrigger>
                  <TabsTrigger
                    value="accordion"
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-4"
                  >
                    <ListTree className="h-3.5 w-3.5" />
                    Accordion
                  </TabsTrigger>
                  {!hideExperimentTrigger && (
                    <TabsTrigger
                      value="traditional"
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-4"
                    >
                      <Quote className="h-3.5 w-3.5" />
                      Traditional
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                {productData && productData.status !== "processing" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest border-border/50 hover:border-primary/50 hover:text-primary transition-all gap-2 h-10 px-4 py-2"
                    onClick={() => setShowRegenModal(true)}
                    disabled={regenerateSummary.isPending}
                  >
                    {regenerateSummary.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-3.5 w-3.5" />
                    )}
                    Regenerate
                  </Button>
                )}

                {!hideExperimentTrigger && (
                  <Button
                    size="sm"
                    onClick={onStartExperiment}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 font-black uppercase tracking-widest text-[10px] h-10 px-4 py-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-primary/30 transition-all"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    A/B Mission
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 md:px-8 pt-6 pb-32 flex flex-col gap-8 md:gap-10">
        {/* ── INTELLIGENCE MATRIX (immediately after hero) ── */}
        <div ref={matrixRef} className="scroll-mt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div className="w-full sm:w-auto">
              <h2 className="text-lg font-black tracking-tight text-foreground uppercase flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-primary" />
                Intelligence Matrix
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {viewMode === "accordion"
                  ? "Expand each theme to explore underlying consumer claims."
                  : "Double-click theme nodes to expand. Scroll to zoom, drag to pan."}
              </p>
            </div>
            {viewMode === "graph" && (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] font-black uppercase tracking-widest h-8 px-3 gap-1.5"
                  onClick={expandAll}
                >
                  <Maximize2 className="h-3.5 w-3.5" /> Expand All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] font-black uppercase tracking-widest h-8 px-3 gap-1.5"
                  onClick={collapseAll}
                >
                  <Minimize2 className="h-3.5 w-3.5" /> Collapse
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] font-black uppercase tracking-widest h-8 px-3 gap-1.5"
                  onClick={resetLayout}
                >
                  <RefreshCcw className="h-3.5 w-3.5" /> Reset
                </Button>
              </div>
            )}
          </div>

          <div className="h-[600px] rounded-2xl border border-border/40 bg-card/30 overflow-hidden shadow-sm">
            {viewMode === "traditional" ? (
              <TraditionalReviewsView productId={productId} />
            ) : viewMode === "accordion" ? (
              <div className="h-full overflow-y-auto p-6">
                <HYVEAccordion
                  themes={productData?.themes || []}
                  searchQuery={searchQuery}
                />
              </div>
            ) : (
              <div className="h-full relative">
                {nodes.length > 0 && (
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.25 }}
                    style={{ background: "transparent" }}
                    proOptions={{ hideAttribution: true }}
                    nodesDraggable={true}
                    nodesConnectable={false}
                    minZoom={0.2}
                    maxZoom={2}
                  >
                    <Background
                      gap={20}
                      size={1}
                      color="hsl(160 15% 88%)"
                      className="dark:opacity-20"
                    />
                    <Controls className="fill-foreground bg-card/80 border-border/50 shadow-lg rounded-xl" />
                  </ReactFlow>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── KPI SCORECARD ── */}
        {productData && analyticsData && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Positive Score",
                value: `${Math.round((productData.overall_sentiment_score || 0) * 100)}%`,
                sub: "Higher is better",
                color:
                  productData.overall_sentiment_score >= 0.7
                    ? "text-emerald-600"
                    : productData.overall_sentiment_score >= 0.4
                      ? "text-amber-600"
                      : "text-rose-600",
              },
              {
                label: "Reviews Analyzed",
                value: (analyticsData.review_count || 0).toLocaleString(),
                sub: "Verified consumer records",
                color: "text-foreground",
              },
              {
                label: "Theme Clusters",
                value: productData.themes?.length ?? "—",
                sub: "AI-extracted topic groups",
                color: "text-primary",
              },
              {
                label: "Top Theme",
                value: analyticsData.theme_breakdown?.[0]?.name ?? "—",
                sub: `${analyticsData.theme_breakdown?.[0]?.claim_count ?? 0} mentions`,
                color: "text-foreground",
                truncate: true,
              },
            ].map((kpi, i) => (
              <Card
                key={i}
                className="border-border/30 bg-card/40 rounded-2xl shadow-sm hover:shadow-md hover:border-border/60 transition-all"
              >
                <CardContent className="p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
                    {kpi.label}
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-black tracking-tight",
                      kpi.color,
                      kpi.truncate && "truncate text-lg",
                    )}
                  >
                    {kpi.value}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                    {kpi.sub}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── CONSUMER THEME INSIGHTS ── */}
        {productData &&
          analyticsData &&
          analyticsData.theme_breakdown?.length > 0 && (
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                <div className="w-full sm:w-auto">
                  <h2 className="text-lg font-black tracking-tight text-foreground uppercase flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-primary" />
                    Consumer Insights
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Thematic breakdown — click any card to jump to the
                    Intelligence Matrix
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest w-full sm:w-auto">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    Positive
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-rose-500" />
                    Negative
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {analyticsData.theme_breakdown.map((theme: any) => (
                  <Card
                    key={theme.id}
                    className="border-border/30 bg-card/40 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group rounded-2xl"
                    onClick={scrollToMatrix}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-black truncate group-hover:text-primary transition-colors">
                            {theme.name}
                          </h4>
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                            {theme.claim_count} mentions
                          </p>
                        </div>
                        <div
                          className={cn(
                            "ml-3 shrink-0 text-sm font-black tabular-nums",
                            theme.positive_ratio >= 0.7
                              ? "text-emerald-600"
                              : theme.positive_ratio >= 0.4
                                ? "text-amber-600"
                                : "text-rose-600",
                          )}
                        >
                          {Math.round(theme.positive_ratio * 100)}%
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-700"
                          style={{ width: `${theme.positive_ratio * 100}%` }}
                        />
                        <div
                          className="h-full bg-rose-500 transition-all duration-700"
                          style={{
                            width: `${(1 - theme.positive_ratio) * 100}%`,
                          }}
                        />
                      </div>
                      <p
                        className={cn(
                          "text-[9px] font-black uppercase tracking-widest mt-2",
                          theme.positive_ratio >= 0.7
                            ? "text-emerald-600"
                            : theme.positive_ratio >= 0.4
                              ? "text-amber-600"
                              : "text-rose-600",
                        )}
                      >
                        {theme.positive_ratio >= 0.85
                          ? "Excellent"
                          : theme.positive_ratio >= 0.7
                            ? "Positive"
                            : theme.positive_ratio >= 0.5
                              ? "Moderate"
                              : theme.positive_ratio >= 0.3
                                ? "Mixed"
                                : "Critical"}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

        {/* ── DUAL COLUMN: SYNTHESIS (left) + MARKET FINDINGS (right) ── */}
        {productData &&
          productData.status !== "processing" &&
          !isExperiment && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              {/* LEFT: AI Synthesis (3/5 width) */}
              <div className="lg:col-span-3 flex flex-col gap-6">
                <Card className="border-border/30 bg-card/40 rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader className="px-8 pt-8 pb-6 border-b border-border/20">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
                          <Sparkles className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-xl font-black uppercase tracking-tight">
                            Executive Synthesis
                          </CardTitle>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-0.5">
                            AI Intelligence Engine ·{" "}
                            {Math.round(
                              (productData.overall_sentiment_score || 0) * 100,
                            )}
                            % positive sentiment
                          </p>
                        </div>
                      </div>

                      {/* Role Toggle */}
                      <Tabs
                        value={activeRole}
                        onValueChange={(v: any) => setActiveRole(v)}
                        className="bg-muted/50 p-1 rounded-xl h-9 w-full sm:w-auto overflow-x-auto no-scrollbar"
                      >
                        <TabsList className="bg-transparent border-none h-7 flex w-full min-w-full">
                          <TabsTrigger
                            value="consumer"
                            className="text-[10px] flex-1 font-black uppercase tracking-widest px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg"
                          >
                            Consumer
                          </TabsTrigger>
                          <TabsTrigger
                            value="seller"
                            className="text-[10px] flex-1 font-black uppercase tracking-widest px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg"
                          >
                            Business
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 space-y-6">
                    <div className="relative">
                      <Quote className="absolute -top-2 -left-1 h-8 w-8 text-primary/10" />
                      <div className="text-lg leading-relaxed font-semibold text-foreground/90 italic pl-6 prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {activeRole === "seller"
                            ? productData.summary_seller ||
                              "No business-specific synthesis available yet."
                            : productData.summary ||
                              "No consumer synthesis available for this product."}
                        </ReactMarkdown>
                      </div>
                    </div>

                    <div className="p-5 rounded-xl bg-muted/40 border border-border/20 flex items-start gap-4">
                      <div className="h-9 w-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">
                          AI Strategic Recommendation
                        </p>
                        <p className="text-sm font-medium text-foreground/80 leading-relaxed">
                          Based on deep vector analysis, this product shows{" "}
                          <span
                            className={cn(
                              "font-black",
                              getSentimentColor(
                                productData.overall_sentiment_score,
                              ),
                            )}
                          >
                            {productData.overall_sentiment_score > 0.7
                              ? "superior"
                              : productData.overall_sentiment_score > 0.4
                                ? "resilient"
                                : "highly volatile"}
                          </span>{" "}
                          market traction.
                          {productData.overall_sentiment_score > 0.7
                            ? " The consumer base responds well to established themes. Focus on expansion and premium positioning."
                            : productData.overall_sentiment_score > 0.4
                              ? " Mixed reception suggests specific feature friction. Address identified pain-points to stabilize growth."
                              : " Critical sentiment clusters identified. Immediate strategic pivot or hardware refinement required."}
                        </p>
                        <p className="text-[9px] text-muted-foreground/50 italic font-medium mt-3 pt-3 border-t border-border/20 flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                          Synthesis based on probabilistic thematic clustering
                          of verified consumer signals.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Actionable Strategies */}
                {(() => {
                  let advices: string[] = [];
                  try {
                    const rawAdvices =
                      activeRole === "seller"
                        ? productData?.advices_seller
                        : productData?.advices;
                    advices = rawAdvices ? JSON.parse(rawAdvices) : [];
                  } catch {
                    // do nothing
                  }
                  if (!advices.length) return null;
                  return (
                    <Card className="border-border/30 bg-card/40 rounded-2xl shadow-sm">
                      <CardHeader className="px-8 pt-7 pb-5 border-b border-border/20">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                            <Zap className="h-4.5 w-4.5 text-emerald-500" />
                          </div>
                          <div>
                            <CardTitle className="text-base font-black uppercase tracking-tight">
                              {activeRole === "seller"
                                ? "Business Strategies"
                                : "Actionable Strategies"}
                            </CardTitle>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-0.5">
                              AI-identified optimization paths
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="grid grid-cols-1 gap-3">
                          {advices.map((advice: string, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-start gap-4 p-4 rounded-xl bg-background border border-border/30 hover:border-emerald-500/30 hover:bg-emerald-500/2 transition-all"
                            >
                              <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-xs font-black shrink-0">
                                {idx + 1}
                              </div>
                              <p className="text-sm font-medium leading-relaxed text-foreground/80">
                                {advice}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>

              {/* RIGHT: Market Findings (2/5 width) */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                {(() => {
                  const themes: any[] = productData.themes || [];

                  // Strict mutual exclusion: sort all themes by positive_ratio
                  // Strengths: positive_ratio >= 0.6 (majority positive), sorted desc
                  // Risks: positive_ratio < 0.5 (majority negative/neutral), sorted asc
                  // Themes in 0.5–0.6 range are "mixed" — shown in neither to avoid confusion
                  const strengthThemes = themes
                    .filter((t: any) => t.positive_ratio >= 0.6)
                    .sort(
                      (a: any, b: any) => b.positive_ratio - a.positive_ratio,
                    )
                    .slice(0, 4);

                  const riskThemes = themes
                    .filter((t: any) => t.positive_ratio < 0.5)
                    .sort(
                      (a: any, b: any) => a.positive_ratio - b.positive_ratio,
                    )
                    .slice(0, 4);

                  // Helper: get the most representative claim for a theme
                  const topClaim = (
                    theme: any,
                    polarity: "positive" | "negative",
                  ) => {
                    const filtered = (theme.claims || []).filter(
                      (c: any) => c.sentiment_polarity === polarity,
                    );
                    if (!filtered.length) return (theme.claims || [])[0];
                    return filtered.sort(
                      (a: any, b: any) =>
                        (b.mention_count || 1) * (b.severity || 0.1) -
                        (a.mention_count || 1) * (a.severity || 0.1),
                    )[0];
                  };

                  return (
                    <>
                      {/* Market Strengths */}
                      <Card className="border-emerald-500/20 bg-emerald-500/3 rounded-2xl shadow-sm">
                        <CardHeader className="px-6 pt-6 pb-4 border-b border-emerald-500/15">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                              <ThumbsUp className="h-4.5 w-4.5 text-emerald-600" />
                            </div>
                            <div>
                              <CardTitle className="text-base font-black uppercase tracking-tight text-emerald-700 dark:text-emerald-400">
                                Market Strengths
                              </CardTitle>
                              <p className="text-[10px] text-emerald-600/60 font-bold uppercase tracking-widest mt-0.5">
                                Themes with majority positive sentiment
                              </p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4">
                          {strengthThemes.length === 0 && (
                            <p className="text-xs text-muted-foreground/50 font-medium italic py-2">
                              No predominantly positive themes found.
                            </p>
                          )}
                          {strengthThemes.map((theme: any, idx: number) => {
                            const claim = topClaim(theme, "positive");
                            return (
                              <div
                                key={theme.id}
                                className="flex items-start gap-3"
                              >
                                <span className="text-base font-black text-emerald-500/30 tabular-nums shrink-0 w-6 pt-0.5">
                                  {String(idx + 1).padStart(2, "0")}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className="text-sm font-black text-foreground/90 truncate">
                                      {theme.name}
                                    </p>
                                    <span className="text-xs font-black text-emerald-600 tabular-nums shrink-0">
                                      {Math.round(theme.positive_ratio * 100)}%
                                    </span>
                                  </div>
                                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden mb-1.5">
                                    <div
                                      className="h-full bg-emerald-500 rounded-full"
                                      style={{
                                        width: `${theme.positive_ratio * 100}%`,
                                      }}
                                    />
                                  </div>
                                  {claim && (
                                    <p className="text-[11px] text-muted-foreground/70 font-medium leading-snug line-clamp-2">
                                      "{claim.claim_text}"
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>

                      {/* Market Risks */}
                      <Card className="border-rose-500/20 bg-rose-500/3 rounded-2xl shadow-sm">
                        <CardHeader className="px-6 pt-6 pb-4 border-b border-rose-500/15">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 bg-rose-500/15 rounded-xl flex items-center justify-center">
                              <ThumbsDown className="h-4.5 w-4.5 text-rose-600" />
                            </div>
                            <div>
                              <CardTitle className="text-base font-black uppercase tracking-tight text-rose-700 dark:text-rose-400">
                                Market Risks
                              </CardTitle>
                              <p className="text-[10px] text-rose-600/60 font-bold uppercase tracking-widest mt-0.5">
                                Themes with majority negative sentiment
                              </p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4">
                          {riskThemes.length === 0 && (
                            <p className="text-xs text-muted-foreground/50 font-medium italic py-2">
                              No predominantly negative themes found.
                            </p>
                          )}
                          {riskThemes.map((theme: any, idx: number) => {
                            const claim = topClaim(theme, "negative");
                            return (
                              <div
                                key={theme.id}
                                className="flex items-start gap-3"
                              >
                                <span className="text-base font-black text-rose-500/30 tabular-nums shrink-0 w-6 pt-0.5">
                                  {String(idx + 1).padStart(2, "0")}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className="text-sm font-black text-foreground/90 truncate">
                                      {theme.name}
                                    </p>
                                    <span className="text-xs font-black text-rose-600 tabular-nums shrink-0">
                                      {Math.round(
                                        (1 - theme.positive_ratio) * 100,
                                      )}
                                      % neg
                                    </span>
                                  </div>
                                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden mb-1.5">
                                    <div
                                      className="h-full bg-rose-500 rounded-full"
                                      style={{
                                        width: `${(1 - theme.positive_ratio) * 100}%`,
                                      }}
                                    />
                                  </div>
                                  {claim && (
                                    <p className="text-[11px] text-muted-foreground/70 font-medium leading-snug line-clamp-2">
                                      "{claim.claim_text}"
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
      </div>

      {/* Regeneration Modal */}
      <Dialog open={showRegenModal} onOpenChange={setShowRegenModal}>
        <DialogContent className="sm:max-w-[560px] border-border/40 bg-card rounded-2xl p-8 shadow-2xl">
          <DialogHeader className="items-center text-center pb-5 border-b border-border/20">
            <div className="h-12 w-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-black tracking-tighter uppercase">
              Regenerate Synthesis
            </DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
              Refine the AI perspective
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-4">
            <div>
              <Label
                htmlFor="regen-focus"
                className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2 block"
              >
                Focus Direction (optional)
              </Label>
              <Textarea
                id="regen-focus"
                placeholder="e.g. Prioritize battery life feedback and build quality friction points..."
                className="min-h-[120px] bg-muted/40 border-border/40 focus:border-primary/50 transition-all rounded-xl p-4 text-sm font-medium resize-none"
                value={regenFocus}
                onChange={(e) => setRegenFocus(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground/60 font-medium mt-2 flex items-center gap-1.5">
                <Info className="h-3 w-3 shrink-0" />
                Leave empty for a balanced analysis across all themes.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-3 flex sm:justify-end">
            <Button
              variant="ghost"
              className="font-black text-[10px] uppercase tracking-widest h-10 px-6"
              onClick={() => {
                setShowRegenModal(false);
                setRegenFocus("");
              }}
            >
              Cancel
            </Button>
            <Button
              className="font-black text-xs uppercase tracking-widest h-10 px-8 gap-2"
              onClick={handleRegenerate}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── FLOATING CHATBOT ── */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-4">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-80 md:w-96 h-125 -mb-12"
            >
              <Card className="h-full border-border/40 shadow-2xl flex flex-col overflow-hidden bg-background">
                <div className="p-4 border-b border-border/20 flex items-center justify-between bg-card/60 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h3 className="font-bold text-sm">Hyve Mind</h3>
                  </div>
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setIsChatOpen(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div
                  ref={chatScrollRef}
                  className="flex-1 p-4 overflow-y-auto space-y-3 text-sm font-medium"
                >
                  <div className="bg-muted p-3 rounded-xl rounded-tl-none text-foreground/80 max-w-[90%] border border-border/30 text-sm">
                    Hi! Have any specific questions about {productData?.name}?
                    I'll answer using real consumer feedback only.
                  </div>
                  {chatHistory.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={cn(
                          "p-3 rounded-xl max-w-[90%] text-sm",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-none"
                            : "bg-muted text-foreground/80 rounded-tl-none border border-border/30",
                        )}
                      >
                        {msg.role === "ai" ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted-foreground/10 prose-pre:p-2 prose-pre:rounded-lg">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted p-3 rounded-xl rounded-tl-none flex items-center gap-1.5 border border-border/30">
                        {[0, 150, 300].map((d) => (
                          <div
                            key={d}
                            className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 border-t border-border/20 bg-background/50 shrink-0">
                  <form
                    onSubmit={handleChatSubmit}
                    className="relative flex items-center"
                  >
                    <Input
                      placeholder="Ask about this product..."
                      className="pr-10 bg-background text-sm rounded-lg"
                      value={chatQuery}
                      onChange={(e) => setChatQuery(e.target.value)}
                      disabled={isChatLoading}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 h-8 w-8 text-muted-foreground hover:text-primary"
                      disabled={isChatLoading || !chatQuery.trim()}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          size="icon"
          className={cn(
            "h-12 w-12 rounded-full shadow-xl transition-all duration-300",
            isChatOpen
              ? "rotate-90 scale-75 translate-y-4 opacity-80"
              : "hover:scale-110 active:scale-95",
          )}
          onClick={() => setIsChatOpen((prev) => !prev)}
        >
          <Sparkles className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

export default function ExploreContent(props: ExploreContentProps) {
  return (
    <ReactFlowProvider>
      <ExploreContentImpl {...props} />
    </ReactFlowProvider>
  );
}
