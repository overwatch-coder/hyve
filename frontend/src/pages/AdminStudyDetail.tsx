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
import {
  ArrowLeft,
  FlaskConical,
  Loader2,
  Copy,
  CheckCheck,
  BarChart2,
  Mail,
  Send,
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
  created_at: string;
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
  const [emailList, setEmailList] = useState(""); // newline-separated emails
  const [copied, setCopied] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);

  // Local edit state for study config
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Study>>({});

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
    mutationFn: async () => {
      const emails = emailList
        .split("\n")
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
      const body = emails.length > 0
        ? { emails, count: emails.length }
        : { count: inviteCount };
      const res = await api.post(
        `/experiments/studies/${studyId}/invites`,
        body,
        { headers: getAuthHeaders() }
      );
      return { data: res.data, emailCount: emails.length };
    },
    onSuccess: ({ emailCount }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-study-invites", studyId] });
      queryClient.invalidateQueries({ queryKey: ["admin-study-analytics", studyId] });
      const msg = emailCount > 0
        ? `Generated ${emailCount} codes and queued ${emailCount} emails`
        : `Generated ${inviteCount} invite codes`;
      toast.success(msg);
      setEmailList("");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to generate invites";
      toast.error(msg);
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
        title: study.title,
        description: study.description,
        consent_text: study.consent_text,
        instructions_hyve: study.instructions_hyve,
        instructions_traditional: study.instructions_traditional,
      });
      setEditing(true);
    }
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
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="border-b bg-background sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8 -ml-2">
              <Link to="/admin/experiments/studies">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <FlaskConical className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="font-bold tracking-tight leading-tight text-sm">
                  {study.title}
                </h1>
                <div className="flex items-center gap-1.5">{statusBadge(study.status)}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-8">
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
                <Field label="Title">
                  <Input
                    value={editForm.title ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  />
                </Field>
                <Field label="Description">
                  <Textarea
                    value={editForm.description ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={2}
                  />
                </Field>
                <Field label="Consent Statement">
                  <Textarea
                    value={editForm.consent_text ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, consent_text: e.target.value })}
                    rows={3}
                  />
                </Field>
                <Field label="Instructions — HYVE Arm">
                  <Textarea
                    value={editForm.instructions_hyve ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, instructions_hyve: e.target.value })
                    }
                    rows={3}
                  />
                </Field>
                <Field label="Instructions — Traditional Arm">
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

        {/* Invite Generation */}
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-base font-black">Generate Invite Codes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-xs text-muted-foreground">
              Codes are balanced 50/50 between HYVE and Traditional arms. Each code is single-use.
            </p>

            {/* Email list (optional) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" />
                Participant Emails (one per line)
              </label>
              <Textarea
                placeholder={`alice@example.com\nbob@example.com\ncarol@example.com`}
                value={emailList}
                onChange={(e) => setEmailList(e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground/70">
                If emails are provided, one code is generated per address and invite links are
                sent automatically. Leave blank to generate codes without emailing.
              </p>
            </div>

            {/* Count (only shown when no emails) */}
            {emailList.trim().length === 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Count
                </label>
                <Input
                  type="number"
                  min={2}
                  max={200}
                  value={inviteCount}
                  onChange={(e) => setInviteCount(parseInt(e.target.value) || 2)}
                  className="w-28"
                />
              </div>
            )}

            <Button
              size="sm"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Generating…</>
              ) : emailList.trim().length > 0 ? (
                <><Send className="h-3.5 w-3.5 mr-1.5" />Generate & Send Emails</>
              ) : (
                "Generate Codes"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Invite Code Table */}
        {invites.length > 0 && (
          <Card className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-black">
                Invite Codes ({invites.length})
              </CardTitle>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyAllCodes}>
                {copied ? (
                  <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" /> Copy Unused</>
                )}
              </Button>
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
                        <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Code
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Platform
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Email
                        </th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Status
                        </th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
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
                            invite.used
                              ? "bg-muted/20 text-muted-foreground"
                              : "hover:bg-muted/10"
                          )}
                        >
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
                          <td className="px-4 py-2.5">
                            {invite.participant_email ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                                  {invite.participant_email}
                                </span>
                                {invite.email_sent && (
                                  <span className="text-[9px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
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
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {invite.used_at
                              ? new Date(invite.used_at).toLocaleString()
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center">
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
                                  <><Mail className="h-3 w-3" /> Resend</>
                                )}
                              </Button>
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
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
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
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
