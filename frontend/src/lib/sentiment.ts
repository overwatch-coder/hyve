/**
 * Shared sentiment interpretation utilities.
 *
 * Sentiment scores are 0–1 where:
 *   1.0 = 100% positive  |  0.0 = 100% negative
 *
 * Higher score = better consumer reception.
 */

export type SentimentVerdict =
  | "Highly Positive"
  | "Mostly Positive"
  | "Mixed"
  | "Mostly Negative"
  | "Highly Negative";

export function getSentimentVerdict(score: number): SentimentVerdict {
  if (score >= 0.8) return "Highly Positive";
  if (score >= 0.6) return "Mostly Positive";
  if (score >= 0.4) return "Mixed";
  if (score >= 0.2) return "Mostly Negative";
  return "Highly Negative";
}

export function getSentimentColor(score: number): string {
  if (score >= 0.7) return "text-emerald-500";
  if (score >= 0.45) return "text-amber-500";
  return "text-rose-500";
}

export function getSentimentBgColor(score: number): string {
  if (score >= 0.7) return "bg-emerald-500";
  if (score >= 0.45) return "bg-amber-500";
  return "bg-rose-500";
}
