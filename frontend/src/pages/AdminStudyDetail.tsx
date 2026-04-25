import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  FlaskConical,
  Loader2,
  Copy,
  CheckCheck,
  BarChart2,
  Mail,
  Send,
  Plus,
  Trash2,
  Sparkles,
  Link2,
  Globe,
  RefreshCw,
  LinkOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Study = {
  id: number;
  product_id: number;
  title: string;
  description?: string;
  consent_text?: string;
  instructions_hyve?: string;
  instructions_traditional?: string;
  status: string;
  public_token?: string;
  created_at: string;
};

type ProductOption = {
  id: number;
  name: string;
  category: string;
  status: string;
};

type Invite = {
  id: number;
  code: string;
  assigned_platform: string;
  used: boolean;
  used_at?: string;
  participant_email?: string;
  email_sent: boolean;
  email_sent_at?: string;
  created_at: string;
};

type EmailRow = {
  id: number;
  email: string;
};

type StudyCopyField =
  | "description"
  | "consent_text"
  | "instructions_hyve"
  | "instructions_traditional";

const FIELD_LABELS: Record<StudyCopyField, string> = {
  description: "Description",
  consent_text: "Consent Statement",
  instructions_hyve: "Instructions \u2014 HYVE Arm",
  instructions_traditional: "Instructions \u2014 Traditional Arm",
};

function maskEmail(email?: string) {
  if (!email) return "—";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;
  const visibleLocal = localPart.length <= 2
    ? `${localPart[0] || ""}*`
    : `${localPart.slice(0, 2)}${"*".repeat(Math.max(localPart.length - 2, 2))}`;
  const [domainName, ...rest] = domain.split(".");
  const visibleDomain = domainName.length <= 2
    ? `${domainName[0] || ""}*`
    : `${domainName.slice(0, 2)}${"*".repeat(Math.max(domainName.length - 2, 2))}`;
  return `${visibleLocal}@${visibleDomain}${rest.length ? `.${rest.join(".")}` : ""}`;
}

function statusBadge(status: string) {
  if (status === "active")
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
        Active
      </Badge>
    );
  if (status === "closed")
    return (
      <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">
        Closed
      </Badge>
    );
  return <Badge variant="secondary">Draft</Badge>;
}

