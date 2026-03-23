from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Generic, TypeVar, Dict
from datetime import datetime

T = TypeVar('T')


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int
    pages: int
    model_config = ConfigDict(from_attributes=True)

# --- Users ---


class UserBase(BaseModel):
    email: str
    role: str = "consumer"


class UserCreate(UserBase):
    pass


class User(UserBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Themes ---


class ThemeBase(BaseModel):
    name: str


class ThemeCreate(ThemeBase):
    product_id: int


class Theme(ThemeBase):
    id: int
    product_id: int
    positive_ratio: float
    claim_count: int
    recommendation: Optional[str] = None
    claims: List['Claim'] = []
    model_config = ConfigDict(from_attributes=True)

# --- Claims ---


class ClaimBase(BaseModel):
    claim_text: str
    evidence_text: Optional[str] = None
    context_text: Optional[str] = None
    sentiment_polarity: Optional[str] = None
    severity: float = 0.0
    mention_count: int = 1


class ClaimCreate(ClaimBase):
    review_id: int
    theme_id: Optional[int] = None


class Claim(ClaimBase):
    id: int
    review_id: int
    theme_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)

# --- Reviews ---


class ReviewBase(BaseModel):
    original_text: str
    source: str = "manual"
    source_url: Optional[str] = None
    star_rating: Optional[float] = None


class ReviewCreate(ReviewBase):
    product_id: int


class Review(ReviewBase):
    id: int
    product_id: int
    created_at: datetime
    claims: List[Claim] = []
    model_config = ConfigDict(from_attributes=True)

# --- Products ---


class ProductBase(BaseModel):
    name: str
    category: str
    summary: Optional[str] = None
    advices: Optional[str] = None
    summary_seller: Optional[str] = None
    advices_seller: Optional[str] = None
    status: str = "ready"
    ingest_type: Optional[str] = None
    processing_step: Optional[str] = None


class RawIngestRequest(BaseModel):
    text: str
    source_url: Optional[str] = None


class RegenerateSummaryRequest(BaseModel):
    focus: Optional[str] = None


class ChatRequest(BaseModel):
    query: str


class ProductCreate(ProductBase):
    pass


class Product(ProductBase):
    id: int
    overall_sentiment_score: float
    created_at: datetime
    themes: List[Theme] = []
    # Not listing reviews here to avoid massive payloads.
    # Use paginated /reviews?product_id= endpoint instead.
    model_config = ConfigDict(from_attributes=True)

# --- Experiments ---


class SourceRef(BaseModel):
    type: str
    id: str


class ExperimentEvidence(BaseModel):
    platform: str
    weakness_paraphrase: str
    claim_paraphrase: str
    positive_paraphrase: Optional[str] = None
    negative_paraphrase: Optional[str] = None
    strategy_paraphrase: Optional[str] = None
    source_refs: Dict[str, SourceRef] = {}


class ExperimentResultBase(BaseModel):
    product_id: int
    platform: str
    time_seconds: int
    participant_name: Optional[str] = None
    evidence: Optional[ExperimentEvidence] = None


class ExperimentResultCreate(ExperimentResultBase):
    pass


class ExperimentResult(ExperimentResultBase):
    id: int
    created_at: datetime
    similarity_scores: Optional[Dict[str, float]] = None
    review_status: str = "pending"
    review_notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class ExperimentAnalytics(BaseModel):
    # [{"platform": "hyve", "avg_time": 12.5, "count": 10}, ...]
    platform_stats: List[dict]
    total_participants: int
    recent_activity: List[ExperimentResult]

# --- Ingestion ---


class BatchReviewItem(BaseModel):
    text: str
    source: str = "batch"
    star_rating: Optional[float] = None


class BatchIngestRequest(BaseModel):
    reviews: List[BatchReviewItem]


class BatchIngestResponse(BaseModel):
    product_id: int
    reviews_ingested: int
    claims_extracted: int
    themes_created: int


# Update forward refs
Theme.model_rebuild()
Product.model_rebuild()
ExperimentResult.model_rebuild()

# --- Amazon Catalog (Canopy API Cache) ---


class AmazonReviewOut(BaseModel):
    id: int
    amazon_product_asin: str
    canopy_id: str
    title: Optional[str] = None
    body: str
    rating: float
    reviewer_name: Optional[str] = None
    verified_purchase: bool
    helpful_votes: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AmazonProductOut(BaseModel):
    id: int
    asin: str
    title: str
    brand: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    price: Optional[float] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    amazon_url: Optional[str] = None
    cached_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Native Reviews ---


class NativeReviewCreate(BaseModel):
    device_id: Optional[str] = None
    author_name: Optional[str] = "Anonymous"
    star_rating: float  # 1-5
    body: str


class NativeReviewOut(BaseModel):
    id: int
    amazon_product_asin: str
    author_name: Optional[str] = None
    star_rating: float
    body: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Canopy Fetch Reviews Request ---


class CanopyFetchReviewsRequest(BaseModel):
    asin: str
    page: Optional[int] = 1
