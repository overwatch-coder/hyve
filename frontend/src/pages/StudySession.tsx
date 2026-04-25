import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ReactFlowProvider } from "@xyflow/react";
import api from "@/lib/api";
import { useStudySession } from "@/hooks/useStudySession";
import ExperimentMode from "@/components/ExperimentMode";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";

export default function StudySession() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { session, clearSession } = useStudySession();
  const [submitted, setSubmitted] = useState(false);

  // Guard: must have a valid session for this specific invite code
  useEffect(() => {
    if (!submitted && (!session || session.invite_code !== (inviteCode ?? "").toUpperCase())) {
      navigate(`/study/${inviteCode}`, { replace: true });
    }
  }, [session, inviteCode, navigate, submitted]);

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ["study-product", session?.product_id],
    queryFn: async () => {
      const res = await api.get(`/products/${session!.product_id}`);
      return res.data;
    },
    enabled: !!session?.product_id,
  });

  const { data: analytics } = useQuery({
    queryKey: ["study-product-analytics", session?.product_id],
    queryFn: async () => {
      const res = await api.get(`/products/${session!.product_id}/analytics`);
      return res.data;
    },
    enabled: !!session?.product_id,
  });

  // While the guard check runs, render nothing to avoid flash
  if (!session) return null;

  if (productLoading || !product) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
          Preparing your study environment…
        </p>
      </div>
    );
  }

  if (product.status !== "ready") {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-6 bg-background px-4">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm font-semibold text-center text-muted-foreground max-w-sm">
          The study product is still being prepared. Please try again in a few
          minutes.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <ExperimentMode
        open={true}
        product={product}
        analytics={analytics}
        locked={true}
        lockedPlatform={session.assigned_platform}
        sessionToken={session.session_token}
        studyInstructions={session.instructions}
        onExperimentComplete={() => {
          setSubmitted(true);
          clearSession();
        }}
        onOpenChange={(open) => {
          if (!open) {
            clearSession();
            navigate(
              submitted ? `/study/${inviteCode}?submitted=1` : `/study/${inviteCode}`,
              { replace: true },
            );
          }
        }}
      />
    </ReactFlowProvider>
  );
}
