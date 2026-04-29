import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { EyeOff, Eye, Ellipsis, Loader2, Trash2, Rows3 } from "lucide-react";
import { toast } from "sonner";

type PublicResultRow = {
  id: number;
  study_id?: number | null;
  study_title?: string | null;
  product_id: number;
  product_name?: string | null;
  platform: string;
  participant_name?: string | null;
  time_seconds: number;
  review_status: string;
  exclude_from_public: boolean;
  created_at: string;
};

type PendingPublicAction =
  | { kind: "hide" | "show"; row: PublicResultRow }
  | { kind: "delete"; row: PublicResultRow }
  | null;

function formatTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function AdminPublicExperimentResults() {
  const { getAuthHeaders } = useAdmin();
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<PendingPublicAction>(null);

  const { data: rows = [], isLoading } = useQuery<PublicResultRow[]>({
    queryKey: ["admin-public-experiment-results"],
    queryFn: async () => {
      const res = await api.get("/experiments/public-results", {
        headers: getAuthHeaders(),
      });
      return res.data;
    },
  });

  const hideMutation = useMutation({
    mutationFn: async ({
      resultId,
      excludeFromPublic,
    }: {
      resultId: number;
      excludeFromPublic: boolean;
    }) => {
      const res = await api.patch(
        `/experiments/results/${resultId}/public-visibility`,
        { exclude_from_public: excludeFromPublic },
        { headers: getAuthHeaders() },
      );
      return res.data as PublicResultRow;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.excludeFromPublic
          ? "Result hidden from public A/B results"
          : "Result restored to public A/B results",
      );
      setPendingAction(null);
      queryClient.invalidateQueries({
        queryKey: ["admin-public-experiment-results"],
      });
    },
    onError: () => {
      toast.error("Failed to update public visibility");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (resultId: number) => {
      await api.delete(`/experiments/results/${resultId}`, {
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      toast.success("Result deleted");
      setPendingAction(null);
      queryClient.invalidateQueries({
        queryKey: ["admin-public-experiment-results"],
      });
    },
    onError: () => {
      toast.error("Failed to delete result");
    },
  });

  const visibleCount = useMemo(
    () => rows.filter((row) => !row.exclude_from_public).length,
    [rows],
  );
  const hiddenCount = rows.length - visibleCount;

  const confirmPendingAction = () => {
    if (!pendingAction) return;
    if (pendingAction.kind === "delete") {
      deleteMutation.mutate(pendingAction.row.id);
      return;
    }
    hideMutation.mutate({
      resultId: pendingAction.row.id,
      excludeFromPublic: pendingAction.kind === "hide",
    });
  };

  const busy =
    hideMutation.isPending ||
    deleteMutation.isPending;

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <Rows3 className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-2xl font-black tracking-tight">
            Public A/B Results Control
          </h2>
        </div>
        <p className="text-xs font-medium text-muted-foreground">
          Hide rows from the public A/B results page or permanently delete rows you no longer want to keep.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/40">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Approved Rows
            </p>
            <p className="mt-2 text-3xl font-black">{rows.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Visible Publicly
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {visibleCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Hidden From Public
            </p>
            <p className="mt-2 text-3xl font-black text-amber-600 dark:text-amber-400">
              {hiddenCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base font-black">Manage Public Rows</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-muted/20">
                <tr className="border-b border-border/20 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3 text-left">Study</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Participant</th>
                  <th className="px-4 py-3 text-left">Platform</th>
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">Visibility</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      <div className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading public rows...
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      No approved experiment rows are available yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/20 align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{row.study_title || `Study #${row.study_id}`}</div>
                        <div className="text-xs text-muted-foreground">Result #{row.id}</div>
                      </td>
                      <td className="px-4 py-3">{row.product_name || `Product #${row.product_id}`}</td>
                      <td className="px-4 py-3">{row.participant_name || "Anonymous participant"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="uppercase">
                          {row.platform}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono">{formatTime(row.time_seconds)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            row.exclude_from_public
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          }
                        >
                          {row.exclude_from_public ? "hidden" : "visible"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Open public result actions">
                              <Ellipsis className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {row.exclude_from_public ? (
                              <DropdownMenuItem onClick={() => setPendingAction({ kind: "show", row })}>
                                <Eye className="mr-2 h-4 w-4" />
                                Show on Public Page
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setPendingAction({ kind: "hide", row })}>
                                <EyeOff className="mr-2 h-4 w-4" />
                                Hide from Public Page
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => setPendingAction({ kind: "delete", row })}
                              className="text-rose-500 focus:text-rose-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Permanently
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!pendingAction}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind === "delete"
                ? "Delete this public result?"
                : pendingAction?.kind === "hide"
                  ? "Hide this row from the public page?"
                  : "Show this row on the public page again?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === "delete"
                ? "This permanently removes the result row from the database and it will no longer appear anywhere that depends on experiment results."
                : pendingAction?.kind === "hide"
                  ? "This keeps the row in admin views but removes it from the public A/B results page."
                  : "This restores the row so it can appear on the public A/B results page again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingAction} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pendingAction?.kind === "delete"
                ? "Delete"
                : pendingAction?.kind === "hide"
                  ? "Hide"
                  : "Show"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
