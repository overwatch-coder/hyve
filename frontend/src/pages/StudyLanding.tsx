import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { useStudySession } from "@/hooks/useStudySession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  FlaskConical,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export default function StudyLanding() {
  const { inviteCode: urlCode } = useParams<{ inviteCode?: string }>();
  const navigate = useNavigate();
  const { saveSession } = useStudySession();

  const [manualCode, setManualCode] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);

  const activeCode = (urlCode || manualCode).trim().toUpperCase();

  // Resolve invite when we have a code of expected length
  const {
    data: study,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["study-invite", activeCode],
    queryFn: async () => {
      const res = await api.get(`/experiments/study/${activeCode}`);
      return res.data;
    },
    enabled: activeCode.length >= 8,
    retry: false,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/experiments/study/${activeCode}/start`);
      return res.data;
    },
    onSuccess: (data) => {
      saveSession({
        session_token: data.session_token,
        assigned_platform: data.assigned_platform,
        product_id: data.product_id,
        instructions: data.instructions,
        invite_code: activeCode,
      });
      navigate(`/study/${activeCode}/session`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to start session";
      toast.error(msg);
    },
  });

  const studyError =
    isError
      ? ((error as { response?: { data?: { detail?: string } } })?.response
          ?.data?.detail ?? "Invalid invite code")
      : null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 mb-2">
            <FlaskConical className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight uppercase">
            HYVE{" "}
            <span className="text-primary">Research Study</span>
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            Enter your invite code to participate
          </p>
        </div>

        {/* Manual code entry (only when no URL code) */}
        {!urlCode && (
          <Card className="border-border/50">
            <CardContent className="p-6 space-y-3">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Invite Code
              </label>
              <Input
                placeholder="e.g. A1B2C3D4E5F6"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                className="font-mono tracking-widest text-lg h-12 text-center"
                maxLength={12}
              />
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {isLoading && activeCode.length >= 8 && (
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Validating code…</span>
          </div>
        )}

        {/* Error */}
        {studyError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive font-medium">
                {studyError}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Already used */}
        {study?.already_used && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                This invite code has already been used. Each code can only be
                used once.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Study info + consent */}
        {study && study.valid && (
          <Card className="border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-black">{study.title}</CardTitle>
              {study.description && (
                <CardDescription className="text-sm leading-relaxed">
                  {study.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Consent text */}
              {study.consent_text && (
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Consent Statement
                  </p>
                  <div className="text-sm text-muted-foreground leading-relaxed bg-muted/30 rounded-lg border border-border/40 p-4">
                    {study.consent_text}
                  </div>
                </div>
              )}

              {/* Privacy notice */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This study is completely anonymous. No personal information is
                  collected or stored. Your responses are used only for academic
                  research purposes.
                </p>
              </div>

              {/* Consent checkbox */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent"
                  checked={consentChecked}
                  onCheckedChange={(v) => setConsentChecked(!!v)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="consent"
                  className="text-sm font-medium cursor-pointer leading-relaxed"
                >
                  I have read and understand the study description. I agree to
                  participate voluntarily.
                </label>
              </div>

              <Button
                className="w-full h-12 font-black uppercase tracking-widest text-sm"
                disabled={!consentChecked || startMutation.isPending}
                onClick={() => startMutation.mutate()}
              >
                {startMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Starting Session…
                  </>
                ) : (
                  "I Agree — Begin Study"
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
