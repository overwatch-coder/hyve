import {
  TRADITIONAL_REVIEW_SORT_OPTIONS,
  sortTraditionalReviews,
} from "./traditionalReviewSort.ts";

const sampleReviews = [
  { id: 1, helpful_votes: 2, star_rating: 5, created_at: "2026-05-01T00:00:00Z" },
  { id: 2, helpful_votes: 9, star_rating: 2, created_at: "2026-05-03T00:00:00Z" },
  { id: 3, helpful_votes: 9, star_rating: 4, created_at: "2026-05-02T00:00:00Z" },
];

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nexpected: ${expectedJson}\nreceived: ${actualJson}`);
  }
}

function test(name: string, callback: () => void): void {
  try {
    callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("sorts by most helpful with newest tiebreaker", () => {
  assertDeepEqual(
    sortTraditionalReviews(sampleReviews, "most-helpful").map((review) => review.id),
    [2, 3, 1],
    "most-helpful ordering should prioritize helpful votes, then recency",
  );
});

test("sorts by most favorable", () => {
  assertDeepEqual(
    sortTraditionalReviews(sampleReviews, "most-favorable").map((review) => review.id),
    [1, 3, 2],
    "most-favorable ordering should prioritize rating, then helpful votes, then recency",
  );
});

test("sorts by most critical", () => {
  assertDeepEqual(
    sortTraditionalReviews(sampleReviews, "most-critical").map((review) => review.id),
    [2, 3, 1],
    "most-critical ordering should prioritize lowest rating, then helpful votes, then recency",
  );
});

test("sorts by most recent", () => {
  assertDeepEqual(
    sortTraditionalReviews(sampleReviews, "most-recent").map((review) => review.id),
    [2, 3, 1],
    "most-recent ordering should prioritize created_at descending",
  );
});

test("exports the shared sort options in the approved order", () => {
  assertDeepEqual(
    TRADITIONAL_REVIEW_SORT_OPTIONS,
    [
      { value: "most-helpful", label: "Most Helpful" },
      { value: "most-favorable", label: "Most Favorable" },
      { value: "most-critical", label: "Most Critical" },
      { value: "most-recent", label: "Most Recent" },
    ],
    "sort options should match the shared UI contract",
  );
});

test("does not mutate the input and safely handles missing values", () => {
  const reviews = [
    { id: 1, helpful_votes: null, star_rating: null, created_at: null },
    { id: 2, helpful_votes: 0, star_rating: 5, created_at: "2026-05-04T00:00:00Z" },
    { id: 3, helpful_votes: undefined, star_rating: 1, created_at: undefined },
  ];

  const originalOrder = reviews.map((review) => review.id);

  assertDeepEqual(
    sortTraditionalReviews(reviews, "most-helpful").map((review) => review.id),
    [2, 1, 3],
    "missing helpful votes should fall back safely",
  );
  assertDeepEqual(
    sortTraditionalReviews(reviews, "most-favorable").map((review) => review.id),
    [2, 3, 1],
    "missing favorable ratings should sink to the end",
  );
  assertDeepEqual(
    sortTraditionalReviews(reviews, "most-critical").map((review) => review.id),
    [3, 2, 1],
    "missing critical ratings should sink to the end",
  );
  assertDeepEqual(
    sortTraditionalReviews(reviews, "most-recent").map((review) => review.id),
    [2, 1, 3],
    "missing created_at values should fall back safely",
  );
  assertDeepEqual(
    reviews.map((review) => review.id),
    originalOrder,
    "sorting should not mutate the input array",
  );
});

test("treats malformed created_at values as older than valid epoch timestamps", () => {
  const reviews = [
    { id: 1, helpful_votes: 5, star_rating: 4, created_at: "not-a-date" },
    { id: 2, helpful_votes: 5, star_rating: 4, created_at: "1970-01-01T00:00:00.000Z" },
    { id: 3, helpful_votes: 5, star_rating: 4, created_at: null },
  ];

  assertDeepEqual(
    sortTraditionalReviews(reviews, "most-helpful").map((review) => review.id),
    [2, 3, 1],
    "malformed timestamps should not collapse with valid epoch timestamps in helpful sorting",
  );
  assertDeepEqual(
    sortTraditionalReviews(reviews, "most-recent").map((review) => review.id),
    [2, 3, 1],
    "malformed timestamps should sort behind valid epoch and missing timestamps in recent sorting",
  );
});
