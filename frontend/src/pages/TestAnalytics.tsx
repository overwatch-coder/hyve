import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Trophy,
  Users,
  Clock,
  Zap,
  ChevronLeft,
  Calendar,
  Package,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function TestAnalytics() {
  // FETCH: Aggregated Analytics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["experiment-analytics"],
    queryFn: async () => {
      const res = await api.get("/experiments/analytics");
      return res.data;
    },
  });

  // FETCH: Detailed Results (Participants)
  const { data: results, isLoading: resultsLoading } = useQuery({
    queryKey: ["experiment-results"],
    queryFn: async () => {
      const res = await api.get("/experiments/results");
      return res.data;
    },
  });

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (statsLoading || resultsLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-background">
        <div className="h-10 w-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="font-semibold text-lg animate-pulse">
          Computing Statistical Insights...
        </p>
      </div>
    );
  }

  const hyveStats = stats?.platform_stats?.find(
    (s: any) => s.platform === "hyve",
  );
  const tradStats = stats?.platform_stats?.find(
    (s: any) => s.platform === "traditional",
  );
  const hyveTime = hyveStats?.avg_time || 0;
  const tradTime = tradStats?.avg_time || 0;
  const timeSaved = tradTime > 0 ? ((tradTime - hyveTime) / tradTime) * 100 : 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <Link
              to="/admin"
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors mb-4"
            >
              <ChevronLeft className="h-3 w-3" />
              Intelligence Center
            </Link>
            <h1 className="text-3xl md:text-6xl font-black tracking-tight italic uppercase leading-none">
              Protocol <span className="text-primary">Efficacy</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground font-medium max-w-2xl">
              Comparative analysis between HYVE structured intelligence and
              traditional review scanning protocols.
            </p>
          </div>

          <div className="flex gap-4">
            <Card className="flex-1 bg-primary/5 border-primary/20 shadow-none">
              <CardContent className="p-4 md:p-6 text-center space-y-1">
                <Users className="h-4 w-4 md:h-5 md:w-5 text-primary mx-auto mb-2" />
                <div className="text-2xl md:text-3xl font-black tabular-nums">
                  {stats?.total_participants || 0}
                </div>
                <div className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Test Participants
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1 bg-emerald-500/5 border-emerald-500/20 shadow-none">
              <CardContent className="p-4 md:p-6 text-center space-y-1">
                <Zap className="h-4 w-4 md:h-5 md:w-5 text-emerald-500 mx-auto mb-2" />
                <div className="text-2xl md:text-3xl font-black tabular-nums text-emerald-500">
                  {Math.round(timeSaved)}%
                </div>
                <div className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Time Saved vs Trad
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Comparison Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          {/* Velocity Card */}
          <Card className="bg-card/30 border-white/5 backdrop-blur-2xl p-4 md:p-8 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Clock className="h-40 w-40" />
            </div>
            <CardHeader className="p-0 mb-6 md:mb-10">
              <CardTitle className="text-xl md:text-2xl font-black flex items-center gap-3">
                <Trophy className="h-5 w-5 md:h-6 md:w-6 text-amber-400" />
                Mission Velocity
              </CardTitle>
              <CardDescription className="text-sm font-bold opacity-60">
                Average seconds to complete mission objectives per protocol.
                <span className="ml-1 text-[10px] text-primary">
                  (Less is better)
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 space-y-12">
              {/* HYVE Bar */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center",
                        hyveTime > 0 ? "bg-primary/20" : "bg-muted/50",
                      )}
                    >
                      <Zap
                        className={cn(
                          "h-5 w-5",
                          hyveTime > 0
                            ? "text-primary fill-primary"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div>
                      <div
                        className={cn(
                          "text-xs font-black uppercase tracking-widest",
                          hyveTime > 0
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        HYVE Protocol
                      </div>
                      <div
                        className={cn(
                          "text-2xl font-black",
                          hyveTime === 0 && "opacity-30",
                        )}
                      >
                        {hyveTime > 0 ? formatTime(hyveTime) : "No data"}
                      </div>
                    </div>
                  </div>
                  {hyveTime > 0 && tradTime > 0 && (
                    <Badge className="bg-emerald-500/10 text-emerald-500 border-none uppercase font-black text-[10px] tracking-widest">
                      Superior Performance
                    </Badge>
                  )}
                </div>
                <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: hyveTime > 0 ? "100%" : "0%" }}
                    className={cn(
                      "h-full rounded-full transition-all duration-1000",
                      hyveTime > 0
                        ? "bg-primary shadow-[0_0_20px_rgba(var(--primary),0.4)]"
                        : "bg-muted/10 border border-white/5",
                    )}
                  />
                </div>
              </div>

              {/* Traditional Bar */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-muted/50 rounded-xl flex items-center justify-center">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Traditional Method
                      </div>
                      <div
                        className={cn(
                          "text-2xl font-black",
                          tradTime === 0 ? "opacity-30" : "opacity-40",
                        )}
                      >
                        {tradTime > 0 ? formatTime(tradTime) : "No data"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width:
                        tradTime > 0 && hyveTime > 0
                          ? `${(tradTime / Math.max(hyveTime, tradTime)) * 100}%`
                          : "0%",
                    }}
                    className={cn(
                      "h-full rounded-full transition-all duration-1000",
                      tradTime > 0
                        ? "bg-white/20"
                        : "bg-muted/10 border border-white/5",
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Participant Table */}
          <Card className="bg-card/30 border-white/5 backdrop-blur-2xl overflow-hidden flex flex-col">
            <CardHeader className="p-4 md:p-8 border-b border-white/5">
              <CardTitle className="text-xl md:text-2xl font-black flex items-center gap-3">
                <Users className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                Raw Telemetry
              </CardTitle>
              <CardDescription className="text-sm font-bold opacity-60">
                Live stream of individual participant session data.
              </CardDescription>
            </CardHeader>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="px-4 md:px-8 py-4">Participant</th>
                    <th className="px-2 md:px-4 py-4">Protocol</th>
                    <th className="px-2 md:px-4 py-4">Velocity</th>
                    <th className="px-2 md:px-4 py-4 hidden sm:table-cell">
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results?.map((res: any, i: number) => (
                    <tr
                      key={i}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors group"
                    >
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        <div className="flex items-center gap-2 md:gap-3">
                          <div className="h-7 w-7 md:h-8 md:w-8 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center font-black text-[10px] md:text-xs text-primary uppercase">
                            {res.participant_name[0]}
                          </div>
                          <div>
                            <div className="text-xs md:text-sm font-black group-hover:text-primary transition-colors line-clamp-1">
                              {res.participant_name}
                            </div>
                            <div className="text-[9px] md:text-[10px] font-bold opacity-40 flex items-center gap-1 line-clamp-1">
                              <Package className="h-2 w-2 md:h-2.5 md:w-2.5" />
                              {res.product_name || `Product #${res.product_id}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 md:px-4 py-4 md:py-6">
                        <Badge
                          variant="outline"
                          className={cn(
                            "uppercase text-[9px] md:text-[10px] font-black tracking-widest border-none px-0",
                            res.platform === "hyve"
                              ? "text-primary"
                              : "text-muted-foreground",
                          )}
                        >
                          {res.platform === "hyve" ? "HYVE AI" : "TRAD"}
                        </Badge>
                      </td>
                      <td className="px-2 md:px-4 py-4 md:py-6">
                        <div className="flex items-center gap-2 font-mono font-black tabular-nums text-xs md:text-sm">
                          <Clock className="h-3 w-3 opacity-40" />
                          {formatTime(res.time_seconds)}
                        </div>
                      </td>
                      <td className="px-2 md:px-4 py-4 md:py-6 hidden sm:table-cell">
                        <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-bold opacity-40">
                          <Calendar className="h-3 w-3" />
                          {new Date(res.created_at).toLocaleDateString()}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!results || results.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-8 py-20 text-center">
                        <div className="text-muted-foreground font-bold italic opacity-40">
                          Waiting for incoming neural telemetry...
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
