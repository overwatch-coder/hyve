import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import {
  Search,
  Star,
  ShoppingCart,
  Loader2,
  ListTree,
  X,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AmazonProduct {
  id: number;
  asin: string;
  title: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  price: number | null;
  rating: number | null;
  review_count: number | null;
  amazon_url: string | null;
}

interface AmazonCategory {
  id: string;
  name: string;
  categoryId: string;
}

interface PaginatedProducts {
  items: AmazonProduct[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3.5 w-3.5 ${
            star <= Math.round(rating)
              ? "text-amber-400 fill-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

export default function AmazonSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Derive state from URL search params so it survives back-navigation
  const query = searchParams.get("q") || "";
  const page = Number(searchParams.get("page")) || 1;
  const categoryParam = searchParams.get("category");
  const categoryNameParam = searchParams.get("categoryName");

  const [searchInput, setSearchInput] = useState(query);
  const [selectedCategory, setSelectedCategory] =
    useState<AmazonCategory | null>(
      categoryParam
        ? { id: categoryParam, categoryId: categoryParam, name: categoryNameParam || "" }
        : null
    );

  // 1. Fetch Categories (shown when no search query and no category selected)
  const { data: categories, isLoading: categoriesLoading } = useQuery<
    AmazonCategory[]
  >({
    queryKey: ["amazon-categories"],
    queryFn: async () => {
      const res = await api.get("/amazon/categories");
      return res.data;
    },
    enabled: !query && !selectedCategory,
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  // 2. Fetch Search Results OR Category Products
  const {
    data: productsData,
    isLoading: productsLoading,
    isError,
  } = useQuery<PaginatedProducts>({
    queryKey: [
      "amazon-products",
      query,
      selectedCategory?.id || selectedCategory?.categoryId,
      page,
    ],
    queryFn: async () => {
      if (query) {
        const res = await api.get("/amazon/search", {
          params: { q: query, page },
        });
        return res.data;
      } else if (selectedCategory) {
        const res = await api.get(
          `/amazon/category/${selectedCategory.id || selectedCategory.categoryId}`,
          { params: { page } },
        );
        return res.data;
      }
      return { items: [], total: 0, page: 1, size: 20, pages: 0 };
    },
    enabled: !!(query || selectedCategory),
    staleTime: 1000 * 60 * 5,
  });

  const products = productsData?.items ?? [];
  const totalPages = productsData?.pages ?? 0;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed.length >= 0) {
      setSelectedCategory(null);
      setSearchParams({ q: trimmed, page: "1" });
    }
  };

  const clearSearch = () => {
    setSearchInput("");
    setSelectedCategory(null);
    setSearchParams({});
  };

  const isBrowseMode = !query && !selectedCategory;
  const isCategoryMode = !query && selectedCategory;
  const isSearchMode = !!query;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Amazon Product Search
        </h1>
        <p className="text-muted-foreground mt-2">
          Find any Amazon product to analyze its reviews or browse by category.
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="amazon-product-search-input"
            className="pl-10 pr-10 h-12 text-base bg-background/50"
            placeholder="Search all of Amazon (e.g. Sony WH-1000XM5)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted"
              onClick={clearSearch}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit" className="h-12 px-6" disabled={productsLoading}>
          {productsLoading && isSearchMode ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Search
            </>
          )}
        </Button>
      </form>

      {/* Error */}
      {isError && (
        <div className="text-destructive text-sm text-center py-8">
          Failed to fetch products. Please check your internet connection or try
          again later.
        </div>
      )}

      {/* Mode Views */}
      <div className="mt-8">
        {/* -- BROWSE CATEGORIES VIEW -- */}
        {isBrowseMode && (
          <div className="space-y-6 animate-in fade-in">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <ListTree className="h-5 w-5 text-primary" />
              Browse Categories
            </h2>

            {categoriesLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : categories && categories.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {categories.map((cat, idx) => (
                  <button
                    key={`${idx}-${cat.id || cat.categoryId}`}
                    className="p-5 border border-border/50 bg-card hover:bg-primary/5 hover:border-primary/30 rounded-xl text-left transition-all group flex items-center justify-between shadow-sm hover:shadow-md"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setSearchParams({ category: cat.id || cat.categoryId, categoryName: cat.name, page: "1" });
                    }}
                  >
                    <span className="font-medium truncate pr-2 group-hover:text-primary transition-colors">
                      {cat.name}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl border-border/50 bg-muted/10">
                No categories available to display.
              </div>
            )}
          </div>
        )}

        {/* -- CATEGORY OR SEARCH PRODUCTS VIEW -- */}
        {(isCategoryMode || isSearchMode) && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            {/* Context Header */}
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                {isCategoryMode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setSelectedCategory(null); setSearchParams({}); }}
                    className="-ml-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <h2 className="text-xl font-semibold">
                  {isCategoryMode ? (
                    <span className="flex items-center gap-2">
                      <ListTree className="h-5 w-5 text-primary" />
                      {selectedCategory.name}
                    </span>
                  ) : (
                    <span>Search Results for "{query}"</span>
                  )}
                </h2>
              </div>

              <Badge
                variant="outline"
                className="font-normal text-muted-foreground"
              >
                {productsLoading
                  ? "Loading..."
                  : `${productsData?.total || 0} products`}
              </Badge>
            </div>

            {/* No Results */}
            {!productsLoading && products.length === 0 && (
              <div className="text-center py-20 text-muted-foreground border border-dashed rounded-xl border-border/50 bg-muted/10">
                <ShoppingCart className="h-10 w-10 mx-auto mb-4 opacity-20" />
                <p>No products found in this view.</p>
                <p className="text-sm mt-1">
                  Try another category or search term.
                </p>
              </div>
            )}

            {/* Loading Grid Skeleton */}
            {productsLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-50 pointer-events-none">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div
                    key={i}
                    className="border border-border/50 rounded-xl h-72 animate-pulse bg-muted/20"
                  ></div>
                ))}
              </div>
            )}

            {/* Product Grid */}
            {!productsLoading && products.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {products.map((product) => (
                  <div
                    key={product.asin}
                    className="group border border-border/50 bg-card/30 backdrop-blur-md rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col"
                    onClick={() => navigate(`/amazon/${product.asin}`)}
                  >
                    {/* Product Image */}
                    <div className="aspect-square bg-muted/20 overflow-hidden">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.title}
                          className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingCart className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="p-4 flex flex-col flex-1 gap-2">
                      {product.brand && (
                        <span className="text-xs text-primary font-medium uppercase tracking-wide">
                          {product.brand}
                        </span>
                      )}
                      <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {product.title}
                      </p>
                      {product.rating && <StarRating rating={product.rating} />}
                      {product.review_count && (
                        <p className="text-xs text-muted-foreground">
                          {product.review_count.toLocaleString()} Amazon reviews
                        </p>
                      )}
                      <div className="mt-auto pt-3 flex items-center justify-between">
                        {product.price ? (
                          <span className="font-bold text-base">
                            ${product.price.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Price unavailable
                          </span>
                        )}
                        {product.category && (
                          <Badge variant="secondary" className="text-xs">
                            {product.category.split(">").pop()?.trim() ||
                              product.category}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Action Footer */}
                    <div className="px-4 pb-4">
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/amazon/${product.asin}`);
                        }}
                      >
                        View & Analyze
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {!productsLoading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const prev = Math.max(1, page - 1);
                    const params: Record<string, string> = { page: String(prev) };
                    if (query) params.q = query;
                    if (selectedCategory) { params.category = selectedCategory.id || selectedCategory.categoryId; params.categoryName = selectedCategory.name; }
                    setSearchParams(params);
                  }}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = Math.min(totalPages, page + 1);
                    const params: Record<string, string> = { page: String(next) };
                    if (query) params.q = query;
                    if (selectedCategory) { params.category = selectedCategory.id || selectedCategory.categoryId; params.categoryName = selectedCategory.name; }
                    setSearchParams(params);
                  }}
                  disabled={page >= totalPages}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
