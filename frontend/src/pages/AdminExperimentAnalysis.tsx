import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart2,
  CheckCircle2,
  Clock,
  Download,
  Ellipsis,
  FlaskConical,
  Loader2,
  Sparkles,
  Star,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Study = {
  id: number;
  title: string;
  status: string;
  ground_truth_strengths?: string[] | null;
  ground_truth_weaknesses?: string[] | null;
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

type EvidenceItem = {
  text: string;
};

type AdminAnalysis = {
  summary?: string;
  custom_prompt?: string | null;
  strength_match_pct?: number;
  weakness_match_pct?: number;
  overall_accuracy_pct?: number;
  manual_strength_match_pct?: number | null;
  manual_weakness_match_pct?: number | null;
  manual_overall_accuracy_pct?: number | null;
  manual_override_updated_at?: string | null;
  generated_at?: string;
  ground_truth_strengths?: string[];
  ground_truth_weaknesses?: string[];
};

type Result = {
  id: number;
  participant_name?: string | null;
  platform: string;
  time_seconds: number;
  confidence_rating?: number | null;
  review_status: string;
  created_at: string;
  participant_helpful?: boolean | null;
  review_notes?: string | null;
  admin_analysis?: AdminAnalysis | null;
  evidence?: {
    strengths?: EvidenceItem[];
    weaknesses?: EvidenceItem[];
    weakness_paraphrase?: string;
    claim_paraphrase?: string;
    positive_paraphrase?: string;
    negative_paraphrase?: string;
  };
};

type PendingReviewAction = {
  resultId: number;
  reviewStatus: "approved" | "rejected";
} | null;

type ManualOverrideValues = {
  manualStrengthMatchPct?: number | null;
  manualWeaknessMatchPct?: number | null;
  manualOverallAccuracyPct?: number | null;
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

function formatTime(s?: number) {
  if (!s) return "-";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function pctChange(baseline?: number, next?: number) {
  if (!baseline || !next) return null;
  return (((next - baseline) / baseline) * 100).toFixed(1);
}

function formatMatchPct(value?: number) {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "-";
}

function formatHelpfulness(value?: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "-";
}

function statusBadgeClass(status: string) {
  if (status === "approved") {
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  }
  if (status === "rejected") {
    return "bg-rose-500/10 text-rose-500 border-rose-500/20";
  }
  return "";
}

function getAnalysisNote(analysis?: AdminAnalysis | null) {
  if (!analysis?.summary) {
    return "No analysis note yet.";
  }
  return analysis.summary;
}

export default function AdminExperimentAnalysis() {
  const { getAuthHeaders } = useAdmin();
  const queryClient = useQueryClient();
  const [selectedStudyId, setSelectedStudyId] = useState<number | null>(null);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [summaryResult, setSummaryResult] = useState<Result | null>(null);
  const [manualOverrideResult, setManualOverrideResult] =
    useState<Result | null>(null);
  const [pendingReviewAction, setPendingReviewAction] =
    useState<PendingReviewAction>(null);

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
        { headers: getAuthHeaders() },
      );
      return res.data;
    },
    enabled: !!selectedStudyId,
  });
  const selectedStudy =
    studies.find((study) => study.id === selectedStudyId) ?? null;

  const {
    data: results = [],
    isLoading: resultsLoading,
    error: resultsError,
  } = useQuery<Result[]>({
    queryKey: [
      "admin-study-results",
      selectedStudyId,
      platformFilter,
      statusFilter,
    ],
    queryFn: async () => {
      const res = await api.get(
        `/experiments/studies/${selectedStudyId}/results`,
        {
          headers: getAuthHeaders(),
          params: {
            platform: platformFilter === "all" ? undefined : platformFilter,
            status: statusFilter === "all" ? undefined : statusFilter,
          },
        },
      );
      return res.data;
    },
    enabled: !!selectedStudyId,
  });

  const analyzeMutation = useMutation({
    mutationFn: async ({
      resultId,
      customPrompt,
    }: {
      resultId: number;
      customPrompt?: string;
    }) => {
      const res = await api.post(
        `/experiments/results/${resultId}/analyze`,
        customPrompt ? { custom_prompt: customPrompt } : {},
        { headers: getAuthHeaders() },
      );
      return res.data as Result;
    },
    onSuccess: (updatedResult) => {
      toast.success("Analysis saved");
      if (summaryResult?.id === updatedResult.id) {
        setSummaryResult(updatedResult);
      }
      queryClient.invalidateQueries({
        queryKey: ["admin-study-results", selectedStudyId],
      });
    },
    onError: (error: unknown) => {
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to analyze result";
      toast.error(detail);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({
      resultId,
      reviewStatus,
      reviewNotes,
    }: {
      resultId: number;
      reviewStatus: "approved" | "rejected";
      reviewNotes?: string;
    }) => {
      const res = await api.patch(
        `/experiments/results/${resultId}/review`,
        {
          review_status: reviewStatus,
          review_notes: reviewNotes,
        },
        { headers: getAuthHeaders() },
      );
      return res.data as Result;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.reviewStatus === "approved"
          ? "Result approved"
          : "Result rejected",
      );
      setPendingReviewAction(null);
      queryClient.invalidateQueries({
        queryKey: ["admin-study-results", selectedStudyId],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin-study-analytics-detail", selectedStudyId],
      });
    },
    onError: () => {
      toast.error("Failed to update review status");
    },
  });

  const manualOverrideMutation = useMutation({
    mutationFn: async ({
      resultId,
      values,
    }: {
      resultId: number;
      values: ManualOverrideValues;
    }) => {
      const res = await api.patch(
        `/experiments/results/${resultId}/analysis`,
        {
          manual_strength_match_pct: values.manualStrengthMatchPct ?? null,
          manual_weakness_match_pct: values.manualWeaknessMatchPct ?? null,
          manual_overall_accuracy_pct: values.manualOverallAccuracyPct ?? null,
        },
        { headers: getAuthHeaders() },
      );
      return res.data as Result;
    },
    onSuccess: (updatedResult) => {
      toast.success("Manual accuracy override saved");
      if (summaryResult?.id === updatedResult.id) {
        setSummaryResult(updatedResult);
      }
      setManualOverrideResult(null);
      queryClient.invalidateQueries({
        queryKey: ["admin-study-results", selectedStudyId],
      });
    },
    onError: (error: unknown) => {
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to save manual override";
      toast.error(detail);
    },
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
        },
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

  const handleReject = (resultId: number) => {
    setPendingReviewAction({ resultId, reviewStatus: "rejected" });
  };

  const handleApprove = (resultId: number) => {
    setPendingReviewAction({ resultId, reviewStatus: "approved" });
  };

  const confirmReviewStatusChange = () => {
    if (!pendingReviewAction) {
      return;
    }
    reviewMutation.mutate({
      resultId: pendingReviewAction.resultId,
      reviewStatus: pendingReviewAction.reviewStatus,
    });
  };

  const timeSavedPct = pctChange(
    analytics?.traditional_avg_time,
    analytics?.hyve_avg_time,
  );
  const timeSavedLabel =
    timeSavedPct !== null
      ? parseFloat(timeSavedPct) < 0
        ? `${Math.abs(parseFloat(timeSavedPct))}% faster`
        : `${timeSavedPct}% slower`
      : "-";

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <BarChart2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">
              Experiment Analysis
            </h2>
            <p className="text-xs font-medium text-muted-foreground">
              Review participant submissions, run admin analysis, and export study data.
            </p>
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
              <FlaskConical className="mr-2 h-4 w-4" />
              Studies
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        <Card className="border-border/40">
          <CardContent className="p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(220px,0.8fr)_minmax(220px,0.8fr)] lg:items-end">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Select Study
                </label>
                {studiesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading...
                  </div>
                ) : (
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedStudyId ?? ""}
                    onChange={(e) =>
                      setSelectedStudyId(
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )
                    }
                  >
                    <option value="">- Choose a study -</option>
                    {studies.map((study) => (
                      <option key={study.id} value={study.id}>
                        {study.title} ({study.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Platform
                </label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                >
                  <option value="all">All Platforms</option>
                  <option value="hyve">HYVE</option>
                  <option value="traditional">Traditional</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Status
                </label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {!selectedStudyId && (
          <div className="py-20 text-center text-sm font-medium text-muted-foreground">
            Select a study above to view its analysis.
          </div>
        )}

        {selectedStudyId && analyticsLoading && (
          <div className="flex items-center justify-center gap-3 py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading analytics...</span>
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
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  Completion Funnel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    { label: "Invited", value: analytics.total_invites, icon: Users },
                    { label: "Started", value: analytics.used_invites, icon: FlaskConical },
                    { label: "Completed", value: analytics.completions, icon: BarChart2 },
                    { label: "Approved", value: analytics.approved, icon: CheckCircle2 },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="flex flex-col items-center gap-2 rounded-xl border border-border/30 bg-muted/30 p-4"
                    >
                      <stat.icon className="h-5 w-5 text-muted-foreground" />
                      <p className="text-2xl font-black">{stat.value}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-primary/20 bg-primary/2">
                <CardHeader>
                  <CardTitle className="text-sm font-black text-primary">
                    HYVE
                  </CardTitle>
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
                    value={analytics.hyve_avg_confidence?.toFixed(1) ?? "-"}
                    icon={Star}
                  />
                </CardContent>
              </Card>

              <Card className="border-border/40">
                <CardHeader>
                  <CardTitle className="text-sm font-black text-muted-foreground">
                    Traditional
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Stat
                    label="Participants"
                    value={String(analytics.traditional_count)}
                  />
                  <Stat
                    label="Avg. Time"
                    value={formatTime(analytics.traditional_avg_time)}
                    icon={Clock}
                  />
                  <Stat
                    label="Avg. Confidence"
                    value={analytics.traditional_avg_confidence?.toFixed(1) ?? "-"}
                    icon={Star}
                  />
                </CardContent>
              </Card>

              <Card className="border-border/40">
                <CardHeader>
                  <CardTitle className="text-sm font-black text-muted-foreground">
                    HYVE vs Traditional
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Stat label="Time Efficiency" value={timeSavedLabel} />
                  <Stat
                    label="Confidence Delta"
                    value={
                      analytics.hyve_avg_confidence &&
                      analytics.traditional_avg_confidence
                        ? (
                            analytics.hyve_avg_confidence -
                            analytics.traditional_avg_confidence
                          ).toFixed(2)
                        : "-"
                    }
                  />
                  <Stat
                    label="Review Status"
                    value={`${analytics.approved} approved / ${analytics.pending_review} pending`}
                  />
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/40">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-black">
                  Results ({results.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-b border-border/20 bg-muted/15 px-4 py-4 sm:px-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Ground Truth Reference
                  </p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <GroundTruthPanel
                      title="Ground Truth Strengths"
                      items={selectedStudy?.ground_truth_strengths || []}
                    />
                    <GroundTruthPanel
                      title="Ground Truth Weaknesses"
                      items={selectedStudy?.ground_truth_weaknesses || []}
                    />
                  </div>
                </div>
                <div className="overflow-x-auto overscroll-x-contain pb-2">
                  <table className="min-w-[1720px] w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/30">
                        {[
                          "ID",
                          "Participant",
                          "Platform",
                          "Time",
                          "Confidence",
                          "Helpful",
                          "Top Strengths",
                          "Top Weaknesses",
                          "Strength Accuracy",
                          "Weakness Accuracy",
                          "Overall Accuracy",
                          "Admin Analysis",
                          "Status",
                          "Actions",
                          "Date",
                        ].map((heading) => (
                          <th
                            key={heading}
                            className="whitespace-nowrap px-3 py-2.5 text-left font-black uppercase tracking-widest text-muted-foreground"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.length === 0 ? (
                        <tr>
                          <td
                            colSpan={15}
                            className="px-4 py-12 text-center text-muted-foreground"
                          >
                            {resultsLoading
                              ? "Loading results..."
                              : resultsError
                                ? "Failed to load study results."
                                : "No results match the current filters."}
                          </td>
                        </tr>
                      ) : (
                        results.map((result) => {
                          const strengths = extractFindingTexts(
                            result.evidence,
                            "strengths",
                          );
                          const weaknesses = extractFindingTexts(
                            result.evidence,
                            "weaknesses",
                          );
                          const analysis = result.admin_analysis;
                          const analysisBusy =
                            analyzeMutation.isPending &&
                            analyzeMutation.variables?.resultId === result.id;
                          const reviewBusy =
                            reviewMutation.isPending &&
                            reviewMutation.variables?.resultId === result.id;

                          return (
                            <tr
                              key={result.id}
                              className="align-top transition-colors hover:bg-muted/10"
                            >
                              <td className="border-b border-border/20 px-3 py-2.5 font-mono">
                                {result.id}
                              </td>
                              <td className="border-b border-border/20 px-3 py-2.5">
                                {result.participant_name || "-"}
                              </td>
                              <td className="border-b border-border/20 px-3 py-2.5">
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 font-black uppercase",
                                    result.platform === "hyve"
                                      ? "bg-primary/10 text-primary"
                                      : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {result.platform}
                                </span>
                              </td>
                              <td className="border-b border-border/20 px-3 py-2.5 font-mono">
                                {formatTime(result.time_seconds)}
                              </td>
                              <td className="border-b border-border/20 px-3 py-2.5 text-center">
                                {result.confidence_rating ?? "-"}
                              </td>
                              <td className="border-b border-border/20 px-3 py-2.5">
                                {formatHelpfulness(result.participant_helpful)}
                              </td>
                              <td className="min-w-[220px] border-b border-border/20 px-3 py-2.5">
                                <div className="space-y-1">
                                  {strengths.length === 0 ? (
                                    <span className="text-muted-foreground">-</span>
                                  ) : (
                                    strengths.map((text, index) => (
                                      <p
                                        key={`${result.id}-strength-${index}`}
                                        className="leading-5"
                                      >
                                        <span className="mr-1 font-black">
                                          {index + 1}.
                                        </span>
                                        {text}
                                      </p>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td className="min-w-[220px] border-b border-border/20 px-3 py-2.5">
                                <div className="space-y-1">
                                  {weaknesses.length === 0 ? (
                                    <span className="text-muted-foreground">-</span>
                                  ) : (
                                    weaknesses.map((text, index) => (
                                      <p
                                        key={`${result.id}-weakness-${index}`}
                                        className="leading-5"
                                      >
                                        <span className="mr-1 font-black">
                                          {index + 1}.
                                        </span>
                                        {text}
                                      </p>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td className="min-w-[300px] border-b border-border/20 px-3 py-2.5">
                                <AccuracyCell
                                  aiValue={analysis?.strength_match_pct}
                                  manualValue={analysis?.manual_strength_match_pct}
                                />
                              </td>
                              <td className="border-b border-border/20 px-3 py-2.5">
                                <AccuracyCell
                                  aiValue={analysis?.weakness_match_pct}
                                  manualValue={analysis?.manual_weakness_match_pct}
                                />
                              </td>
                              <td className="border-b border-border/20 px-3 py-2.5">
                                <AccuracyCell
                                  aiValue={analysis?.overall_accuracy_pct}
                                  manualValue={analysis?.manual_overall_accuracy_pct}
                                />
                              </td>
                              <td className="min-w-[320px] border-b border-border/20 px-3 py-2.5">
                                <p className="leading-6">
                                  {getAnalysisNote(analysis)}
                                </p>
                                {analysis?.manual_override_updated_at && (
                                  <p className="mt-2 text-[11px] text-muted-foreground">
                                    Manual override updated{" "}
                                    {new Date(
                                      analysis.manual_override_updated_at,
                                    ).toLocaleString()}
                                  </p>
                                )}
                              </td>
                              <td className="border-b border-border/20 px-3 py-2.5">
                                <Badge
                                  className={cn(
                                    "text-[9px]",
                                    statusBadgeClass(result.review_status),
                                  )}
                                  variant={
                                    result.review_status === "pending"
                                      ? "secondary"
                                      : "outline"
                                  }
                                >
                                  {result.review_status}
                                </Badge>
                                {result.review_notes && (
                                  <p className="mt-2 max-w-[150px] text-[11px] text-muted-foreground">
                                    {result.review_notes}
                                  </p>
                                )}
                              </td>
                              <td className="border-b border-border/20 px-3 py-2.5">
                                <div className="flex justify-center">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        aria-label="Open row actions"
                                        disabled={analysisBusy || reviewBusy}
                                      >
                                        {analysisBusy || reviewBusy ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Ellipsis className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-52">
                                      <DropdownMenuItem
                                        onClick={() =>
                                          analyzeMutation.mutate({ resultId: result.id })
                                        }
                                      >
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        Analyze Results
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => setSummaryResult(result)}
                                      >
                                        <BarChart2 className="mr-2 h-4 w-4" />
                                        Summary
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => setManualOverrideResult(result)}
                                      >
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Edit Manual Scores
                                      </DropdownMenuItem>
                                      {result.review_status === "pending" && (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() => handleApprove(result.id)}
                                          >
                                            <CheckCircle2 className="mr-2 h-4 w-4" />
                                            Approve
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            className="text-rose-500 focus:text-rose-600"
                                            onClick={() => handleReject(result.id)}
                                          >
                                            <XCircle className="mr-2 h-4 w-4" />
                                            Reject
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </td>
                              <td className="whitespace-nowrap border-b border-border/20 px-3 py-2.5 text-muted-foreground">
                                {new Date(result.created_at).toLocaleDateString()}
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

      <SummaryDialog
        result={summaryResult}
        open={!!summaryResult}
        isAnalyzing={
          analyzeMutation.isPending &&
          analyzeMutation.variables?.resultId === summaryResult?.id
        }
        onAnalyzeWithPrompt={(resultId, customPrompt) =>
          analyzeMutation.mutate({ resultId, customPrompt })
        }
        onOpenChange={(open) => {
          if (!open) {
            setSummaryResult(null);
          }
        }}
      />

      <ManualOverrideDialog
        result={manualOverrideResult}
        open={!!manualOverrideResult}
        isSaving={
          manualOverrideMutation.isPending &&
          manualOverrideMutation.variables?.resultId === manualOverrideResult?.id
        }
        onSave={(resultId, values) =>
          manualOverrideMutation.mutate({ resultId, values })
        }
        onOpenChange={(open) => {
          if (!open) {
            setManualOverrideResult(null);
          }
        }}
      />

      <AlertDialog
        open={!!pendingReviewAction}
        onOpenChange={(open) => {
          if (!open) {
            setPendingReviewAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black tracking-tight">
              {pendingReviewAction?.reviewStatus === "approved"
                ? "Approve Submission?"
                : "Reject Submission?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingReviewAction?.reviewStatus === "approved"
                ? "This pending submission will become approved and start contributing to approved study results."
                : "This pending submission will be marked as rejected and excluded from approved study results."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reviewMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReviewStatusChange}
              disabled={reviewMutation.isPending}
              className={cn(
                pendingReviewAction?.reviewStatus === "rejected" &&
                  "bg-rose-500 text-white hover:bg-rose-600",
              )}
            >
              {reviewMutation.isPending ? "Updating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryDialog({
  result,
  open,
  isAnalyzing,
  onAnalyzeWithPrompt,
  onOpenChange,
}: {
  result: Result | null;
  open: boolean;
  isAnalyzing: boolean;
  onAnalyzeWithPrompt: (resultId: number, customPrompt?: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const analysis = result?.admin_analysis;
  const strengths = extractFindingTexts(result?.evidence, "strengths");
  const weaknesses = extractFindingTexts(result?.evidence, "weaknesses");
  const [customPrompt, setCustomPrompt] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setCustomPrompt(analysis?.custom_prompt || "");
  }, [analysis?.custom_prompt, open, result?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-h-[88vh] overflow-y-auto border-border/40 bg-card sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-black tracking-tight">
            Submission Summary
          </DialogTitle>
          <DialogDescription>
            Compare the participant submission, AI accuracy scores, manual overrides, and confidence in one place.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Custom Prompt
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a prompt to steer the analysis note while keeping the accuracy percentages grounded in the saved strengths and weaknesses.
            </p>
            <Textarea
              className="mt-3 min-h-24"
              placeholder="Example: Focus on whether the participant's confidence seems justified by the quality of their findings."
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
            />
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                size="sm"
                className="gap-2"
                onClick={() =>
                  result &&
                  onAnalyzeWithPrompt(result.id, customPrompt.trim() || undefined)
                }
                disabled={!result || isAnalyzing}
              >
                {isAnalyzing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Analyze Results
              </Button>
            </div>
          </div>

          {!result || !analysis ? (
            <div className="rounded-lg border border-border/40 bg-muted/20 p-4 text-sm text-muted-foreground">
              Analyze results to generate the analysis note and accuracy metrics for this submission.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <SummaryStat label="Participant" value={result.participant_name || "-"} />
                <SummaryStat label="Platform" value={result.platform.toUpperCase()} />
                <SummaryStat
                  label="Confidence"
                  value={String(result.confidence_rating ?? "-")}
                />
                <SummaryStat
                  label="Helpful"
                  value={formatHelpfulness(result.participant_helpful)}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <SummaryStat
                  label="Strength Match"
                  value={formatMatchPct(
                    analysis.manual_strength_match_pct ??
                      analysis.strength_match_pct,
                  )}
                  helper={
                    typeof analysis.manual_strength_match_pct === "number"
                      ? `AI: ${formatMatchPct(analysis.strength_match_pct)}`
                      : "AI result"
                  }
                />
                <SummaryStat
                  label="Weakness Match"
                  value={formatMatchPct(
                    analysis.manual_weakness_match_pct ??
                      analysis.weakness_match_pct,
                  )}
                  helper={
                    typeof analysis.manual_weakness_match_pct === "number"
                      ? `AI: ${formatMatchPct(analysis.weakness_match_pct)}`
                      : "AI result"
                  }
                />
                <SummaryStat
                  label="Overall Accuracy"
                  value={formatMatchPct(
                    analysis.manual_overall_accuracy_pct ??
                      analysis.overall_accuracy_pct,
                  )}
                  helper={
                    typeof analysis.manual_overall_accuracy_pct === "number"
                      ? `AI: ${formatMatchPct(analysis.overall_accuracy_pct)}`
                      : "AI result"
                  }
                />
              </div>

              <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Summary
                </p>
                <p className="mt-2 text-sm leading-6">{analysis.summary || "-"}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SummaryList
                  title="Participant Strengths"
                  items={strengths}
                />
                <SummaryList
                  title="Participant Weaknesses"
                  items={weaknesses}
                />
                <SummaryList
                  title="Ground Truth Strengths"
                  items={analysis.ground_truth_strengths || []}
                />
                <SummaryList
                  title="Ground Truth Weaknesses"
                  items={analysis.ground_truth_weaknesses || []}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-black">{value}</p>
      {helper ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

function AccuracyCell({
  aiValue,
  manualValue,
}: {
  aiValue?: number;
  manualValue?: number | null;
}) {
  const showingManual = typeof manualValue === "number";

  return (
    <div className="text-center">
      <p className="font-mono font-black">
        {formatMatchPct(showingManual ? manualValue : aiValue)}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {showingManual ? "Manual override" : "AI"}
      </p>
      {showingManual && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          AI: {formatMatchPct(aiValue)}
        </p>
      )}
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <div className="mt-3 space-y-2 text-sm">
        {items.length === 0 ? (
          <p className="text-muted-foreground">-</p>
        ) : (
          items.map((item, index) => (
            <p key={`${title}-${index}`} className="leading-6">
              <span className="mr-2 font-black">{index + 1}.</span>
              {item}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function ManualOverrideDialog({
  result,
  open,
  isSaving,
  onSave,
  onOpenChange,
}: {
  result: Result | null;
  open: boolean;
  isSaving: boolean;
  onSave: (resultId: number, values: ManualOverrideValues) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const analysis = result?.admin_analysis;
  const [strengthValue, setStrengthValue] = useState("");
  const [weaknessValue, setWeaknessValue] = useState("");
  const [overallValue, setOverallValue] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setStrengthValue(
      String(
        analysis?.manual_strength_match_pct ?? analysis?.strength_match_pct ?? "",
      ),
    );
    setWeaknessValue(
      String(
        analysis?.manual_weakness_match_pct ?? analysis?.weakness_match_pct ?? "",
      ),
    );
    setOverallValue(
      String(
        analysis?.manual_overall_accuracy_pct ?? analysis?.overall_accuracy_pct ?? "",
      ),
    );
  }, [analysis, open, result?.id]);

  const parseValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const canSave =
    !!result &&
    !!analysis &&
    strengthValue.trim().length > 0 &&
    weaknessValue.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] border-border/40 bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-black tracking-tight">
            Edit Manual Accuracy
          </DialogTitle>
          <DialogDescription>
            Save a human-reviewed accuracy override while keeping the original AI scores for reference.
          </DialogDescription>
        </DialogHeader>

        {!result || !analysis ? (
          <div className="rounded-lg border border-border/40 bg-muted/20 p-4 text-sm text-muted-foreground">
            Analyze results before saving a manual override.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <AccuracyField
                label="Strength"
                value={strengthValue}
                aiValue={analysis.strength_match_pct}
                onChange={setStrengthValue}
              />
              <AccuracyField
                label="Weakness"
                value={weaknessValue}
                aiValue={analysis.weakness_match_pct}
                onChange={setWeaknessValue}
              />
              <AccuracyField
                label="Overall"
                value={overallValue}
                aiValue={analysis.overall_accuracy_pct}
                onChange={setOverallValue}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() =>
                  result &&
                  onSave(result.id, {
                    manualStrengthMatchPct: parseValue(strengthValue),
                    manualWeaknessMatchPct: parseValue(weaknessValue),
                    manualOverallAccuracyPct: parseValue(overallValue),
                  })
                }
                disabled={!canSave || isSaving}
              >
                {isSaving ? "Saving..." : "Save Manual Scores"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccuracyField({
  label,
  value,
  aiValue,
  onChange,
}: {
  label: string;
  value: string;
  aiValue?: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0-100"
      />
      <p className="text-[11px] text-muted-foreground">
        AI baseline: {formatMatchPct(aiValue)}
      </p>
    </div>
  );
}

function GroundTruthPanel({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/80 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <div className="mt-3 space-y-2 text-sm">
        {items.length === 0 ? (
          <p className="text-muted-foreground">No ground truth saved yet.</p>
        ) : (
          items.map((item, index) => (
            <p key={`${title}-${index}`} className="leading-6">
              <span className="mr-2 font-black">{index + 1}.</span>
              {item}
            </p>
          ))
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
  icon?: ElementType;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <span className="text-sm font-black">{value}</span>
    </div>
  );
}
