import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Link } from "react-router-dom";
import { ShieldAlert, CheckCircle2, XCircle, ArrowLeft, RefreshCw, User, Beaker } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function AdminExperimentReview() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");

  const { data: queue, isLoading } = useQuery({
    queryKey: ["experiment-review-queue", statusFilter],
    queryFn: async () => {
      const resp = await api.get(`/experiments/review-queue?status=${statusFilter}`);
      return resp.data;
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: "approved" | "rejected"; notes?: string }) => {
      await api.patch(`/experiments/results/${id}/review`, { status, review_notes: notes });
    },
    onSuccess: () => {
      toast.success("Review status updated");
      queryClient.invalidateQueries({ queryKey: ["experiment-review-queue"] });
    },
    onError: () => {
      toast.error("Failed to update status");
    }
  });

  const handleApprove = (id: string) => {
    reviewMutation.mutate({ id, status: "approved" });
  };

  const handleReject = (id: string) => {
    const notes = window.prompt("Rejection reason (optional):");
    if (notes !== null) {
      reviewMutation.mutate({ id, status: "rejected", notes });
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-background sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8 -ml-2">
              <Link to="/admin">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                <Beaker className="h-4 w-4 text-orange-500" />
              </div>
              <h1 className="font-bold tracking-tight">Experiment QC</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-[180px] h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["experiment-review-queue"] })}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium">Pending Reviews</p>
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold">{queue?.filter((q: any) => q.review_status === "pending").length || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Needs Review</CardTitle>
            <CardDescription>Records flagged by AI similarity checker as low confidence (&lt; 0.55 similarity).</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-12 flex justify-center"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : queue?.length === 0 ? (
              <div className="py-12 text-center flex flex-col items-center gap-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 opacity-50" />
                <p className="text-muted-foreground font-medium">No results found for status "{statusFilter}".</p>
              </div>
            ) : (
              <div className="space-y-8">
                {queue?.map((item: any) => (
                  <div key={item.id} className="border border-border/50 rounded-xl overflow-hidden bg-card shadow-sm">
                    <div className="bg-muted/50 px-4 py-3 flex items-center justify-between border-b border-border/50">
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className="font-mono text-xs">{String(item.id).slice(0,8)}</Badge>
                        <span className="text-sm font-bold flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {item.participant_name}
                        </span>
                        <Badge variant={item.platform === 'hyve' ? "default" : "secondary"}>
                          {String(item.platform).toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                         <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                         {item.review_status === 'pending' && <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10">Pending</Badge>}
                         {item.review_status === 'approved' && <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10">Approved</Badge>}
                         {item.review_status === 'rejected' && <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/10">Rejected</Badge>}
                      </div>
                    </div>
                    
                    <div className="p-4 grid gap-6">
                      {item.evidence && Object.keys(item.evidence).filter(k => k.endsWith('_paraphrase')).map(key => {
                        const score = item.similarity_scores?.[key] || 0;
                        const isWarning = score < 0.55;
                        const label = key.replace('_paraphrase', '').charAt(0).toUpperCase() + key.replace('_paraphrase', '').slice(1);
                        const sourceRefKey = key.replace('_paraphrase', item.platform === 'traditional' ? '_review_ref' : '_ref');
                        const refInfo = item.evidence?.source_refs?.[sourceRefKey];

                        return (
                          <div key={key} className="grid md:grid-cols-12 gap-4 items-start border-b border-border/20 pb-4 last:border-0 last:pb-0">
                            <div className="md:col-span-2">
                              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</div>
                              <div className="mt-2 flex items-center gap-2">
                                <Badge variant={isWarning ? "destructive" : "secondary"} className={isWarning ? "" : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"}>
                                  Score: {score.toFixed(2)}
                                </Badge>
                              </div>
                            </div>
                            <div className="md:col-span-5 space-y-2">
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Participant Input</div>
                              <div className="text-sm p-3 bg-muted/30 rounded-lg border border-border/50 h-full">
                                {item.evidence[key] || <span className="italic text-muted-foreground">No input provided</span>}
                              </div>
                            </div>
                            <div className="md:col-span-5 space-y-2">
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                Source Reference
                                {refInfo && <Badge variant="outline" className="text-[9px] h-4 py-0 font-normal">{refInfo.type}: {String(refInfo.id).slice(0,6)}</Badge>}
                              </div>
                              <div className="text-sm p-3 bg-muted/30 rounded-lg border border-border/50 h-full text-muted-foreground">
                                {refInfo ? (
                                  <i>Reference lookup UI not fully expanded here. Look up {refInfo.type} ID {refInfo.id} in DB.</i>
                                ) : (
                                  <span className="text-amber-500 font-medium">Missing source reference</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {item.review_status === "pending" && (
                      <div className="bg-card px-4 py-3 flex items-center justify-end gap-3 border-t border-border/50">
                        <Button variant="outline" size="sm" onClick={() => handleReject(item.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                        <Button size="sm" onClick={() => handleApprove(item.id)} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                      </div>
                    )}
                    {item.review_notes && (
                      <div className="bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
                        Admin Note: {item.review_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
