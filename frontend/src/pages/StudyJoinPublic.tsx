import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { useStudySession } from "@/hooks/useStudySession";
import { Button } from "@/components/ui/button";
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
  ArrowLeft,
  Link2,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

type PublicStudyInfo = {
  title: string;
  description?: string;
  consent_text?: string;
  instructions_hyve?: string;
  instructions_traditional?: string;
  status: string;
  public_link_active: boolean;
};

type PublicJoinResponse = {
  invite_code: string;
  session_token: string;
  assigned_platform: "hyve" | "traditional";
  product_id: number;
  instructions: string;
};

export default function StudyJoinPublic() {
  const { publicToken } = useParams<{ publicToken: string }>();
  const navigate = useNavigate();
  const { saveSession } = useStudySession();

  const [consentChecked, setConsentChecked] = useState(false);

  const {
    data: studyInfo,
    isLoading,
    isError,
  } = useQuery<PublicStudyInfo>({
    queryKey: ["public-study-info", publicToken],
    queryFn: async () => {
      const res = await api.get(`/experiments/public/join/${publicToken}`);
      return res.data;
    },
    enabled: !!publicToken,
    retry: false,
  });

  const joinMutation = useMutation({
    mutationFn: async (): Promise<PublicJoinResponse> => {
      const res = await api.post(`/experiments/public/join/${publicToken}`);
      return res.data;
    },
    onSuccess: (data) => {
      saveSession({
        session_token: data.session_token,
        assigned_platform: data.assigned_platform,
        product_id: data.product_id,
        instructions: data.instructions,
        invite_code: data.invite_code,
      });
      navigate(`/study/${data.invite_code}/session`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Failed to join study. Please try again.";
      toast.error(msg);
    },
  });

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  const studyNotActive =
    studyInfo && studyInfo.status !== "active";
  const linkInactive = studyInfo && !studyInfo.public_link_active;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex justify-start">
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-3 gap-2 text-xs font-black uppercase tracking-widest"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

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
            You've been invited to participate in an academic study
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center gap-3 text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Loading study…</span>
          </div>
        )}

        {/* Error: link invalid / disabled */}
        {isError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-5 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-destructive">
                  Link Not Available
                </p>
                <p className="text-xs text-muted-foreground">
                  This study link is no longer valid or has been disabled by the
                  research team. Please contact the study organizer.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Link inactive */}
        {linkInactive && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-amber-500">
                  This Link Is Inactive
                </p>
                <p className="text-xs text-muted-foreground">
                  The research team has temporarily disabled this public join link.
                  Please contact the study organizer for an active link.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Study not active */}
        {studyNotActive && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-5 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-amber-500">
                  Study Not Accepting Participants
                </p>
                <p className="text-xs text-muted-foreground">
                  This study is not currently active. Please check back later or
                  contact the research team.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Study info + consent */}
        {studyInfo && studyInfo.status === "active" && studyInfo.public_link_active && (
          <>
            {/* Study details card */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary mb-1">
                  <Link2 className="h-3.5 w-3.5" />
                  Study Details
                </div>
                <CardTitle className="text-xl font-black leading-tight">
                  {studyInfo.title}
                </CardTitle>
                {studyInfo.description && (
                  <CardDescription className="text-sm leading-relaxed">
                    {studyInfo.description}
                  </CardDescription>
                )}
              </CardHeader>
            </Card>

            {/* Consent card */}
            {studyInfo.consent_text && (
              <Card className="border-border/50 bg-muted/20">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Informed Consent
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {studyInfo.consent_text}
                  </p>
                  <div className="flex items-start gap-3 pt-1">
                    <Checkbox
                      id="consent"
                      checked={consentChecked}
                      onCheckedChange={(checked) =>
                        setConsentChecked(checked === true)
                      }
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="consent"
                      className="text-xs font-medium leading-relaxed cursor-pointer"
                    >
                      I have read and understand the above consent statement and
                      agree to participate voluntarily.
                    </label>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Instructions preview */}
            {(studyInfo.instructions_hyve || studyInfo.instructions_traditional) && (
              <Card className="border-border/50 bg-muted/20">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                    <BookOpen className="h-3.5 w-3.5" />
                    Task Instructions
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                    Participants are assigned to one arm at start. You may receive HYVE or Traditional instructions:
                  </p>
                  {studyInfo.instructions_hyve && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary inline-flex">
                        HYVE
                      </span>
                      <div className="text-xs text-muted-foreground leading-relaxed bg-background/60 rounded-lg border border-border/40 p-3 whitespace-pre-wrap">
                        {studyInfo.instructions_hyve}
                      </div>
                    </div>
                  )}
                  {studyInfo.instructions_traditional && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground inline-flex">
                        Traditional
                      </span>
                      <div className="text-xs text-muted-foreground leading-relaxed bg-background/60 rounded-lg border border-border/40 p-3 whitespace-pre-wrap">
                        {studyInfo.instructions_traditional}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* If there's no consent text, show a simple checkbox */}
            {!studyInfo.consent_text && (
              <Card className="border-border/50 bg-muted/20">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="consent"
                      checked={consentChecked}
                      onCheckedChange={(checked) =>
                        setConsentChecked(checked === true)
                      }
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="consent"
                      className="text-xs font-medium leading-relaxed cursor-pointer"
                    >
                      I understand this is a voluntary research study and agree
                      to participate. My responses will be used anonymously.
                    </label>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Proceed button */}
            <Button
              size="lg"
              className="w-full font-black uppercase tracking-widest h-12"
              disabled={!consentChecked || joinMutation.isPending}
              onClick={() => joinMutation.mutate()}
            >
              {joinMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Starting session…
                </>
              ) : (
                "Proceed to Study"
              )}
            </Button>

            <p className="text-center text-[10px] text-muted-foreground/60">
              Your participation is anonymous. No personally identifiable
              information is collected.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
