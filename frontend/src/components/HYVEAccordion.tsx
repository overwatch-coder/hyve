import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, TrendingUp, TrendingDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSentimentVerdict, getSentimentColor } from "@/lib/sentiment";

interface Claim {
  id: number;
  claim_text: string;
  sentiment_polarity: string;
  severity: number;
  mention_count: number;
}

interface Theme {
  id: number;
  name: string;
  positive_ratio: number;
  claim_count: number;
  recommendation?: string;
  claims: Claim[];
}

interface HYVEAccordionProps {
  themes: Theme[];
  searchQuery: string;
}

const HYVEAccordion: React.FC<HYVEAccordionProps> = ({
  themes,
  searchQuery,
}) => {
  const filteredThemes = themes
    .map((theme) => {
      const filteredClaims = theme.claims.filter((claim) =>
        claim.claim_text.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      return { ...theme, claims: filteredClaims };
    })
    .filter(
      (theme) =>
        theme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        theme.claims.length > 0,
    );

  return (
    <Accordion type="single" collapsible className="w-full space-y-4">
      {filteredThemes.map((theme) => {
        const positiveClaims = theme.claims.filter(
          (c) => c.sentiment_polarity === "positive",
        );
        const negativeClaims = theme.claims.filter(
          (c) => c.sentiment_polarity === "negative",
        );
        const neutralClaims = theme.claims.filter(
          (c) => c.sentiment_polarity === "neutral",
        );

        const isPositive = theme.positive_ratio >= 0.6;
        const isNegative = theme.positive_ratio <= 0.4;

        return (
          <AccordionItem
            key={theme.id}
            value={`theme-${theme.id}`}
            className={cn(
              "border rounded-xl px-4 transition-all duration-200 shadow-sm",
              isPositive
                ? "bg-emerald-50/30 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/30"
                : isNegative
                  ? "bg-rose-50/30 border-rose-100 dark:bg-rose-950/10 dark:border-rose-900/30"
                  : "bg-card border-border",
            )}
          >
            <AccordionTrigger className="hover:no-underline py-6">
              <div className="flex flex-col items-start text-left w-full gap-2">
                <div className="flex items-center justify-between w-full pr-4">
                  <h3 className="text-xl font-bold tracking-tight">
                    {theme.name}
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Reception
                      </span>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden flex"
                          title={`Higher % = more positive consumer reviews. ${Math.round(theme.positive_ratio * 100)}% are positive.`}
                        >
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${theme.positive_ratio * 100}%` }}
                          />
                          <div
                            className="h-full bg-rose-500"
                            style={{
                              width: `${(1 - theme.positive_ratio) * 100}%`,
                            }}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-xs font-black",
                            getSentimentColor(theme.positive_ratio),
                          )}
                        >
                          {getSentimentVerdict(theme.positive_ratio)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {theme.claim_count} consumer insights extracted
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-6">
              <div className="space-y-6 pt-2">
                {/* Sentiment Drill-down (Separated Sections) */}
                <div className="space-y-6">
                  {/* Positive Sentiments */}
                  {positiveClaims.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          Strengths
                        </span>
                        <div className="h-px flex-1 bg-emerald-100 dark:bg-emerald-900/40" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {positiveClaims.map((claim) => (
                          <div
                            key={claim.id}
                            className={cn(
                              "flex items-center justify-between py-2 px-3 border rounded-lg bg-emerald-50/50 border-emerald-100/50 text-emerald-800 dark:bg-emerald-900/10 dark:text-emerald-300 dark:border-emerald-800/30 transition-all",
                              searchQuery &&
                                claim.claim_text
                                  .toLowerCase()
                                  .includes(searchQuery.toLowerCase()) &&
                                "ring-2 ring-primary ring-offset-1",
                            )}
                          >
                            <span className="text-sm font-medium leading-tight">
                              {claim.claim_text}
                            </span>
                            {claim.mention_count > 0 && (
                              <Badge
                                variant="outline"
                                className="ml-2 h-5 px-1.5 text-[9px] font-bold border-emerald-200 bg-emerald-100/50 dark:border-emerald-700/50 dark:bg-emerald-800/50"
                              >
                                {claim.mention_count}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Negative Sentiments */}
                  {negativeClaims.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                        <TrendingDown className="h-4 w-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          Weaknesses
                        </span>
                        <div className="h-px flex-1 bg-rose-100 dark:bg-rose-900/40" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {negativeClaims.map((claim) => (
                          <div
                            key={claim.id}
                            className={cn(
                              "flex items-center justify-between py-2 px-3 border rounded-lg bg-rose-50/50 border-rose-100/50 text-rose-800 dark:bg-rose-900/10 dark:text-rose-300 dark:border-rose-800/30 transition-all",
                              searchQuery &&
                                claim.claim_text
                                  .toLowerCase()
                                  .includes(searchQuery.toLowerCase()) &&
                                "ring-2 ring-primary ring-offset-1",
                            )}
                          >
                            <span className="text-sm font-medium leading-tight">
                              {claim.claim_text}
                            </span>
                            {claim.mention_count > 0 && (
                              <Badge
                                variant="outline"
                                className="ml-2 h-5 px-1.5 text-[9px] font-bold border-rose-200 bg-rose-100/50 dark:border-rose-700/50 dark:bg-rose-800/50"
                              >
                                {claim.mention_count}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Neutral/Other Claims */}
                {neutralClaims.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Search className="h-4 w-4" />
                      <span className="text-xs font-black uppercase tracking-widest">
                        Other Insights
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {neutralClaims.map((claim) => (
                        <Badge
                          key={claim.id}
                          variant="secondary"
                          className={cn(
                            "py-1.5 px-3",
                            searchQuery &&
                              claim.claim_text
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase()) &&
                              "ring-2 ring-primary ring-offset-2",
                          )}
                        >
                          {claim.claim_text}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Theme Recommendation (The WOW Moment) */}
                {theme.recommendation && (
                  <div className="mt-6 p-5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                      <Lightbulb className="h-5 w-5 fill-amber-500/20" />
                      <span className="text-sm font-black uppercase tracking-tight">
                        AI Recommendation
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-relaxed dark:text-amber-200/80">
                      {theme.recommendation}
                    </p>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}

      {filteredThemes.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          No themes found matching "{searchQuery}"
        </div>
      )}
    </Accordion>
  );
};

export default HYVEAccordion;
