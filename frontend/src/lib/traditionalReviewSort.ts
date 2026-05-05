export type TraditionalReviewSort =
  | "most-helpful"
  | "most-favorable"
  | "most-critical"
  | "most-recent";

export const TRADITIONAL_REVIEW_SORT_OPTIONS = [
  { value: "most-helpful", label: "Most Helpful" },
  { value: "most-favorable", label: "Most Favorable" },
  { value: "most-critical", label: "Most Critical" },
  { value: "most-recent", label: "Most Recent" },
] as const satisfies ReadonlyArray<{
  value: TraditionalReviewSort;
  label: string;
}>;

type TraditionalReviewLike = {
  helpful_votes?: number | null;
  star_rating?: number | null;
  created_at?: string | null;
};

function getHelpfulVotes(review: TraditionalReviewLike): number {
  return review.helpful_votes ?? 0;
}

function getCreatedAtTimestamp(review: TraditionalReviewLike): number {
  if (!review.created_at) {
    return 0;
  }

  const timestamp = Date.parse(review.created_at);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function compareDescending(left: number, right: number): number {
  return right - left;
}

function compareAscending(left: number, right: number): number {
  return left - right;
}

export function sortTraditionalReviews<T extends TraditionalReviewLike>(
  reviews: T[],
  sort: TraditionalReviewSort,
): T[] {
  return [...reviews].sort((left, right) => {
    const helpfulComparison = compareDescending(getHelpfulVotes(left), getHelpfulVotes(right));
    const createdAtComparison = compareDescending(getCreatedAtTimestamp(left), getCreatedAtTimestamp(right));

    if (sort === "most-helpful") {
      return helpfulComparison || createdAtComparison;
    }

    if (sort === "most-favorable") {
      const starComparison = compareDescending(left.star_rating ?? Number.NEGATIVE_INFINITY, right.star_rating ?? Number.NEGATIVE_INFINITY);
      return starComparison || helpfulComparison || createdAtComparison;
    }

    if (sort === "most-critical") {
      const starComparison = compareAscending(left.star_rating ?? Number.POSITIVE_INFINITY, right.star_rating ?? Number.POSITIVE_INFINITY);
      return starComparison || helpfulComparison || createdAtComparison;
    }

    return createdAtComparison;
  });
}