export default function AdminStudyDetail() {
  const { studyId } = useParams<{ studyId: string }>();
  const { getAuthHeaders } = useAdmin();
  const queryClient = useQueryClient();

  const [inviteCount, setInviteCount] = useState(20);
  const [emailRows, setEmailRows] = useState<EmailRow[]>([{ id: 1, email: "" }]);
  const [copied, setCopied] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);
  const [sendingDraftRowId, setSendingDraftRowId] = useState<number | null>(null);
  const [inviteToDelete, setInviteToDelete] = useState<Invite | null>(null);
  const [selectedInvites, setSelectedInvites] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [aiField, setAiField] = useState<StudyCopyField | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [showDisableLinkConfirm, setShowDisableLinkConfirm] = useState(false);

  // Local edit state for study config
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Study>>({});

  const { data: productsResponse } = useQuery<{ items: ProductOption[] }>({
    queryKey: ["study-product-options"],
    queryFn: async () => {
      const res = await api.get("/products?page=1&size=100");
      return res.data;
    },
  });

  const readyProducts = (productsResponse?.items || []).filter(
    (p) => p.status === "ready",
  );

  const { data: study, isLoading: studyLoading } = useQuery<Study>({
    queryKey: ["admin-study", studyId],
    queryFn: async () => {
      const res = await api.get(`/experiments/studies/${studyId}`, {
        headers: getAuthHeaders(),
      });
      return res.data;
    },
  });

  const { data: invites = [], isLoading: invitesLoading } = useQuery<Invite[]>({
    queryKey: ["admin-study-invites", studyId],
    queryFn: async () => {
      const res = await api.get(`/experiments/studies/${studyId}/invites`, {
        headers: getAuthHeaders(),
      });
      return res.data;
    },
  });

  const { data: analytics } = useQuery({
    queryKey: ["admin-study-analytics", studyId],
    queryFn: async () => {
      const res = await api.get(`/experiments/studies/${studyId}/analytics`, {
        headers: getAuthHeaders(),
      });
      return res.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Study>) => {
      await api.patch(`/experiments/studies/${studyId}`, payload, {
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-study", studyId] });
      toast.success("Study updated");
      setEditing(false);
    },
    onError: () => toast.error("Failed to update study"),
  });

  const generateMutation = useMutation({
    mutationFn: async (payload?: { emails?: string[]; count?: number }) => {
      const emails = payload?.emails?.filter((e) => e.trim().length > 0) || [];
      const body = emails.length > 0
        ? { emails, count: emails.length }
        : { count: payload?.count ?? inviteCount };
      const res = await api.post(
        `/experiments/studies/${studyId}/invites`,
        body,
        { headers: getAuthHeaders() }
      );
      return { data: res.data, emailCount: emails.length };
    },
    onSuccess: ({ emailCount }, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-study-invites", studyId] });
      queryClient.invalidateQueries({ queryKey: ["admin-study-analytics", studyId] });
      const msg = emailCount > 0
        ? `Generated ${emailCount} codes and queued ${emailCount} emails`
        : `Generated ${inviteCount} invite codes`;
      toast.success(msg);
      if ((variables?.emails?.length || 0) > 0) {
        if ((variables?.emails?.length || 0) === 1 && sendingDraftRowId !== null) {
          setEmailRows((prev) => prev.map((row) => (
            row.id === sendingDraftRowId ? { ...row, email: "" } : row
          )));
        } else {
          setEmailRows([{ id: Date.now(), email: "" }]);
        }
      }
      setSendingDraftRowId(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to generate invites";
      toast.error(msg);
      setSendingDraftRowId(null);
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      await api.post(
        `/experiments/studies/${studyId}/invites/${inviteId}/send-email`,
        {},
        { headers: getAuthHeaders() }
      );
      return inviteId;
    },
    onSuccess: (inviteId) => {
      queryClient.invalidateQueries({ queryKey: ["admin-study-invites", studyId] });
      toast.success("Invite email queued");
      setSendingEmailId(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to send email";
      toast.error(msg);
      setSendingEmailId(null);
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      await api.delete(`/experiments/studies/${studyId}/invites/${inviteId}`, {
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-study-invites", studyId] });
      queryClient.invalidateQueries({ queryKey: ["admin-study-analytics", studyId] });
      toast.success("Invite code deleted");
      setInviteToDelete(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to delete invite";
      toast.error(msg);
      setInviteToDelete(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await api.delete(`/experiments/studies/${studyId}/invites`, {
        headers: getAuthHeaders(),
        data: { ids },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-study-invites", studyId] });
      queryClient.invalidateQueries({ queryKey: ["admin-study-analytics", studyId] });
      toast.success(`Deleted ${selectedInvites.size} invite code${selectedInvites.size !== 1 ? "s" : ""}`);
      setSelectedInvites(new Set());
      setShowBulkDeleteConfirm(false);
    },
    onError: () => {
      toast.error("Failed to bulk-delete invites");
      setShowBulkDeleteConfirm(false);
    },
  });

  const toggleSelectInvite = (id: number) => {
    setSelectedInvites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedInvites.size === invites.length) {
      setSelectedInvites(new Set());
    } else {
      setSelectedInvites(new Set(invites.map((i) => i.id)));
    }
  };

  const aiAssistMutation = useMutation({
    mutationFn: async (field: StudyCopyField) => {
      if (!study?.product_id) throw new Error("Study has no linked product");
      const res = await api.post(
        "/experiments/studies/ai-assist",
        {
          product_id: study.product_id,
          field,
          current_text: (editForm[field as keyof typeof editForm] as string) || undefined,
          instruction: aiInstruction || undefined,
        },
        { headers: getAuthHeaders() },
      );
      return { field, text: res.data.text as string };
    },
    onSuccess: ({ field, text }) => {
      setEditForm((prev) => ({ ...prev, [field]: text }));
      toast.success(`${FIELD_LABELS[field]} updated`);
      setAiField(null);
      setAiInstruction("");
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data
              ?.detail || "AI generation failed";
      toast.error(msg);
    },
  });

  const openAiField = (field: StudyCopyField) => {
    setAiField(field);
    setAiInstruction("");
  };

  const generatePublicLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(
        `/experiments/studies/${studyId}/public-link`,
        {},
        { headers: getAuthHeaders() },
      );
      return res.data as { public_token: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-study", studyId] });
      toast.success("Public link generated");
    },
    onError: () => toast.error("Failed to generate public link"),
  });

  const disablePublicLinkMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/experiments/studies/${studyId}/public-link`, {
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-study", studyId] });
      setShowDisableLinkConfirm(false);
      toast.success("Public link disabled");
    },
    onError: () => toast.error("Failed to disable public link"),
  });

  const publicJoinUrl = study?.public_token
    ? `${window.location.origin}/join/${study.public_token}`
    : null;

  const copyPublicLink = () => {
    if (!publicJoinUrl) return;
    navigator.clipboard.writeText(publicJoinUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const setStatus = (status: string) => {
    updateMutation.mutate({ status });
  };

  const copyAllCodes = () => {
    const unused = invites.filter((i) => !i.used).map((i) => i.code);
    if (unused.length === 0) {
      toast.error("No unused codes to copy");
      return;
    }
    navigator.clipboard.writeText(unused.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(`Copied ${unused.length} unused codes`);
  };

  const startEditing = () => {
    if (study) {
      setEditForm({
        product_id: study.product_id,
        title: study.title,
        description: study.description,
        consent_text: study.consent_text,
        instructions_hyve: study.instructions_hyve,
        instructions_traditional: study.instructions_traditional,
      });
      setEditing(true);
    }
  };

  const filledEmailRows = emailRows.filter((row) => row.email.trim().length > 0);

  const addEmailRow = () => {
    setEmailRows((prev) => [...prev, { id: Date.now(), email: "" }]);
  };

  const updateEmailRow = (id: number, email: string) => {
    setEmailRows((prev) => prev.map((row) => (row.id === id ? { ...row, email } : row)));
  };

  const removeEmailRow = (id: number) => {
    setEmailRows((prev) => {
      if (prev.length === 1) {
        return [{ id: prev[0].id, email: "" }];
      }
      return prev.filter((row) => row.id !== id);
    });
  };

  if (studyLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">Loading study…</span>
      </div>
    );
  }

  if (!study) return null;

  return (
    <>
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
            <FlaskConical className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight leading-tight">{study.title}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">{statusBadge(study.status)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {study.status === "draft" && (
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={() => setStatus("active")}
              disabled={updateMutation.isPending}
            >
              Activate Study
            </Button>
          )}
          {study.status === "active" && (
            <Button
              size="sm"
              variant="outline"
              className="border-rose-500/40 text-rose-500 hover:bg-rose-500/5"
              onClick={() => setStatus("closed")}
              disabled={updateMutation.isPending}
            >
              Close Study
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/experiments/analysis">
              <BarChart2 className="h-4 w-4 mr-2" />
              Analysis
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Quick stats */}
        {analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Invites", value: analytics.total_invites },
              { label: "Used", value: analytics.used_invites },
              { label: "Completions", value: analytics.completions },
              { label: "Pending Review", value: analytics.pending_review },
            ].map((s) => (
              <Card key={s.label} className="border-border/40">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-black">{s.value}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                    {s.label}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Study Config */}
        <Card className="border-border/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-black">Study Configuration</CardTitle>
            {!editing && (
              <Button variant="outline" size="sm" onClick={startEditing}>
                Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <Field label="Product">
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={editForm.product_id ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, product_id: parseInt(e.target.value) })
                    }
                  >
                    <option value="">Select a product…</option>
                    {readyProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name.length > 55 ? `${p.name.slice(0, 55)}…` : p.name} ({p.category})
                      </option>
                    ))}
                    {/* keep the current product visible even if it's not "ready" */}
                    {!readyProducts.find((p) => p.id === editForm.product_id) &&
                      editForm.product_id && (
                        <option value={editForm.product_id}>
                          Product ID {editForm.product_id} (current)
                        </option>
                      )}
                  </select>
                  <p className="text-[10px] text-muted-foreground/60">
                    Only products that finished analysis are shown. The current product is always kept.
                  </p>
                </Field>
                <Field label="Title">
                  <Input
                    value={editForm.title ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  />
                </Field>
                <Field
                  label="Description"
                  onAiClick={() => openAiField("description")}
                  fieldValue={editForm.description}
                >
                  <Textarea
                    value={editForm.description ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={2}
                  />
                </Field>
                <Field
                  label="Consent Statement"
                  onAiClick={() => openAiField("consent_text")}
                  fieldValue={editForm.consent_text}
                >
                  <Textarea
                    value={editForm.consent_text ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, consent_text: e.target.value })}
                    rows={3}
                  />
                </Field>
                <Field
                  label="Instructions — HYVE Arm"
                  onAiClick={() => openAiField("instructions_hyve")}
                  fieldValue={editForm.instructions_hyve}
                >
                  <Textarea
                    value={editForm.instructions_hyve ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, instructions_hyve: e.target.value })
                    }
                    rows={3}
                  />
                </Field>
                <Field
                  label="Instructions — Traditional Arm"
                  onAiClick={() => openAiField("instructions_traditional")}
                  fieldValue={editForm.instructions_traditional}
                >
                  <Textarea
                    value={editForm.instructions_traditional ?? ""}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        instructions_traditional: e.target.value,
                      })
                    }
                    rows={3}
                  />
                </Field>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate(editForm)}
                  >
                    {updateMutation.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <dl className="space-y-3 text-sm">
                <Row label="Product ID" value={String(study.product_id)} />
                <Row label="Status" value={study.status} />
                <Row label="Description" value={study.description} />
                <Row label="Consent" value={study.consent_text} />
                <Row label="HYVE Instructions" value={study.instructions_hyve} />
                <Row
                  label="Traditional Instructions"
                  value={study.instructions_traditional}
                />
                <Row
                  label="Created"
                  value={new Date(study.created_at).toLocaleString()}
                />
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Public Join Link */}
        <Card className="border-border/40">
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <CardTitle className="text-base font-black flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Public Join Link
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Share one link on social media or messaging apps. Anyone who clicks and proceeds automatically gets a unique invite code.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {publicJoinUrl ? (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/20 p-3">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground truncate flex-1">
                    {publicJoinUrl}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 shrink-0"
                    onClick={copyPublicLink}
                  >
                    {linkCopied ? (
                      <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={copyPublicLink}
                  >
                    {linkCopied ? (
                      <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" />Copied!</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" />Copy Link</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={generatePublicLinkMutation.isPending}
                    onClick={() => generatePublicLinkMutation.mutate()}
                  >
                    {generatePublicLinkMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Rotate Link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setShowDisableLinkConfirm(true)}
                  >
                    <LinkOff className="h-3.5 w-3.5" />
                    Disable
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/60">
                  Rotating generates a new link; the old one stops working immediately. Disabling removes the link entirely.
                </p>
              </>
            ) : (
              <div className="flex flex-col items-start gap-4">
                <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 p-5 w-full text-center space-y-2">
                  <Globe className="h-6 w-6 text-muted-foreground/40 mx-auto" />
                  <p className="text-xs text-muted-foreground">
                    No public link yet. Generate one to start sharing.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={generatePublicLinkMutation.isPending}
                  onClick={() => generatePublicLinkMutation.mutate()}
                >
                  {generatePublicLinkMutation.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
                  ) : (
                    <><Link2 className="h-3.5 w-3.5" />Generate Public Link</>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invite Generation */}
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-base font-black">Generate Invite Codes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Codes are balanced between HYVE and Traditional arms based on existing counts. Each code is single-use.
            </p>

            <Tabs defaultValue="blank">
              <TabsList className="w-full">
                <TabsTrigger value="blank" className="flex-1">Blank Codes</TabsTrigger>
                <TabsTrigger value="email" className="flex-1">By Participant Email</TabsTrigger>
              </TabsList>

              {/* ── Blank Codes tab ── */}
              <TabsContent value="blank" className="space-y-3 pt-2">
                <div className="rounded-xl border border-border/40 p-4 space-y-3 bg-muted/10">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Number of Codes
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={inviteCount}
                      onChange={(e) => setInviteCount(parseInt(e.target.value) || 1)}
                      className="w-28"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateMutation.mutate({ count: inviteCount })}
                    disabled={generateMutation.isPending}
                  >
                    {generateMutation.isPending && sendingDraftRowId === null ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Generating…</>
                    ) : (
                      "Generate Codes"
                    )}
                  </Button>
                </div>
              </TabsContent>

              {/* ── By Email tab ── */}
              <TabsContent value="email" className="space-y-3 pt-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Mail className="h-3 w-3" />
                      Participant Emails
                    </label>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={addEmailRow}>
                      <Plus className="h-3.5 w-3.5" /> Add Row
                    </Button>
                  </div>

                  <div className="rounded-xl border border-border/40 overflow-hidden">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-0 bg-muted/30 border-b border-border/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <div className="px-3 py-2.5">Email</div>
                      <div className="px-3 py-2.5 text-center">Action</div>
                    </div>
                    <div className="divide-y divide-border/20">
                      {emailRows.map((row) => (
                        <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-0 items-center bg-background">
                          <div className="px-3 py-2.5">
                            <Input
                              type="email"
                              placeholder="participant@example.com"
                              value={row.email}
                              onChange={(e) => updateEmailRow(row.id, e.target.value)}
                              className="font-mono text-xs"
                            />
                          </div>
                          <div className="px-3 py-2.5 flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-[10px] font-black uppercase tracking-wide"
                              disabled={generateMutation.isPending || row.email.trim().length === 0}
                              onClick={() => {
                                setSendingDraftRowId(row.id);
                                generateMutation.mutate({ emails: [row.email.trim()] });
                              }}
                            >
                              {generateMutation.isPending && sendingDraftRowId === row.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              <span className="hidden sm:inline">Send Now</span>
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => removeEmailRow(row.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-[10px] text-muted-foreground/70">
                      Fill any number of rows, then send them one by one or send all filled rows at once.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => generateMutation.mutate({ emails: filledEmailRows.map((row) => row.email.trim()) })}
                      disabled={generateMutation.isPending || filledEmailRows.length === 0}
                    >
                      {generateMutation.isPending && sendingDraftRowId === null ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sending…</>
                      ) : (
                        <><Send className="h-3.5 w-3.5 mr-1.5" />Send All Filled</>
                      )}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Invite Code Table */}
        {invites.length > 0 && (
          <Card className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base font-black">
                Invite Codes ({invites.length})
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedInvites.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowBulkDeleteConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete {selectedInvites.size} Selected
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={copyAllCodes}>
                  {copied ? (
                    <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copy Unused</>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invitesLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading codes…</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/30">
                        <th className="px-3 py-2.5 w-10">
                          <input
                            type="checkbox"
                            className="rounded border-border accent-primary"
                            checked={selectedInvites.size === invites.length && invites.length > 0}
                            onChange={toggleSelectAll}
                            title="Select all"
                          />
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Code
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Platform
                        </th>
                        <th className="hidden sm:table-cell px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Email
                        </th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Status
                        </th>
                        <th className="hidden md:table-cell px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Used At
                        </th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map((invite) => (
                        <tr
                          key={invite.id}
                          className={cn(
                            "border-b border-border/20 transition-colors",
                            selectedInvites.has(invite.id) ? "bg-primary/5" :
                            invite.used ? "bg-muted/20 text-muted-foreground" : "hover:bg-muted/10"
                          )}
                        >
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-border accent-primary"
                              checked={selectedInvites.has(invite.id)}
                              onChange={() => toggleSelectInvite(invite.id)}
                            />
                          </td>
                          <td className="px-4 py-2.5 font-mono tracking-widest font-bold text-xs">
                            {invite.code}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={cn(
                                "text-[10px] font-black uppercase px-2 py-0.5 rounded-full",
                                invite.assigned_platform === "hyve"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {invite.assigned_platform}
                            </span>
                          </td>
                          <td className="hidden sm:table-cell px-4 py-2.5">
                            {invite.participant_email ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground truncate max-w-[160px] lg:max-w-[220px]">
                                  {maskEmail(invite.participant_email)}
                                </span>
                                {invite.email_sent && (
                                  <span className="text-[9px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full shrink-0">
                                    Sent
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {invite.used ? (
                              <span className="text-xs text-rose-500 font-bold">Used</span>
                            ) : (
                              <span className="text-xs text-emerald-500 font-bold">Available</span>
                            )}
                          </td>
                          <td className="hidden md:table-cell px-4 py-2.5 text-xs text-muted-foreground">
                            {invite.used_at
                              ? new Date(invite.used_at).toLocaleString()
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {invite.participant_email && !invite.used ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 gap-1 text-[10px] font-black uppercase tracking-wide"
                                  disabled={sendingEmailId === invite.id || sendEmailMutation.isPending}
                                  onClick={() => {
                                    setSendingEmailId(invite.id);
                                    sendEmailMutation.mutate(invite.id);
                                  }}
                                >
                                  {sendingEmailId === invite.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <><Mail className="h-3 w-3" /><span className="hidden sm:inline"> Resend</span></>
                                  )}
                                </Button>
                              ) : null}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title="Delete invite code"
                                onClick={() => setInviteToDelete(invite)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>

      {/* Delete invite confirmation */}
      <AlertDialog open={!!inviteToDelete} onOpenChange={(open) => !open && setInviteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invite Code?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the invite code{" "}
              <span className="font-mono font-bold text-foreground">
                {inviteToDelete?.code}
              </span>
              {inviteToDelete?.participant_email && (
                <>
                  {" "}(assigned to{" "}
                  <span className="font-medium text-foreground">
                    {maskEmail(inviteToDelete.participant_email)}
                  </span>
                  )
                </>
              )}.
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => inviteToDelete && deleteInviteMutation.mutate(inviteToDelete.id)}
              disabled={deleteInviteMutation.isPending}
            >
              {deleteInviteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deleting…</>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedInvites.size} Invite Code{selectedInvites.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the {selectedInvites.size} selected invite code{selectedInvites.size !== 1 ? "s" : ""}.
              {" "}Any codes that have already been used will also be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedInvites))}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deleting…</>
              ) : (
                `Delete ${selectedInvites.size} Code${selectedInvites.size !== 1 ? "s" : ""}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable public link confirmation */}
      <AlertDialog open={showDisableLinkConfirm} onOpenChange={setShowDisableLinkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Public Join Link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone who currently has the link will no longer be able to use it to join the study.
              Existing participants who joined via this link are not affected. You can generate a new link at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => disablePublicLinkMutation.mutate()}
              disabled={disablePublicLinkMutation.isPending}
            >
              {disablePublicLinkMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Disabling…</>
              ) : (
                "Disable Link"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Generate / Refine Dialog */}
      <Dialog open={!!aiField} onOpenChange={(open) => !open && setAiField(null)}>
        <DialogContent>
          {(() => {
            const hasContent = aiField
              ? !!(editForm[aiField as keyof typeof editForm] as string | undefined)?.trim()
              : false;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-black">
                    {hasContent ? "Refine Content" : "AI Generate"} —{" "}
                    {aiField ? FIELD_LABELS[aiField] : ""}
                  </DialogTitle>
                  <DialogDescription>
                    {hasContent
                      ? "Describe how you'd like to refine the existing content, or leave blank for automatic improvement."
                      : "Optionally describe what to generate (e.g. \"Keep it under 3 sentences.\"). Leave blank to auto-generate."}
                  </DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <Textarea
                    placeholder={
                      hasContent
                        ? "e.g. Make it more concise. Use a professional tone."
                        : "e.g. Professional tone. Mention the product name. Keep it concise."
                    }
                    value={aiInstruction}
                    onChange={(e) => setAiInstruction(e.target.value)}
                    rows={3}
                  />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAiField(null)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={aiAssistMutation.isPending || !aiField}
                    onClick={() => aiField && aiAssistMutation.mutate(aiField)}
                  >
                    {aiAssistMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />{hasContent ? "Refining…" : "Generating…"}</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" />{hasContent ? "Refine Content" : "Generate"}</>
                    )}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  children,
  onAiClick,
  fieldValue,
}: {
  label: string;
  children: React.ReactNode;
  onAiClick?: () => void;
  fieldValue?: string;
}) {
  const hasContent = !!fieldValue?.trim();
  return (
    <div className="space-y-1.5">
      {onAiClick ? (
        <div className="flex items-center justify-between gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {label}
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary hover:bg-primary/5"
            onClick={onAiClick}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {hasContent ? "Refine Content" : "AI Generate"}
          </Button>
        </div>
      ) : (
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-36 flex-shrink-0 pt-0.5">
        {label}
      </dt>
      <dd className="text-sm text-foreground/80 leading-relaxed">{value}</dd>
    </div>
  );
}
