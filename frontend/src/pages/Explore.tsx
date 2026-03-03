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

import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useParams, Link } from "react-router-dom";
import {
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  ProductNode,
  ClaimNode,
  SummaryNode,
  ThemeNode,
} from "@/components/graph-nodes";

/* ── Custom node-type registry ── */
const nodeTypes = {
  product: ProductNode,
  theme: ThemeNode,
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

    const claimChildIds: string[] = [];

    theme.claims?.forEach((claim: any) => {
      const claimId = `claim-${claim.id}`;
      claimChildIds.push(claimId);

      nodes.push({
        id: claimId,
        type: "claim",
        data: {
          label:
            claim.claim_text.length > 60
              ? claim.claim_text.substring(0, 60) + "..."
              : claim.claim_text,
          fullClaim: claim,
        },
        position: { x: 0, y: 0 },
        hidden: true,
      });

      // Edge: Theme → Claim
      const sentimentColor =
        claim.sentiment_polarity === "positive"
          ? "hsl(160 64% 43%)"
          : claim.sentiment_polarity === "negative"
            ? "hsl(0 72% 51%)"
            : "hsl(220 14% 50%)";

      edges.push({
        id: `e-${themeId}-${claimId}`,
        source: themeId,
        target: claimId,
        type: "smoothstep",
        style: { stroke: sentimentColor, strokeWidth: 1.5, opacity: 0.5 },
        hidden: true,
      });
    });

    // Theme node
    nodes.push({
      id: themeId,
      type: "theme",
      data: {
        label: theme.name,
        themeData: theme,
        expanded: false,
        childIds: claimChildIds,
        childCount: claimChildIds.length,
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

  // Product root node — visible by default
  nodes.push({
    id: productNodeId,
    type: "product",
    data: {
      label: product.name,
      score,
      reviewCount,
      category,
      expanded: false,
      childIds: [...themeChildIds, "summary-node"],
      childCount: themeChildIds.length,
    },
    position: { x: 0, y: 0 },
    hidden: false,
  });

  // Summary terminal node — hidden until product is expanded
  let advicesData: string[] = [];
  try {
    advicesData = product.advices ? JSON.parse(product.advices) : [];
  } catch (e) {
    console.error("Failed to parse advices JSON:", e);
  }

  nodes.push({
    id: "summary-node",
    type: "summary",
    data: {
      summary: product.summary,
      advices: advicesData,
      score: product.overall_sentiment_score,
      productId: product.id,
    },
    position: { x: 0, y: 0 },
    hidden: true,
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

  if (isLoading || !analyticsData || !productData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground gap-4">
        <div className="h-10 w-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="font-semibold text-lg">
          Loading Decision Intelligence...
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Failed to load product map.
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
      <div className="flex items-center gap-2 mt-4 text-foreground/90">
        <GitBranch className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">Decision Map</h2>
      </div>

      {/* Instruction banner */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg border border-border/30 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <p>
          Double-click a <strong className="text-foreground">theme node</strong>{" "}
          to expand claims. Double-click a{" "}
          <strong className="text-foreground">claim node</strong> to reveal
          supporting evidence.
        </p>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 min-h-[600px] pb-10">
        {/* GRAPH VIEW */}
        <div className="md:col-span-3 border border-border/50 rounded-2xl bg-[hsl(160_20%_97%)] dark:bg-card overflow-hidden relative shadow-inner">
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

        {/* AI CHATBOT */}
        <div className="md:col-span-1">
          <Card className="h-full border-border/50 shadow-md flex flex-col overflow-hidden bg-card/80">
            <div className="p-4 border-b border-border/30 flex items-center gap-2 bg-linear-to-r from-primary/10 to-transparent shrink-0">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-bold text-sm">Product AI Assistant</h3>
            </div>

            <div
              ref={chatScrollRef}
              className="flex-1 p-4 overflow-y-auto space-y-4 text-sm font-medium"
            >
              <div className="bg-secondary p-3 rounded-lg rounded-tl-sm text-foreground/80 max-w-[90%]">
                Hi! Have any specific questions about the {productData?.name}?
                Ask me anything and I'll answer strictly using real consumer
                feedback.
              </div>

              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`p-3 rounded-lg max-w-[90%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-secondary text-foreground/80 rounded-tl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-secondary p-3 rounded-lg rounded-tl-sm text-foreground/80 max-w-[90%] flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                    <div
                      className="h-1.5 w-1.5 rounded-full bg-primary animate-ping"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="h-1.5 w-1.5 rounded-full bg-primary animate-ping"
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
                  className="pr-10 bg-background text-sm"
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
        </div>
      </div>
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
