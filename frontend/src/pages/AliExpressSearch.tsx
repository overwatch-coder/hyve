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
  ChevronDown,
  Truck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

interface AliExpressCategory {
  id: string;
  name: string;
  parentName?: string;
}

interface AliExpressCategoryGroup {
  id: string;
  name: string;
  children: AliExpressCategory[];
}

interface PaginatedProducts {
  items: AliExpressProduct[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null;
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

export default function AliExpressSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Derive state from URL search params so it survives back-navigation
  const query = searchParams.get("q") || "";
  const page = Number(searchParams.get("page")) || 1;
  const categoryParam = searchParams.get("category");
  const categoryNameParam = searchParams.get("categoryName");

  const [searchInput, setSearchInput] = useState(query);
  const [selectedCategory, setSelectedCategory] =
    useState<AliExpressCategory | null>(
      categoryParam
        ? {
            id: categoryParam,
            name: categoryNameParam || "",
          }
        : null
    );
  const [expandedMainId, setExpandedMainId] = useState<string | null>(null);

  // 1. Fetch Categories (shown when no search query and no category selected)
  const { data: categories, isLoading: categoriesLoading } = useQuery<
    AliExpressCategoryGroup[]
  >({
    queryKey: ["aliexpress-categories"],
    queryFn: async () => {
      const res = await api.get("/aliexpress/categories");
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
      "aliexpress-products",
      query,
      selectedCategory?.id,
      page,
    ],
    queryFn: async () => {
      if (query) {
        const res = await api.get("/aliexpress/search", {
          params: { q: query, page },
        });
        return res.data;
      } else if (selectedCategory) {
        const res = await api.get(
          `/aliexpress/category/${selectedCategory.id}`,
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

  const selectCategory = (id: string, name: string, parentName?: string) => {
    const selected = { id, name, parentName };
    setSelectedCategory(selected);
    setSearchParams({
      category: id,
      categoryName: parentName ? `${parentName} > ${name}` : name,
      page: "1",
    });
  };

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

  console.log({products});

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          AliExpress Product Search
        </h1>
        <p className="text-muted-foreground mt-2">
          Find any AliExpress product to analyze its reviews or browse by category.
        </p>
      </div>

      {/* Search Bar */}
      <form data-tour="aliexpress-search" onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="aliexpress-product-search-input"
            className="pl-10 pr-10 h-12 text-base bg-background/50"
            placeholder="Search all of AliExpress (e.g. wireless headphones)..."
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {categories.map((group) => {
                  const isExpanded = expandedMainId === group.id;
                  return (
                    <div
                      key={group.id}
                      className="border border-border/50 bg-card/30 rounded-xl p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          className="text-left flex-1 min-w-0"
                          onClick={() =>
                            setExpandedMainId(isExpanded ? null : group.id)
                          }
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-primary shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="font-semibold text-base hover:text-primary transition-colors truncate">
                              {group.name}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 ml-6">
                            {group.children.length} subcategories · {isExpanded ? "Collapse" : "Expand"}
                          </div>
                        </button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => selectCategory(group.id, group.name)}
                        >
                          <Search className="h-3.5 w-3.5 mr-1.5" />
                          Search Main
                        </Button>
                      </div>

                      {isExpanded && group.children.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-2">
                          {group.children.map((sub) => (
                            <button
                              key={`${group.id}-${sub.id}`}
                              className="text-xs px-3 py-1.5 rounded-full border border-border/60 bg-background/60 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors"
                              onClick={() =>
                                selectCategory(sub.id, sub.name, group.name)
                              }
                            >
                              {sub.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                    onClick={() => {
                      setSelectedCategory(null);
                      setSearchParams({});
                    }}
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
                    key={product.item_id}
                    className="group border border-border/50 bg-card/30 backdrop-blur-md rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col"
                    onClick={() => navigate(`/aliexpress/${product.item_id}`)}
                  >
                    {/* Product Image */}
                    <div className="aspect-square bg-muted/20 overflow-hidden relative">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.title}
                          className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingCart className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                      )}
                      {product.free_shipping && (
                        <div className="absolute top-2 right-2 bg-green-500/80 text-white text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          Free Ship
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
                      {product.sales_count ? (
                        <p className="text-xs text-muted-foreground">
                          {product.sales_count.toLocaleString()} sales
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground sr-only">No sales</p>
                      )}
                      <div className="mt-auto pt-3 flex items-center justify-between">
                        <div className="flex items-baseline gap-1">
                          {product.promotion_price ? (
                            <>
                              <span className="font-bold text-base text-primary">
                                ${product.promotion_price.toFixed(2)}
                              </span>
                              {product.price && product.price !== product.promotion_price && (
                                <span className="text-xs text-muted-foreground line-through">
                                  ${product.price.toFixed(2)}
                                </span>
                              )}
                            </>
                          ) : product.price ? (
                            <span className="font-bold text-base">
                              ${product.price.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Price unavailable
                            </span>
                          )}
                        </div>
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
                          navigate(`/aliexpress/${product.item_id}`);
                        }}
                      >
                        View Details
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
                    if (selectedCategory) {
                      params.category = selectedCategory.id;
                      params.categoryName = selectedCategory.parentName
                        ? `${selectedCategory.parentName} > ${selectedCategory.name}`
                        : selectedCategory.name;
                    }
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
                    if (selectedCategory) {
                      params.category = selectedCategory.id;
                      params.categoryName = selectedCategory.parentName
                        ? `${selectedCategory.parentName} > ${selectedCategory.name}`
                        : selectedCategory.name;
                    }
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
