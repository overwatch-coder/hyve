import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  BarChart2,
  Download,
  FlaskConical,
  Loader2,
  Clock,
  Users,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Study = {
  id: number;
  title: string;
  status: string;
};

type Analytics = {
  study_id: number;
  product_id: number;
  title: string;
  status: string;
  total_invites: number;
  used_invites: number;
  completions: number;
  pending_review: number;
  approved: number;
  rejected: number;
  hyve_count: number;
  traditional_count: number;
  hyve_avg_time?: number;
  traditional_avg_time?: number;
  hyve_avg_confidence?: number;
  traditional_avg_confidence?: number;
};

type Result = {
  id: number;
  platform: string;
  time_seconds: number;
  confidence_rating?: number;
  review_status: string;
  study_id?: number;
  created_at: string;
  similarity_scores?: Record<string, number>;
  evidence?: {
    strengths?: Array<{ text: string }>;
    weaknesses?: Array<{ text: string }>;
    weakness_paraphrase?: string;
    claim_paraphrase?: string;
    positive_paraphrase?: string;
    negative_paraphrase?: string;
  };
};

function extractFindingTexts(
  evidence: Result["evidence"],
  key: "strengths" | "weaknesses",
) {
  const ranked = evidence?.[key];
  if (Array.isArray(ranked) && ranked.length > 0) {
    return ranked.map((item) => item.text).filter(Boolean);
  }

  if (key === "strengths") {
    return [evidence?.claim_paraphrase, evidence?.positive_paraphrase].filter(
      Boolean,
    ) as string[];
  }

  return [evidence?.weakness_paraphrase, evidence?.negative_paraphrase].filter(
    Boolean,
  ) as string[];
}

