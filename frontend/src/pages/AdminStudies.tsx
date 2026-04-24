import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  FlaskConical,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

type Study = {
  id: number;
  product_id: number;
  title: string;
  description?: string;
  status: string;
  created_at: string;
};

function statusBadge(status: string) {
  if (status === "active")
    return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>;
  if (status === "closed")
    return <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Closed</Badge>;
  return <Badge variant="secondary">Draft</Badge>;
}

export default function AdminStudies() {
  const navigate = useNavigate();
  const { isAdmin, getAuthHeaders } = useAdmin();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    product_id: "",
    title: "",
    description: "",
    consent_text: "",
    instructions_hyve: "",
    instructions_traditional: "",
  });

  const { data: studies = [], isLoading } = useQuery<Study[]>({
    queryKey: ["admin-studies"],
    queryFn: async () => {
      const res = await api.get("/experiments/studies", {
        headers: getAuthHeaders(),
      });
      return res.data;
    },
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(
        "/experiments/studies",
        {
          product_id: parseInt(form.product_id),
          title: form.title,
          description: form.description || undefined,
          consent_text: form.consent_text || undefined,
          instructions_hyve: form.instructions_hyve || undefined,
          instructions_traditional: form.instructions_traditional || undefined,
        },
        { headers: getAuthHeaders() }
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-studies"] });
      toast.success("Study created");
      setShowCreate(false);
      navigate(`/admin/experiments/studies/${data.id}`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to create study";
      toast.error(msg);
    },
  });

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="border-b bg-background sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8 -ml-2">
              <Link to="/admin">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <FlaskConical className="h-4 w-4 text-primary" />
              </div>
              <h1 className="font-bold tracking-tight">Research Studies</h1>
            </div>
          </div>
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            New Study
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading studies…</span>
          </div>
        ) : studies.length === 0 ? (
          <Card className="border-dashed border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <FlaskConical className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-medium">
                No studies yet. Create one to get started.
              </p>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                Create First Study
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {studies.map((study) => (
              <Card
                key={study.id}
                className="border-border/40 hover:border-border transition-colors cursor-pointer"
                onClick={() => navigate(`/admin/experiments/studies/${study.id}`)}
              >
                <CardContent className="p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm truncate">{study.title}</span>
                      {statusBadge(study.status)}
                    </div>
                    {study.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {study.description}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 font-medium">
                      Product ID: {study.product_id} · Created{" "}
                      {new Date(study.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create study dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-black">New Research Study</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Product ID *
              </label>
              <Input
                type="number"
                placeholder="e.g. 3"
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground/60">
                Product must be in "ready" status.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Study Title *
              </label>
              <Input
                placeholder="e.g. HYVE vs Traditional Evaluation — Spring 2026"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Description
              </label>
              <Textarea
                placeholder="Brief description shown to participants on the landing page."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Consent Statement
              </label>
              <Textarea
                placeholder="Informed consent text shown before participants begin."
                value={form.consent_text}
                onChange={(e) => setForm({ ...form, consent_text: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Instructions — HYVE Arm
              </label>
              <Textarea
                placeholder="Task instructions for participants assigned to HYVE."
                value={form.instructions_hyve}
                onChange={(e) => setForm({ ...form, instructions_hyve: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Instructions — Traditional Arm
              </label>
              <Textarea
                placeholder="Task instructions for participants assigned to Traditional."
                value={form.instructions_traditional}
                onChange={(e) =>
                  setForm({ ...form, instructions_traditional: e.target.value })
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.product_id || !form.title || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating…</>
              ) : (
                "Create Study"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
