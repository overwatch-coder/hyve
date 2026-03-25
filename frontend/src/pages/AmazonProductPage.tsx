import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Star,
  Loader2,
  Sparkles,
  ExternalLink,
  ShoppingCart,
  Users,
  ChevronLeft,
  ChevronRight,
  Send,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface AmazonProduct {
  id: number;
  asin: string;
  title: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  image_url: string | null;
  price: number | null;
  rating: number | null;
  review_count: number | null;
  amazon_url: string | null;
}

interface NativeReview {
  id: number;
  author_name: string | null;
  star_rating: number;
  body: string;
  created_at: string;
}

interface AmazonReview {
  id: number;
  canopy_id: string;
  title: string | null;
  body: string;
  rating: number;
  reviewer_name: string | null;
  verified_purchase: boolean;
  helpful_votes: number;
  created_at: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

function ExpandableText({
  text,
  limit = 200,
}: {
  text: string;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > limit;

  return (
    <div className="space-y-1">
      <p
        className={cn(
          "text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap",
          !expanded && isLong && "line-clamp-4",
        )}
      >
        {text}
      </p>
      {isLong && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? "Read Less" : "Read More"}
        </button>
      )}
    </div>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-7 w-7 cursor-pointer transition-colors ${
            star <= (hovered || value)
              ? "text-amber-400 fill-amber-400"
              : "text-muted-foreground/30 hover:text-amber-300"
          }`}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
        />
      ))}
    </div>
  );
}

function NativeReviewCard({ review }: { review: NativeReview }) {
  return (
    <div className="border border-border/50 bg-card/20 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">
          {review.author_name || "Anonymous"}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(review.created_at).toLocaleDateString()}
        </span>
      </div>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={`h-3 w-3 ${
              s <= review.star_rating
                ? "text-amber-400 fill-amber-400"
                : "text-muted-foreground/20"
            }`}
          />
        ))}
      </div>
      <ExpandableText text={review.body} />
    </div>
  );
}

function AmazonReviewCard({ review }: { review: AmazonReview }) {
  return (
    <div className="border border-border/50 bg-card/20 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm flex items-center gap-2">
          {review.reviewer_name || "Amazon Customer"}
          {review.verified_purchase && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              Verified
            </Badge>
          )}
        </span>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {review.helpful_votes > 0 && (
            <span>{review.helpful_votes} helpful</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className={`h-3 w-3 ${
                s <= review.rating
                  ? "text-amber-400 fill-amber-400"
                  : "text-muted-foreground/20"
              }`}
            />
          ))}
        </div>
        {review.title && (
          <span className="text-sm font-semibold truncate">{review.title}</span>
        )}
      </div>
      <ExpandableText text={review.body} />
    </div>
  );
}

export default function AmazonProductPage() {
  const { asin } = useParams<{ asin: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Native review form state
  const [authorName, setAuthorName] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");

  // Pagination states
  const [nativePage, setNativePage] = useState(1);
  const [amazonPage, setAmazonPage] = useState(1);

  // Fetch Amazon product details (DB-first cached)
  const { data: product, isLoading: productLoading } = useQuery<AmazonProduct>({
    queryKey: ["amazon-product", asin],
    queryFn: async () => {
      const res = await api.get(`/amazon/products/${asin}`);
      return res.data;
    },
    enabled: !!asin,
  });

  // Fetch native reviews
  const { data: nativeReviewsData } = useQuery<PaginatedResponse<NativeReview>>(
    {
      queryKey: ["native-reviews", asin, nativePage],
      queryFn: async () => {
        const res = await api.get(`/amazon/products/${asin}/native-reviews`, {
          params: { page: nativePage },
        });
        return res.data;
      },
      enabled: !!asin,
    },
  );

  // Submit native review
  const submitReviewMutation = useMutation({
    mutationFn: async () => {
      if (!rating) throw new Error("Please select a star rating.");
      if (!body.trim() || body.trim().length < 10)
        throw new Error("Please write at least 10 characters in your review.");

      // Ensure local device ID for duplicate checking
      let deviceId = localStorage.getItem("hyve_device_id");
      if (!deviceId) {
        deviceId = crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem("hyve_device_id", deviceId);
      }

      return api.post(`/amazon/products/${asin}/native-reviews`, {
        device_id: deviceId,
        author_name: authorName.trim() || "Anonymous",
        star_rating: rating,
        body: body.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Review submitted!", {
        description: "Your review has been added to the HYVE community wall.",
      });
      setRating(0);
      setBody("");
      setAuthorName("");
      queryClient.invalidateQueries({ queryKey: ["native-reviews", asin] });
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.detail?.includes(
          "You have already submitted a review",
        )
          ? "You have already submitted a review"
          : err.message || err.response?.data?.detail || "Submission failed.",
      );
    },
  });

  // Fetch Amazon reviews via Canopy → analyze
  const analyzeAmazonReviewsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/amazon/products/${asin}/analyze-amazon`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Analysis Started`, {
        description:
          data.message ||
          "Amazon reviews are being processed in the background.",
      });
      navigate(`/products/${data.product_id}`);
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.detail || "Failed to analyze Amazon reviews.",
      );
    },
  });

  // Auto-fetch raw Amazon reviews on mount
  const { data: amazonReviewsData, isLoading: amazonReviewsLoading } = useQuery<
    PaginatedResponse<AmazonReview>
  >({
    queryKey: ["amazon-reviews", asin, amazonPage],
    queryFn: async () => {
      const res = await api.get(`/amazon/products/${asin}/reviews`, {
        params: { page: amazonPage },
      });
      return res.data;
    },
    enabled: !!asin,
    retry: false,
    refetchOnWindowFocus: false, // Prevent spamming Canopy if empty
  });

  // Analyze native reviews
  const analyzeNativeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/amazon/products/${asin}/analyze-native`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success("Analysis Started", {
        description:
          data.message ||
          "Native reviews are being processed in the background.",
      });
      navigate(`/products/${data.product_id}`);
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.detail || "Failed to analyze native reviews.",
      );
    },
  });

  if (productLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Product not found.{" "}
        <button
          className="text-primary underline"
          onClick={() => navigate("/amazon")}
        >
          Go back to search
        </button>
      </div>
    );
  }

  const nativeReviews = nativeReviewsData?.items || [];
  const nativeTotal = nativeReviewsData?.total || 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Search
      </button>

      {/* Product Header Card */}
      <div className="border border-border/50 bg-card/30 backdrop-blur-md rounded-xl p-6 flex flex-col sm:flex-row gap-6">
        {/* Image */}
        <div className="w-full sm:w-40 h-40 shrink-0 bg-muted/20 rounded-lg overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
              className="w-full h-full object-contain p-2"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingCart className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 space-y-2">
          {product.brand && (
            <span className="text-xs text-primary font-semibold uppercase tracking-widest">
              {product.brand}
            </span>
          )}
          <h1 className="text-xl font-bold leading-snug">{product.title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {product.rating && (
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                <span className="text-sm font-medium">
                  {product.rating.toFixed(1)}
                </span>
                {product.review_count && (
                  <span className="text-xs text-muted-foreground">
                    ({product.review_count.toLocaleString()} reviews on Amazon)
                  </span>
                )}
              </div>
            )}
            {product.category && (
              <Badge variant="secondary">
                {product.category.split(">").pop()?.trim()}
              </Badge>
            )}
            {product.price && (
              <span className="font-bold text-lg">
                ${product.price.toFixed(2)}
              </span>
            )}
          </div>
          {product.description && (
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
              {product.description}
            </p>
          )}
          {product.amazon_url && (
            <a
              href={product.amazon_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
            >
              <ExternalLink className="h-3 w-3" />
              View on Amazon
            </a>
          )}
        </div>
      </div>

      {/* Analysis Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-border/50 bg-card/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-400" />
            <h2 className="font-semibold">Analyze Amazon Reviews</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Run HYVE's full AI analysis (claims extraction, themes, decision
            trees) on the Amazon reviews listed below.
          </p>
          <Button
            className="w-full"
            onClick={() => analyzeAmazonReviewsMutation.mutate()}
            disabled={
              analyzeAmazonReviewsMutation.isPending || amazonReviewsLoading
            }
          >
            {analyzeAmazonReviewsMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing Reviews...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Analyze Amazon Reviews
              </>
            )}
          </Button>
        </div>

        <div className="border border-border/50 bg-card/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-400" />
            <h2 className="font-semibold">
              Analyze Native Reviews{" "}
              {nativeTotal > 0 && (
                <Badge variant="outline" className="ml-1 text-xs">
                  {nativeTotal}
                </Badge>
              )}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Run AI analysis exclusively on reviews left by the HYVE community
            directly on this page.
          </p>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => analyzeNativeMutation.mutate()}
            disabled={analyzeNativeMutation.isPending || nativeTotal === 0}
          >
            {analyzeNativeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {nativeTotal === 0
                  ? "No native reviews yet"
                  : "Analyze Native Reviews"}
              </>
            )}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Native Review Section */}
      <Tabs defaultValue="amazon" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-11">
          <TabsTrigger value="amazon">Amazon Reviews</TabsTrigger>
          <TabsTrigger value="leave-review">Leave a Review</TabsTrigger>
          <TabsTrigger value="community">
            Community Wall{" "}
            {nativeTotal > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {nativeTotal}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Amazon Reviews Tab */}
        <TabsContent value="amazon" className="mt-6 space-y-4">
          {amazonReviewsLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p>Fetching latest Amazon reviews...</p>
            </div>
          ) : !amazonReviewsData || amazonReviewsData.items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No compiled Amazon reviews found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {amazonReviewsData.items.map((review) => (
                  <AmazonReviewCard key={review.id} review={review} />
                ))}
              </div>

              {amazonReviewsData.pages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-4 pb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAmazonPage((p) => Math.max(1, p - 1))}
                    disabled={amazonPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Page {amazonPage} of {amazonReviewsData.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAmazonPage((p) =>
                        Math.min(amazonReviewsData.pages, p + 1),
                      )
                    }
                    disabled={amazonPage === amazonReviewsData.pages}
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Leave a Review Tab */}
        <TabsContent value="leave-review" className="mt-6 space-y-5">
          <div>
            <h3 className="font-semibold text-base">
              Review this product on HYVE
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Your review will be stored on the HYVE platform and can be used
              for AI analysis independently from Amazon's reviews.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Your Rating</Label>
            <StarPicker value={rating} onChange={setRating} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="author-name">Your Name (optional)</Label>
            <Input
              id="author-name"
              placeholder="e.g. Jane D."
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-body">Your Review</Label>
            <Textarea
              id="review-body"
              placeholder="Share your experience with this product..."
              className="h-32 resize-none bg-background/50"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs text-muted-foreground text-right">
              {body.length} characters
            </p>
          </div>

          <Button
            className="w-full sm:w-auto"
            onClick={() => submitReviewMutation.mutate()}
            disabled={submitReviewMutation.isPending}
          >
            {submitReviewMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit Review
              </>
            )}
          </Button>
        </TabsContent>

        {/* Community Reviews Tab */}
        <TabsContent value="community" className="mt-6 space-y-4">
          {nativeReviews.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto opacity-30 mb-3" />
              <p>No community reviews yet. Be the first to leave one!</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                {nativeReviews.map((review) => (
                  <NativeReviewCard key={review.id} review={review} />
                ))}
              </div>

              {nativeReviewsData && nativeReviewsData.pages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-4 pb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setNativePage((p) => Math.max(1, p - 1))}
                    disabled={nativePage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Page {nativePage} of {nativeReviewsData.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setNativePage((p) =>
                        Math.min(nativeReviewsData.pages, p + 1),
                      )
                    }
                    disabled={nativePage === nativeReviewsData.pages}
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
