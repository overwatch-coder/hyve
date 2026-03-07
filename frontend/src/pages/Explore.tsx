import { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import HYVEAccordion from "@/components/HYVEAccordion";
import ExperimentMode from "@/components/ExperimentMode";
import {
  LayoutGrid,
  ListTree,
  Play,
  Search as SearchIcon,
  X,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCcw,
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowRight,
  GitBranch,
  Info,
  Loader2,
  Bot,
  Zap,
  Quote,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "framer-motion";

import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  ProductNode,
  ClaimNode,
  SummaryNode,
  ThemeNode,
  SentimentNode,
} from "@/components/graph-nodes";

/* ── Custom node-type registry ── */
const nodeTypes = {
  product: ProductNode,
  theme: ThemeNode,
  sentiment: SentimentNode,
  claim: ClaimNode,
  summary: SummaryNode,
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
    if (node.type === "summary") {
      w = 320;
      h = 200;
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
   (No intermediate Sentiment layer)
   ────────────────────────────────────────────── */
function buildGraphFromProduct(product: any, analyticsData: any) {
  const nodes: any[] = [];
  const edges: any[] = [];

  const productNodeId = `product-${product.id}`;
  const themeChildIds: string[] = [];

  const score = analyticsData
    ? Math.round(analyticsData.overall_sentiment * 100)
    : 0;
  const reviewCount = analyticsData?.review_count ?? 0;
  const category = analyticsData?.category ?? product.category ?? "";

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
          },
          position: { x: 0, y: 0 },
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

      nodes.push({
        id: posSentimentId,
        type: "sentiment",
        data: {
          label: "Pros",
          type: "pos",
          expanded: false,
          childIds: claimIds,
          childCount: claimIds.length,
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
          },
          position: { x: 0, y: 0 },
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

      nodes.push({
        id: negSentimentId,
        type: "sentiment",
        data: {
          label: "Cons",
          type: "neg",
          expanded: false,
          childIds: claimIds,
          childCount: claimIds.length,
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
      label: product.name,
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

/* ══════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════ */
function ExploreInner() {
  const { productId } = useParams<{ productId: string }>();
  const { fitView, setCenter } = useReactFlow();
  const fitViewCalled = useRef(false);

  const [viewMode, setViewMode] = useState<"accordion" | "graph">("graph");
  const [searchQuery, setSearchQuery] = useState("");
  const [isExperimentMode, setIsExperimentMode] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // FETCH: Deep Product Structure (Tree & Claims)
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
    refetchInterval: (q) =>
      q.state.data?.status === "processing" ? 3000 : false,
  });

  // FETCH: Product Analytics
  const { data: analyticsData } = useQuery({
    queryKey: ["product-analytics", productId],
    queryFn: async () => {
      const res = await api.get(`/products/${productId}/analytics`);
      return res.data;
    },
    enabled: !!productId,
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([] as any[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any[]);

  // ── Chatbot State ──
  const [chatQuery, setChatQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "ai"; content: string }[]
  >([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isChatLoading]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim() || isChatLoading) return;

    const userMsg = chatQuery;
    setChatQuery("");
    setChatHistory((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsChatLoading(true);

    try {
      const res = await api.post(`/products/${productId}/chat`, {
        query: userMsg,
      });
      setChatHistory((prev) => [
        ...prev,
        { role: "ai", content: res.data.answer },
      ]);
    } catch {
      setChatHistory((prev) => [
        ...prev,
        {
          role: "ai",
          content: "Sorry, I couldn't reach the server. Please try again.",
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  /* ── Toggle node expansion (used by double-click) ── */
  const toggleNodeExpansion = useCallback(
    (nodeId: string) => {
      setNodes((prevNodes) => {
        const clickedNode = prevNodes.find((n) => n.id === nodeId);
        if (!clickedNode?.data?.childIds?.length) return prevNodes;

        const isExpanding = !clickedNode.data.expanded;

        if (isExpanding) {
          // Collapse siblings of same type
          const siblingsToCollapse = prevNodes.filter(
            (n) =>
              n.type === clickedNode.type &&
              n.id !== clickedNode.id &&
              n.data?.expanded,
          );

          const siblingDescendantIds = new Set(
            siblingsToCollapse.flatMap((sibling) =>
              getAllDescendantIds(sibling.id, prevNodes),
            ),
          );

          const directChildIds = new Set(clickedNode.data.childIds as string[]);

          let nextNodes = prevNodes.map((node) => {
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

          // Re-layout visible nodes
          const visibleNodes = nextNodes.filter((n) => !n.hidden);
          const visibleEdges = edges.filter(
            (e) =>
              !nextNodes.find((n) => n.id === e.source)?.hidden &&
              !nextNodes.find((n) => n.id === e.target)?.hidden,
          );
          const layouted = getLayoutedElements(visibleNodes, visibleEdges);

          nextNodes = nextNodes.map((n) => {
            const lNode = layouted.nodes.find((ln) => ln.id === n.id);
            if (lNode) return { ...n, position: lNode.position };
            return n;
          });

          return nextNodes;
        } else {
          // Collapse: hide all descendants
          const allDescendantIds = new Set(
            getAllDescendantIds(nodeId, prevNodes),
          );
          let nextNodes = prevNodes.map((node) => {
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

          const visibleNodes = nextNodes.filter((n) => !n.hidden);
          const visibleEdges = edges.filter(
            (e) =>
              !nextNodes.find((n) => n.id === e.source)?.hidden &&
              !nextNodes.find((n) => n.id === e.target)?.hidden,
          );
          const layouted = getLayoutedElements(visibleNodes, visibleEdges);

          nextNodes = nextNodes.map((n) => {
            const lNode = layouted.nodes.find((ln) => ln.id === n.id);
            if (lNode) return { ...n, position: lNode.position };
            return n;
          });

          return nextNodes;
        }
      });

      // Sync edge visibility & auto-pan
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

          // Auto-pan: find the clicked node and center on it
          const clickedNode = latestNodes.find((n) => n.id === nodeId);
          if (clickedNode && !clickedNode.hidden) {
            setTimeout(() => {
              setCenter(
                clickedNode.position.x + 100,
                clickedNode.position.y + 40,
                { zoom: 1.1, duration: 600 },
              );
            }, 50);
          } else {
            setTimeout(() => fitView({ padding: 0.25, duration: 600 }), 50);
          }

          return latestNodes;
        });
      }, 10);
    },
    [setNodes, setEdges, fitView, setCenter, edges],
  );

  /* ── Double-click handler ── */
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      toggleNodeExpansion(node.id);
    },
    [toggleNodeExpansion],
  );

  const expandAll = useCallback(() => {
    setNodes((nds) => {
      const expandedNodes = nds.map((node) => ({
        ...node,
        hidden: false,
        data: { ...node.data, expanded: true },
      }));
      const layouted = getLayoutedElements(
        expandedNodes,
        edges.map((e) => ({ ...e, hidden: false })),
      );
      return layouted.nodes;
    });
    setEdges((eds) => eds.map((edge) => ({ ...edge, hidden: false })));
    setTimeout(() => fitView({ padding: 0.15, duration: 800 }), 50);
  }, [setNodes, setEdges, fitView, edges]);

  const collapseAll = useCallback(() => {
    setNodes((nds) => {
      const collapsedNodes = nds.map((node) => ({
        ...node,
        hidden: node.type !== "product",
        data: { ...node.data, expanded: false },
      }));
      const layouted = getLayoutedElements(
        collapsedNodes.filter((n) => !n.hidden),
        [],
      );
      return collapsedNodes.map((n) => {
        const lNode = layouted.nodes.find((ln: any) => ln.id === n.id);
        if (lNode) return { ...n, position: lNode.position };
        return n;
      });
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
              hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target),
          })),
        );
        return latestNodes;
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
  }, [productData, analyticsData, setNodes, setEdges]);

  useEffect(() => {
    if (nodes.length > 0 && !fitViewCalled.current) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.25, duration: 600 });
        fitViewCalled.current = true;
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [nodes, fitView]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground gap-4">
        <div className="h-10 w-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="font-semibold text-lg animate-pulse">
          Initializing HYVE Intelligence...
        </p>
      </div>
    );
  }

  if (isError || !productData) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Failed to load product map.
      </div>
    );
  }

  // ── Processing UI ──
  if (productData.status === "processing" || !analyticsData) {
    const currentStep =
      productData.processing_step || "Initializing AI Pipeline";

    const allStages = [
      {
        id: "ingest",
        label: "Cleaning & Parsing Data",
        icon: Sparkles,
        keywords: ["cleaning", "parsing", "grouping", "directing", "ingest"],
      },
      {
        id: "scraping",
        label: "Crawling URL & Sources",
        icon: SearchIcon,
        keywords: ["scraping", "crawling", "discovery"],
      },
      {
        id: "claims",
        label: "Extracting Consumer Claims",
        icon: Zap,
        keywords: ["extracting", "claims", "distilling"],
      },
      {
        id: "sentiment",
        label: "Analyzing Sentiment Polarity",
        icon: ArrowRight,
        keywords: ["sentiment", "polarity", "analysing"],
      },
      {
        id: "clustering",
        label: "Thematic Clustering",
        icon: GitBranch,
        keywords: ["clustering", "harmonizing", "thematic", "synthesis"],
      },
      {
        id: "summary",
        label: "Generating Recommendation Engine",
        icon: Bot,
        keywords: ["summary", "advice", "recommendations", "synthesizing"],
      },
    ];

    // Determine current stage index based on keyword matching
    const currentStageIndex = allStages.findIndex((s) =>
      s.keywords.some((k) => currentStep.toLowerCase().includes(k)),
    );

    return (
      <div className="max-w-4xl mx-auto py-20 px-6 animate-in fade-in zoom-in duration-700">
        <Card className="border-border/40 bg-card overflow-hidden shadow-2xl">
          <CardContent className="p-0">
            <div className="p-8 border-b border-border/20 bg-primary/2">
              <div className="flex items-center gap-6 mb-8">
                <div className="h-20 w-20 bg-primary/10 rounded-3xl flex items-center justify-center relative">
                  <Bot className="h-10 w-10 text-primary animate-bounce shadow-inner" />
                  <div className="absolute -top-1 -right-1 h-5 w-5 bg-emerald-500 rounded-full border-4 border-card animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-3xl font-black tracking-tight">
                    {productData.name}
                  </h1>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20">
                      Live Analysis
                    </span>
                    <p className="text-muted-foreground font-medium text-sm flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {currentStep}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                {allStages.map((stage, i) => {
                  const isCompleted = i < currentStageIndex;
                  const isActive = i === currentStageIndex;

                  return (
                    <div
                      key={stage.id}
                      className={`flex items-center gap-4 transition-all duration-500 ${!isActive && !isCompleted ? "opacity-40 grayscale" : ""}`}
                    >
                      <div
                        className={`h-10 w-10 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                          isCompleted
                            ? "bg-emerald-500/10 text-emerald-500"
                            : isActive
                              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110"
                              : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <stage.icon
                            className={`h-5 w-5 ${isActive ? "animate-pulse" : ""}`}
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span
                            className={`text-sm font-bold ${isActive ? "text-primary" : ""}`}
                          >
                            {stage.label}
                          </span>
                          {isActive && (
                            <span className="text-[9px] font-black uppercase tracking-widest animate-pulse">
                              Running
                            </span>
                          )}
                        </div>
                        <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-1000 ${isCompleted ? "w-full bg-emerald-500" : isActive ? "bg-primary animate-progress-indefinite" : "w-0"}`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6 bg-muted/30 flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground font-medium max-w-md">
                We are processing thousands of consumer claims to build your
                decision map.
                <span className="text-foreground font-bold">
                  {" "}
                  This page will automatically update
                </span>{" "}
                once the analysis is ready.
              </p>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
                Live Processing
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Compute top Pros and Cons ──
  let allClaims: any[] = [];
  productData.themes?.forEach((t: any) => {
    if (t.claims) allClaims = allClaims.concat(t.claims);
  });

  const pros = allClaims
    .filter((c) => c.sentiment_polarity === "positive")
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3);
  const cons = allClaims
    .filter((c) => c.sentiment_polarity === "negative")
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3);

  const score = Math.round(analyticsData.overall_sentiment * 100);

  return (
    <div className="flex flex-col gap-6 animate-fade-in min-h-[calc(100vh-8rem)]">
      {/* ── BREADCRUMBS & HEADER ── */}
      <div className="flex flex-col gap-2">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link
            to="/products"
            className="hover:text-foreground transition-colors"
          >
            Products
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium truncate max-w-[200px]">
            {analyticsData.category}
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-medium">{productData.name}</span>
        </nav>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight mt-1">
              {productData.name}
            </h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── SUMMARY & SCORE WIDGET ── */}
        <div className="lg:col-span-1">
          <Card className="border-border/40 bg-card overflow-hidden h-full flex flex-col">
            <CardContent className="p-6 flex-1 flex flex-col justify-between">
              <div className="flex items-start gap-6 mb-6">
                <div
                  className={`shrink-0 flex flex-col items-center justify-center h-24 w-24 rounded-2xl ${score >= 70 ? "bg-emerald-500 text-white" : score >= 40 ? "bg-amber-500 text-white" : "bg-rose-500 text-white"}`}
                >
                  <span className="text-4xl font-black leading-none">
                    {score}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">
                    / 100
                  </span>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div
                      className={`h-2 w-2 rounded-full ${score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                    />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Overall Verdict
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground/90 leading-relaxed">
                    {productData.summary ||
                      "This product sets the bar for its category, though some hardware specs lag behind the price point."}
                  </p>
                </div>
              </div>

              <div className="space-y-2 mt-auto">
                <div className="flex justify-between text-[11px] font-black uppercase text-muted-foreground">
                  <span className="text-emerald-500">{score}% positive</span>
                  <span className="text-rose-500">{100 - score}% negative</span>
                </div>
                <div className="w-full h-2.5 bg-secondary rounded-full flex overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${score}%` }}
                  />
                  <div
                    className="h-full bg-rose-500"
                    style={{ width: `${100 - score}%` }}
                  />
                </div>
                <p className="text-xs font-semibold text-muted-foreground pt-1">
                  Based on{" "}
                  <span className="text-foreground">
                    {analyticsData.review_count}
                  </span>{" "}
                  verified reviews
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── PROS & CONS LIST ── */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <Card className="border-border/30 shadow-sm flex-1">
            <CardContent className="p-5">
              <h3 className="text-xs font-black uppercase tracking-wider text-emerald-500 mb-4">
                Pros
              </h3>
              <ul className="space-y-3">
                {pros.map((c) => (
                  <li
                    key={c.id}
                    className="flex gap-3 text-sm font-medium text-foreground/80"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                    <span>{c.claim_text}</span>
                  </li>
                ))}
                {pros.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No definitive pros found.
                  </p>
                )}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border/30 shadow-sm flex-1">
            <CardContent className="p-5">
              <h3 className="text-xs font-black uppercase tracking-wider text-rose-500 mb-4">
                Cons
              </h3>
              <ul className="space-y-3">
                {cons.map((c) => (
                  <li
                    key={c.id}
                    className="flex gap-3 text-sm font-medium text-foreground/80"
                  >
                    <XCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                    <span>{c.claim_text}</span>
                  </li>
                ))}
                {cons.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No definitive cons found.
                  </p>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* ── THEME CARDS ── */}
        <div className="lg:col-span-1 flex flex-col gap-3">
          {analyticsData.theme_breakdown.map((theme: any) => (
            <Link
              key={theme.id}
              to={`/products/${productId}/theme/${theme.id}`}
              className="block h-full cursor-pointer group"
            >
              <Card className="border-border/40 hover:border-primary/50 transition-colors h-full flex items-center shadow-sm">
                <CardContent className="p-4 w-full flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-bold text-sm mb-1 group-hover:text-primary transition-colors">
                      {theme.name}
                    </h4>
                    <p className="text-xs text-muted-foreground font-medium mb-2">
                      {theme.claim_count} mentions
                    </p>

                    <div className="w-full h-1.5 bg-secondary rounded-full flex overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${theme.positive_ratio * 100}%` }}
                      />
                      <div
                        className="h-full bg-rose-500"
                        style={{
                          width: `${(1 - theme.positive_ratio) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* ── DECISION MAP & CHATBOT ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-4">
        <div className="flex items-center gap-2 text-foreground/90">
          <GitBranch className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">
            Consumer Insights
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search Bar */}
          <div className="relative w-full md:w-64">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search claims..."
              className="pl-9 bg-card border-border/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as any)}
            className="w-auto"
          >
            <TabsList className="grid grid-cols-2 w-[220px]">
              <TabsTrigger
                value="accordion"
                className="flex items-center gap-2"
              >
                <ListTree className="h-3.5 w-3.5" />
                Accordion
              </TabsTrigger>
              <TabsTrigger value="graph" className="flex items-center gap-2">
                <LayoutGrid className="h-3.5 w-3.5" />
                Graph
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Experiment Trigger (A/B Testing) */}
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2 border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-all font-bold"
            onClick={() => setIsExperimentMode(true)}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>A/B TEST</span>
          </Button>
        </div>
      </div>

      {/* Instruction banner */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 bg-muted/50 rounded-lg border border-border/30">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <p>
            {viewMode === "accordion"
              ? "Expand themes to see grouped consumer claims and AI-generated product recommendations."
              : "Double-click a theme node to expand claims. Double-click a claim node to reveal supporting evidence."}
          </p>
        </div>
        {searchQuery && (
          <Badge
            variant="secondary"
            className="text-[10px] font-bold h-5 px-1.5 bg-primary/10 text-primary border-primary/20"
          >
            SEARCH ACTIVE
          </Badge>
        )}
      </div>

      <div className="flex-1 grid grid-cols-1 gap-6 min-h-[600px] pb-10">
        {/* MAIN VIEW AREA (Now full width) */}
        <div className="min-h-[600px]">
          {viewMode === "accordion" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <HYVEAccordion
                themes={productData.themes || []}
                searchQuery={searchQuery}
              />
            </div>
          ) : (
            <div className="h-full border border-border/50 rounded-2xl bg-[hsl(160_20%_97%)] dark:bg-card overflow-hidden relative shadow-inner">
              {nodes.length > 0 && (
                <>
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
                    minZoom={0.3}
                    maxZoom={2}
                  >
                    <Panel
                      position="top-right"
                      className="bg-card/80 backdrop-blur-md border border-border/50 p-2 rounded-lg shadow-xl m-4 flex flex-col gap-1"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start text-xs hover:text-primary transition-all"
                        onClick={expandAll}
                      >
                        <Maximize2 className="h-3.5 w-3.5 mr-2" /> Expand All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start text-xs hover:text-destructive transition-all"
                        onClick={collapseAll}
                      >
                        <Minimize2 className="h-3.5 w-3.5 mr-2" /> Collapse All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start text-xs"
                        onClick={resetLayout}
                      >
                        <RefreshCcw className="h-3.5 w-3.5 mr-2" /> Reset View
                      </Button>
                    </Panel>
                    <Background
                      gap={20}
                      size={1}
                      color="hsl(160 15% 88%)"
                      className="dark:opacity-20"
                    />
                    <Controls />
                  </ReactFlow>
                </>
              )}
            </div>
          )}

          {/* ── SUMMARY & ADVICE SECTION (Decoupled from Graph) ── */}
          {productData && productData.status !== "processing" && (
            <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <Card className="border-border/40 bg-card/60 backdrop-blur-xl shadow-2xl overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                  {/* Summary Side */}
                  <div className="lg:col-span-7 p-8 border-b lg:border-b-0 lg:border-r border-border/20">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                          Product Synthesis
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-widest border-primary/20 text-primary"
                          >
                            AI Core
                          </Badge>
                        </h3>
                        <p className="text-xs text-muted-foreground font-medium">
                          Holistic analysis of consumer sentiment
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <Quote className="absolute -top-2 -left-2 h-8 w-8 text-primary/5 -z-10" />
                      <p className="text-sm leading-relaxed font-medium text-foreground/80 italic">
                        "
                        {productData.summary ||
                          "No summary available for this product."}
                        "
                      </p>
                    </div>

                    <div className="mt-8 flex items-center gap-4 p-4 bg-muted/30 rounded-2xl border border-border/50">
                      <div className="flex-1">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
                          Overall Sentiment
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-linear-to-r from-red-500 via-yellow-500 to-emerald-500 transition-all duration-1000"
                              style={{
                                width: `${productData.overall_sentiment_score * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-black font-mono">
                            {(
                              productData.overall_sentiment_score * 100
                            ).toFixed(0)}
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Advice Side */}
                  <div className="lg:col-span-5 p-8 bg-primary/2">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="h-10 w-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                        <Zap className="h-5 w-5 text-emerald-500" />
                      </div>
                      <h3 className="text-lg font-black tracking-tight">
                        AI Strategies
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {(() => {
                        let advices: string[] = [];
                        try {
                          advices = productData.advices
                            ? JSON.parse(productData.advices)
                            : [];
                        } catch (e) {
                          console.error(e);
                        }

                        if (advices.length === 0)
                          return (
                            <p className="text-xs text-muted-foreground italic">
                              No specific strategies identified yet.
                            </p>
                          );

                        return advices.map((advice, idx) => (
                          <div
                            key={idx}
                            className="group flex gap-4 p-4 rounded-2xl bg-background/50 border border-border/40 hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-md"
                          >
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-[10px] font-black italic text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                              {idx + 1}
                            </div>
                            <p className="text-xs font-bold leading-relaxed text-foreground/80">
                              {advice}
                            </p>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ── FLOATING COLLAPSIBLE CHATBOT (Bottom Left) ── */}
      <div className="fixed bottom-6 left-6 z-40 flex flex-col items-start gap-4">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-80 md:w-96 h-[500px] mb-2"
            >
              <Card className="h-full border-primary/20 shadow-2xl flex flex-col overflow-hidden bg-background/95 backdrop-blur-xl">
                <div className="p-4 border-b border-border/30 flex items-center justify-between bg-primary/5 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="font-bold text-sm">Product AI Assistant</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsChatOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div
                  ref={chatScrollRef}
                  className="flex-1 p-4 overflow-y-auto space-y-4 text-sm font-medium"
                >
                  <div className="bg-muted p-3 rounded-xl rounded-tl-none text-foreground/80 max-w-[90%] border border-border/50">
                    Hi! Have any specific questions about the{" "}
                    {productData?.name}? Ask me anything and I'll answer
                    strictly using real consumer feedback.
                  </div>

                  {chatHistory.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={cn(
                          "p-3 rounded-xl max-w-[90%] shadow-sm",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-none"
                            : "bg-muted text-foreground/80 rounded-tl-none border border-border/50",
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted p-3 rounded-xl rounded-tl-none text-foreground/80 max-w-[90%] flex items-center gap-2 border border-border/50">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                        <div
                          className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <div
                          className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 border-t border-border/30 bg-background/50 shrink-0">
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
            "h-14 w-14 rounded-full shadow-2xl transition-all duration-300",
            isChatOpen
              ? "rotate-90 opacity-0 scale-75"
              : "hover:scale-110 active:scale-95",
          )}
          onClick={() => setIsChatOpen(true)}
        >
          <Sparkles className="h-6 w-6" />
        </Button>
      </div>

      {isExperimentMode && (
        <ExperimentMode
          productId={productId || "unknown"}
          onClose={() => setIsExperimentMode(false)}
        />
      )}
    </div>
  );
}

export default function Explore() {
  return (
    <ReactFlowProvider>
      <ExploreInner />
    </ReactFlowProvider>
  );
}