function averageScores(
  scores: Record<string, number> | undefined,
  keys: string[],
) {
  const values = keys
    .map((key) => scores?.[key])
    .filter((value): value is number => typeof value === "number");
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatTime(s?: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function pct(a?: number, b?: number) {
  if (!a || !b) return null;
  return (((b - a) / a) * 100).toFixed(1);
}

export default function AdminExperimentAnalysis() {
  const { getAuthHeaders } = useAdmin();
  const [selectedStudyId, setSelectedStudyId] = useState<number | null>(null);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exporting, setExporting] = useState(false);

  const { data: studies = [], isLoading: studiesLoading } = useQuery<Study[]>({
    queryKey: ["admin-studies-list"],
    queryFn: async () => {
      const res = await api.get("/experiments/studies", {
        headers: getAuthHeaders(),
      });
      return res.data;
    },
  });

  useEffect(() => {
    if (!selectedStudyId && studies.length > 0) {
      setSelectedStudyId(studies[0].id);
    }
  }, [studies, selectedStudyId]);

  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useQuery<Analytics>({
    queryKey: ["admin-study-analytics-detail", selectedStudyId],
    queryFn: async () => {
      const res = await api.get(
        `/experiments/studies/${selectedStudyId}/analytics`,
        { headers: getAuthHeaders() }
      );
      return res.data;
    },
    enabled: !!selectedStudyId,
  });

  const {
    data: results = [],
    isLoading: resultsLoading,
    error: resultsError,
  } = useQuery<Result[]>({
    queryKey: ["admin-study-results", selectedStudyId],
    queryFn: async () => {
      const res = await api.get("/experiments/results", {
        headers: getAuthHeaders(),
      });
      // Filter to selected study
      return (res.data as Result[]).filter(
        (r) => r.study_id === selectedStudyId
      );
    },
    enabled: !!selectedStudyId,
  });

  const handleExport = async () => {
    if (!selectedStudyId) return;
    setExporting(true);
    try {
      const res = await api.get(
        `/experiments/studies/${selectedStudyId}/export`,
        {
          responseType: "blob",
          headers: getAuthHeaders(),
        }
      );
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `study_${selectedStudyId}_results.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err) {
      const maybeBlob = (err as { response?: { data?: Blob } })?.response?.data;
      if (maybeBlob instanceof Blob) {
        const text = await maybeBlob.text();
        try {
          const parsed = JSON.parse(text) as { detail?: string };
          toast.error(parsed.detail || "Export failed");
        } catch {
          toast.error(text || "Export failed");
        }
      } else {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail || "Export failed";
        toast.error(detail);
      }
    } finally {
      setExporting(false);
    }
  };

  const filteredResults = results.filter((r) => {
    if (platformFilter !== "all" && r.platform !== platformFilter) return false;
    if (statusFilter !== "all" && r.review_status !== statusFilter) return false;
    return true;
  });

  const timeSavedPct = pct(analytics?.traditional_avg_time, analytics?.hyve_avg_time ?? undefined);
  const timeSavedLabel =
    timeSavedPct !== null
      ? parseFloat(timeSavedPct) < 0
        ? `${Math.abs(parseFloat(timeSavedPct))}% faster`
        : `${timeSavedPct}% slower`
      : "—";

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
            <BarChart2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">Experiment Analysis</h2>
            <p className="text-xs text-muted-foreground font-medium">Review study results and export data.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedStudyId && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export CSV
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/experiments/studies">
              <FlaskConical className="h-4 w-4 mr-2" />
              Studies
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Study Selector */}
        <Card className="border-border/40">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Select Study
                </label>
                {studiesLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : (
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedStudyId ?? ""}
                    onChange={(e) =>
                      setSelectedStudyId(e.target.value ? parseInt(e.target.value) : null)
                    }
                  >
                    <option value="">— Choose a study —</option>
                    {studies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({s.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {!selectedStudyId && (
          <div className="text-center py-20 text-muted-foreground text-sm font-medium">
            Select a study above to view its analysis.
          </div>
        )}

        {selectedStudyId && analyticsLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading analytics…</span>
          </div>
        )}

        {selectedStudyId && analyticsError && (
          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardContent className="p-5 text-sm text-rose-500">
              Failed to load analytics for the selected study.
            </CardContent>
          </Card>
        )}

        {analytics && (
          <>
            {/* Completion Funnel */}
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  Completion Funnel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Invited", value: analytics.total_invites, icon: Users },
                    { label: "Started", value: analytics.used_invites, icon: FlaskConical },
                    { label: "Completed", value: analytics.completions, icon: BarChart2 },
                    { label: "Approved", value: analytics.approved, icon: Star },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 border border-border/30"
                    >
                      <s.icon className="h-5 w-5 text-muted-foreground" />
                      <p className="text-2xl font-black">{s.value}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {s.label}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Platform Comparison */}
            <div className="grid md:grid-cols-3 gap-4">
              {/* HYVE */}
              <Card className="border-primary/20 bg-primary/2">
                <CardHeader>
                  <CardTitle className="text-sm font-black text-primary">HYVE</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Stat label="Participants" value={String(analytics.hyve_count)} />
                  <Stat
                    label="Avg. Time"
                    value={formatTime(analytics.hyve_avg_time)}
                    icon={Clock}
                  />
                  <Stat
                    label="Avg. Confidence"
                    value={analytics.hyve_avg_confidence?.toFixed(1) ?? "—"}
                    icon={Star}
                  />
                </CardContent>
              </Card>

              {/* Traditional */}
              <Card className="border-border/40">
                <CardHeader>
                  <CardTitle className="text-sm font-black text-muted-foreground">
                    Traditional
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Stat label="Participants" value={String(analytics.traditional_count)} />
                  <Stat
                    label="Avg. Time"
                    value={formatTime(analytics.traditional_avg_time)}
                    icon={Clock}
                  />
                  <Stat
                    label="Avg. Confidence"
                    value={analytics.traditional_avg_confidence?.toFixed(1) ?? "—"}
                    icon={Star}
                  />
                </CardContent>
              </Card>

              {/* Delta */}
              <Card className="border-border/40">
                <CardHeader>
                  <CardTitle className="text-sm font-black text-muted-foreground">
                    Δ HYVE vs Traditional
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Stat label="Time Efficiency" value={timeSavedLabel} />
                  <Stat
                    label="Confidence Δ"
                    value={
                      analytics.hyve_avg_confidence && analytics.traditional_avg_confidence
                        ? (
                            analytics.hyve_avg_confidence -
                            analytics.traditional_avg_confidence
                          ).toFixed(2)
                        : "—"
                    }
                  />
                  <Stat
                    label="Review Status"
                    value={`${analytics.approved} approved · ${analytics.pending_review} pending`}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Results Table */}
            <Card className="border-border/40">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-black">
                  Results ({filteredResults.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                    value={platformFilter}
                    onChange={(e) => setPlatformFilter(e.target.value)}
                  >
                    <option value="all">All Platforms</option>
                    <option value="hyve">HYVE</option>
                    <option value="traditional">Traditional</option>
                  </select>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/30">
                        {[
                          "ID",
                          "Platform",
                          "Time",
                          "Confidence",
                          "Top Strengths",
                          "Top Weaknesses",
                          "Strength Match",
                          "Weakness Match",
                          "Status",
                          "Date",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2.5 text-left font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.length === 0 ? (
                        <tr>
                          <td
                            colSpan={10}
                            className="px-4 py-12 text-center text-muted-foreground"
                          >
                            {resultsLoading
                              ? "Loading results…"
                              : resultsError
                                ? "Failed to load study results."
                                : "No results match the current filters."}
                          </td>
                        </tr>
                      ) : (
                        filteredResults.map((r) => {
                          const strengths = extractFindingTexts(r.evidence, "strengths");
                          const weaknesses = extractFindingTexts(r.evidence, "weaknesses");
                          const strengthScore = averageScores(r.similarity_scores, [
                            "strength_1_score",
                            "strength_2_score",
                            "strength_3_score",
                            "claim_paraphrase",
                            "positive_paraphrase",
                          ]);
                          const weaknessScore = averageScores(r.similarity_scores, [
                            "weakness_1_score",
                            "weakness_2_score",
                            "weakness_3_score",
                            "weakness_paraphrase",
                            "negative_paraphrase",
                          ]);

                          return (
                            <tr
                              key={r.id}
                              className="border-b border-border/20 hover:bg-muted/10 transition-colors align-top"
                            >
                              <td className="px-3 py-2.5 font-mono">{r.id}</td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-full font-black uppercase",
                                    r.platform === "hyve"
                                      ? "bg-primary/10 text-primary"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {r.platform}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-mono">
                                {formatTime(r.time_seconds)}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {r.confidence_rating ?? "—"}
                              </td>
                              <td className="px-3 py-2.5 min-w-[220px]">
                                <div className="space-y-1">
                                  {strengths.length === 0 ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : (
                                    strengths.map((text, index) => (
                                      <p key={`${r.id}-strength-${index}`} className="leading-5">
                                        <span className="font-black mr-1">{index + 1}.</span>
                                        {text}
                                      </p>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 min-w-[220px]">
                                <div className="space-y-1">
                                  {weaknesses.length === 0 ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : (
                                    weaknesses.map((text, index) => (
                                      <p key={`${r.id}-weakness-${index}`} className="leading-5">
                                        <span className="font-black mr-1">{index + 1}.</span>
                                        {text}
                                      </p>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-center">
                                {strengthScore !== null ? strengthScore.toFixed(2) : "—"}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-center">
                                {weaknessScore !== null ? weaknessScore.toFixed(2) : "—"}
                              </td>
                              <td className="px-3 py-2.5">
                                <Badge
                                  className={cn(
                                    "text-[9px]",
                                    r.review_status === "approved" &&
                                      "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                                    r.review_status === "rejected" &&
                                      "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                  )}
                                  variant={
                                    r.review_status === "pending" ? "secondary" : "outline"
                                  }
                                >
                                  {r.review_status}
                                </Badge>
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                                {new Date(r.created_at).toLocaleDateString()}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <span className="font-black text-sm">{value}</span>
    </div>
  );
}
