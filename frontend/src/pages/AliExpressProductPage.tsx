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
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface AliExpressProduct {
  id: number;
  item_id: string;
  title: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  price: number | null;
  promotion_price: number | null;
  rating: number | null;
  sales_count: number | null;
  free_shipping: boolean;
  shipping_fee: number | null;
  aliexpress_url: string | null;
}

interface AliExpressReview {
  id: number;
  rapidapi_id: string;
  title: string | null;
  body: string;
  rating: number;
  reviewer_name: string | null;
  helpful_votes: number;
  created_at: string;
}

interface NativeReview {
  id: number;
  aliexpress_product_item_id: string;
  author_name: string | null;
  star_rating: number;
  body: string;
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

function AliExpressReviewCard({ review }: { review: AliExpressReview }) {
  return (
    <div className="border border-border/50 bg-card/20 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm flex items-center gap-2">
          {review.reviewer_name || "Anonymous"}
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

export default function AliExpressProductPage() {
  const { item_id } = useParams<{ item_id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Native review form state
  const [authorName, setAuthorName] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");

  // Pagination states
  const [nativePage, setNativePage] = useState(1);
  const [aliexpressPage, setAliexpressPage] = useState(1);

  // Fetch AliExpress product details (DB-first cached)
  const { data: product, isLoading: productLoading } =
    useQuery<AliExpressProduct>({
      queryKey: ["aliexpress-product", item_id],
      queryFn: async () => {
        const res = await api.get(`/aliexpress/products/${item_id}`);
        return res.data;
      },
      enabled: !!item_id,
    });

  // Fetch native reviews
  const { data: nativeReviewsData } = useQuery<PaginatedResponse<NativeReview>>(
    {
      queryKey: ["aliexpress-native-reviews", item_id, nativePage],
      queryFn: async () => {
        const res = await api.get(
          `/aliexpress/products/${item_id}/native-reviews`,
          { params: { page: nativePage } },
        );
        return res.data;
      },
      enabled: !!item_id,
    },
  );

  // Fetch AliExpress (platform) reviews
  const {
    data: aliexpressReviewsData,
    isLoading: aliexpressReviewsLoading,
    isError: aliexpressReviewsError,
    refetch: refetchAliexpressReviews,
  } = useQuery<PaginatedResponse<AliExpressReview>>({
      queryKey: ["aliexpress-reviews", item_id, aliexpressPage],
      queryFn: async () => {
        const res = await api.get(`/aliexpress/products/${item_id}/reviews`, {
          params: { page: aliexpressPage },
        });
        return res.data;
      },
      enabled: !!item_id,
      staleTime: 0,
      retry: 1,
      refetchOnWindowFocus: false,
    });

  // Submit native review
  const submitReviewMutation = useMutation({
    mutationFn: async () => {
      if (!rating) throw new Error("Please select a star rating.");
      if (!body.trim() || body.trim().length < 10)
        throw new Error("Please write at least 10 characters in your review.");

      let deviceId = localStorage.getItem("hyve_device_id");
      if (!deviceId) {
        deviceId = crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem("hyve_device_id", deviceId);
      }

      return api.post(`/aliexpress/products/${item_id}/native-reviews`, {
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
      queryClient.invalidateQueries({
        queryKey: ["aliexpress-native-reviews", item_id],
      });
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

  // Analyze AliExpress platform reviews
  const analyzeAliExpressMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(
        `/aliexpress/products/${item_id}/analyze-aliexpress`,
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["products-list"] });
      toast.success("Analysis Started", {
        description:
          data.message ||
          "AliExpress reviews are being processed in the background.",
      });
      navigate(`/products/${data.product_id}`);
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.detail || "Failed to analyze AliExpress reviews.",
      );
    },
  });

  // Analyze native reviews
  const analyzeNativeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(
        `/aliexpress/products/${item_id}/analyze-native`,
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["products-list"] });
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
          onClick={() => navigate(-1)}
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
                {product.sales_count && (
                  <span className="text-xs text-muted-foreground">
                    ({product.sales_count.toLocaleString()} sales)
                  </span>
                )}
              </div>
            )}
            {product.category && (
              <Badge variant="secondary">
                {product.category.split(">").pop()?.trim()}
              </Badge>
            )}
            {product.promotion_price ? (
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-lg text-primary">
                  ${product.promotion_price.toFixed(2)}
                </span>
                {product.price && product.price !== product.promotion_price && (
                  <span className="text-sm text-muted-foreground line-through">
                    ${product.price.toFixed(2)}
                  </span>
                )}
              </div>
            ) : (
              product.price && (
                <span className="font-bold text-lg">
                  ${product.price.toFixed(2)}
                </span>
              )
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Truck className="h-4 w-4 text-muted-foreground" />
            {product.free_shipping ? (
              <span className="font-medium text-green-600">Free Shipping</span>
            ) : product.shipping_fee ? (
              <span className="text-muted-foreground">
                Shipping: ${product.shipping_fee.toFixed(2)}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Shipping info not available
              </span>
            )}
          </div>

          {product.aliexpress_url && (
            <a
              href={product.aliexpress_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
            >
              <ExternalLink className="h-3 w-3" />
              View on AliExpress
            </a>
          )}
        </div>
      </div>

      {/* Analysis Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-border/50 bg-card/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-orange-400" />
            <h2 className="font-semibold">Analyze AliExpress Reviews</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Run HYVE's full AI analysis (claims extraction, themes, decision
            trees) on the AliExpress buyer reviews.
          </p>
          <Button
            className="w-full"
            onClick={() => analyzeAliExpressMutation.mutate()}
            disabled={
              analyzeAliExpressMutation.isPending || aliexpressReviewsLoading
            }
          >
            {analyzeAliExpressMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing Reviews...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Analyze AliExpress Reviews
              </>
            )}
          </Button>
        </div>

        <div className="border border-border/50 bg-card/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-400" />
            <h2 className="font-semibold">
              Analyze Community Reviews{" "}
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
                  ? "No community reviews yet"
                  : "Analyze Community Reviews"}
              </>
            )}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Reviews Tabs */}
      <Tabs defaultValue="traditional" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-11">
          <TabsTrigger value="traditional">AliExpress Reviews</TabsTrigger>
          <TabsTrigger value="leave-review">Leave a Review</TabsTrigger>
          <TabsTrigger value="client-reviews">
            Community Reviews{" "}
            {nativeTotal > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {nativeTotal}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* AliExpress Platform Reviews Tab */}
        <TabsContent value="traditional" className="mt-6 space-y-4">
          {aliexpressReviewsLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p>Fetching AliExpress reviews...</p>
            </div>
          ) : aliexpressReviewsError ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-muted-foreground text-sm">
                Could not load AliExpress reviews. The source may be temporarily unavailable.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchAliexpressReviews()}
              >
                Retry
              </Button>
            </div>
          ) : !aliexpressReviewsData ||
            aliexpressReviewsData.items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No compiled AliExpress reviews found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aliexpressReviewsData.items.map((review) => (
                  <AliExpressReviewCard key={review.id} review={review} />
                ))}
              </div>

              {aliexpressReviewsData.pages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-4 pb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAliexpressPage((p) => Math.max(1, p - 1))
                    }
                    disabled={aliexpressPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Page {aliexpressPage} of {aliexpressReviewsData.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAliexpressPage((p) =>
                        Math.min(aliexpressReviewsData.pages, p + 1),
                      )
                    }
                    disabled={aliexpressPage === aliexpressReviewsData.pages}
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
              for AI analysis independently from AliExpress reviews.
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
        <TabsContent value="client-reviews" className="mt-6 space-y-4">
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
