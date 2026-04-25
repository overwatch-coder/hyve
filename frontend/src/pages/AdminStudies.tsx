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
  DialogDescription,
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
  Sparkles,
  Trash2,
  Package,
} from "lucide-react";
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
import { toast } from "sonner";

type Study = {
  id: number;
  product_id: number;
  title: string;
  description?: string;
  status: string;
  created_at: string;
};

type ProductOption = {
  id: number;
  name: string;
  category: string;
  status: string;
  image_url?: string;
  summary?: string;
};

type StudyCopyField =
  | "description"
  | "consent_text"
  | "instructions_hyve"
  | "instructions_traditional";

const FIELD_LABELS: Record<StudyCopyField, string> = {
  description: "Description",
  consent_text: "Consent Statement",
  instructions_hyve: "Instructions — HYVE Arm",
  instructions_traditional: "Instructions — Traditional Arm",
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
  const [aiField, setAiField] = useState<StudyCopyField | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [form, setForm] = useState({
    product_id: "",
    title: "",
    description: "",
    consent_text: "",
    instructions_hyve: "",
    instructions_traditional: "",
  });

  const { data: productsResponse } = useQuery<{ items: ProductOption[] }>({
    queryKey: ["study-product-options"],
    queryFn: async () => {
      const res = await api.get("/products?page=1&size=100");
      return res.data;
    },
    enabled: isAdmin,
  });

  const readyProducts = (productsResponse?.items || []).filter(
    (product) => product.status === "ready",
  );
  const selectedProduct = readyProducts.find(
    (product) => String(product.id) === form.product_id,
  );

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

  const aiAssistMutation = useMutation({
    mutationFn: async (field: StudyCopyField) => {
      if (!form.product_id) {
        throw new Error("Select a product first");
      }
      const res = await api.post(
        "/experiments/studies/ai-assist",
        {
          product_id: parseInt(form.product_id),
          field,
          current_text: form[field],
          instruction: aiInstruction || undefined,
        },
        { headers: getAuthHeaders() },
      );
      return { field, text: res.data.text as string };
    },
    onSuccess: ({ field, text }) => {
      setForm((prev) => ({ ...prev, [field]: text }));
      toast.success(`${FIELD_LABELS[field]} updated`);
      setAiField(null);
      setAiInstruction("");
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            "AI generation failed";
      toast.error(msg);
    },
  });

  const openAiField = (field: StudyCopyField) => {
    if (!form.product_id) {
      toast.error("Select a product first");
      return;
    }
    setAiField(field);
    setAiInstruction("");
  };

  const [studyToDelete, setStudyToDelete] = useState<Study | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (studyId: number) => {
      await api.delete(`/experiments/studies/${studyId}`, {
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studies"] });
      toast.success("Study deleted");
      setStudyToDelete(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to delete study";
      toast.error(msg);
      setStudyToDelete(null);
    },
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
            <FlaskConical className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">Research Studies</h2>
            <p className="text-xs text-muted-foreground font-medium">Create and manage controlled research studies.</p>
          </div>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New Study
        </Button>
      </div>

      <div className="space-y-4">
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStudyToDelete(study);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
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
                Analyzed Product *
              </label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              >
                <option value="">Select a ready product</option>
                {readyProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name.length > 55
                      ? `${product.name.slice(0, 55)}\u2026`
                      : product.name}{" "}
                    ({product.category})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground/60">
                Only products that finished analysis are available for studies.
              </p>
            </div>

            {selectedProduct && (
              <Card className="border-border/40 bg-muted/20">
                <CardContent className="p-4 flex gap-4 items-start">
                  <div className="h-20 w-20 rounded-xl overflow-hidden border border-border/30 bg-muted/30 shrink-0 flex items-center justify-center">
                    {selectedProduct.image_url ? (
                      <img
                        src={selectedProduct.image_url}
                        alt={selectedProduct.name}
                        className="h-full w-full object-contain p-1"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <Package className="h-8 w-8 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-black truncate">{selectedProduct.name}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {selectedProduct.category}
                    </p>
                    {selectedProduct.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {selectedProduct.summary}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
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
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Description
                </label>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[10px] font-black uppercase tracking-widest" onClick={() => openAiField("description")}> 
                  <Sparkles className="h-3.5 w-3.5" /> AI Generate
                </Button>
              </div>
              <Textarea
                placeholder="Brief description shown to participants on the landing page."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Consent Statement
                </label>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[10px] font-black uppercase tracking-widest" onClick={() => openAiField("consent_text")}> 
                  <Sparkles className="h-3.5 w-3.5" /> AI Generate
                </Button>
              </div>
              <Textarea
                placeholder="Informed consent text shown before participants begin."
                value={form.consent_text}
                onChange={(e) => setForm({ ...form, consent_text: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Instructions — HYVE Arm
                </label>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[10px] font-black uppercase tracking-widest" onClick={() => openAiField("instructions_hyve")}> 
                  <Sparkles className="h-3.5 w-3.5" /> AI Generate
                </Button>
              </div>
              <Textarea
                placeholder="Task instructions for participants assigned to HYVE."
                value={form.instructions_hyve}
                onChange={(e) => setForm({ ...form, instructions_hyve: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Instructions — Traditional Arm
                </label>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[10px] font-black uppercase tracking-widest" onClick={() => openAiField("instructions_traditional")}> 
                  <Sparkles className="h-3.5 w-3.5" /> AI Generate
                </Button>
              </div>
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

      <Dialog open={!!aiField} onOpenChange={(open) => !open && setAiField(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-black">AI Copy Assist</DialogTitle>
            <DialogDescription>
              Generate or refine {aiField ? FIELD_LABELS[aiField].toLowerCase() : "study copy"} using the selected product context.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Current Text</p>
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {aiField ? form[aiField] || "No existing text yet." : "No field selected."}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Custom Instruction
              </label>
              <Textarea
                rows={4}
                placeholder="Optional: make it more formal, shorter, friendlier, more academic, emphasize anonymity, etc."
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiField(null)}>
              Cancel
            </Button>
            <Button
              disabled={!aiField || aiAssistMutation.isPending}
              onClick={() => aiField && aiAssistMutation.mutate(aiField)}
            >
              {aiAssistMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Generate</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete study confirmation */}
      <AlertDialog
        open={!!studyToDelete}
        onOpenChange={(open) => { if (!open) setStudyToDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Study</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong className="text-foreground">{studyToDelete?.title}</strong>?
              This will permanently remove all associated invites and participant responses.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => studyToDelete && deleteMutation.mutate(studyToDelete.id)}
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Deleting…</>
              ) : (
                "Delete Study"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
