from pydantic import BaseModel, ConfigDict, field_validator
from typing import List, Optional, Generic, TypeVar, Dict, Any
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


class ReviewListItem(ReviewBase):
    id: int
    product_id: int
    source: Optional[str] = None
    helpful_votes: int = 0
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class Review(ReviewListItem):
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
    image_url: Optional[str] = None


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


class RankedFinding(BaseModel):
    text: str


class ExperimentEvidence(BaseModel):
    platform: str
    strengths: Optional[List[RankedFinding]] = None
    weaknesses: Optional[List[RankedFinding]] = None
    weakness_paraphrase: Optional[str] = None
    claim_paraphrase: Optional[str] = None
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
    # Study session linkage (set by client, resolved server-side)
    session_token: Optional[str] = None
    helpfulness_response: Optional[str] = None
    confidence_rating: Optional[int] = None  # 1–5 self-reported


class ExperimentResultCreate(ExperimentResultBase):
    pass


class ExperimentResult(ExperimentResultBase):
    id: int
    created_at: datetime
    study_id: Optional[int] = None
    participant_id: Optional[int] = None
    similarity_scores: Optional[Dict[str, float]] = None
    review_status: str = "pending"
    exclude_from_public: bool = False
    participant_helpful: Optional[bool] = None
    admin_analysis: Optional[Dict[str, Any]] = None
    review_notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class ExperimentAnalytics(BaseModel):
    # [{"platform": "hyve", "avg_time": 12.5, "count": 10}, ...]
    platform_stats: List[dict]
    total_participants: int
    recent_activity: List[ExperimentResult]


# --- Experiment Studies ---


def _normalize_string_list(value: Optional[List[str]]) -> Optional[List[str]]:
    if value is None:
        return None
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]

class ExperimentStudyCreate(BaseModel):
    product_id: int
    title: str
    description: Optional[str] = None
    consent_text: Optional[str] = None
    instructions_hyve: Optional[str] = None
    instructions_traditional: Optional[str] = None
    ground_truth_strengths: Optional[List[str]] = None
    ground_truth_weaknesses: Optional[List[str]] = None

    @field_validator("ground_truth_strengths", "ground_truth_weaknesses", mode="before")
    @classmethod
    def normalize_ground_truth_lists(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return _normalize_string_list(value)


class ExperimentStudyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    consent_text: Optional[str] = None
    instructions_hyve: Optional[str] = None
    instructions_traditional: Optional[str] = None
    ground_truth_strengths: Optional[List[str]] = None
    ground_truth_weaknesses: Optional[List[str]] = None
    status: Optional[str] = None  # draft | active | closed

    @field_validator("ground_truth_strengths", "ground_truth_weaknesses", mode="before")
    @classmethod
    def normalize_ground_truth_lists(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        return _normalize_string_list(value)


class StudyCopyAssistRequest(BaseModel):
    product_id: int
    field: str  # description | consent_text | instructions_hyve | instructions_traditional
    current_text: Optional[str] = None
    instruction: Optional[str] = None


class StudyCopyAssistResponse(BaseModel):
    text: str


class ExperimentStudyOut(BaseModel):
    id: int
    product_id: int
    title: str
    description: Optional[str] = None
    consent_text: Optional[str] = None
    instructions_hyve: Optional[str] = None
    instructions_traditional: Optional[str] = None
    ground_truth_strengths: Optional[List[str]] = None
    ground_truth_weaknesses: Optional[List[str]] = None
    status: str
    public_token: Optional[str] = None
    public_link_active: bool = False
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ExperimentInviteOut(BaseModel):
    id: int
    study_id: int
    code: str
    assigned_platform: str
    used: bool
    used_at: Optional[datetime] = None
    participant_email: Optional[str] = None
    email_sent: bool = False
    email_sent_at: Optional[datetime] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class GenerateInvitesRequest(BaseModel):
    count: int = 0  # ignored when emails list is provided
    emails: Optional[List[str]] = None  # if set, one code per email; count derived from len(emails)


class InviteResolveOut(BaseModel):
    """Returned to participant before they start — no session token yet."""
    study_id: int
    product_id: int
    title: str
    description: Optional[str] = None
    consent_text: Optional[str] = None
    assigned_platform: Optional[str] = None  # "hyve" | "traditional"
    instructions: Optional[str] = None
    valid: bool
    already_used: bool
    study_status: str  # draft | active | closed — used to show why study is unavailable


class SessionStartOut(BaseModel):
    """Returned after participant accepts consent and clicks Start."""
    session_token: str
    assigned_platform: str  # "hyve" | "traditional"
    product_id: int
    instructions: str  # platform-specific instructions


class PublicStudyInfoOut(BaseModel):
    """Lightweight study info shown on the public join landing page."""
    title: str
    description: Optional[str] = None
    consent_text: Optional[str] = None
    instructions_hyve: Optional[str] = None
    instructions_traditional: Optional[str] = None
    status: str
    public_link_active: bool


class PublicJoinOut(BaseModel):
    """Returned when a participant joins via public link."""
    invite_code: str
    session_token: str
    assigned_platform: str  # "hyve" | "traditional"
    product_id: int
    instructions: str


class PublicLinkOut(BaseModel):
    """Returned after generating/fetching the public link token."""
    public_token: str


class StudyAnalyticsOut(BaseModel):
    study_id: int
    product_id: int
    title: str
    status: str
    total_invites: int
    used_invites: int
    completions: int
    pending_review: int
    approved: int
    rejected: int
    hyve_count: int
    traditional_count: int
    hyve_avg_time: Optional[float] = None
    traditional_avg_time: Optional[float] = None
    hyve_avg_confidence: Optional[float] = None
    traditional_avg_confidence: Optional[float] = None


class PublicResultVisibilityUpdate(BaseModel):
    exclude_from_public: bool


class PublicExperimentResultOut(BaseModel):
    id: int
    study_id: Optional[int] = None
    study_title: Optional[str] = None
    product_id: int
    product_name: Optional[str] = None
    platform: str
    participant_name: Optional[str] = None
    time_seconds: int
    review_status: str
    exclude_from_public: bool = False
    created_at: datetime

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


# --- AliExpress Catalog (RapidAPI Cache) ---


class AliExpressReviewOut(BaseModel):
    id: int
    aliexpress_product_item_id: str
    rapidapi_id: str
    title: Optional[str] = None
    body: str
    rating: float
    reviewer_name: Optional[str] = None
    helpful_votes: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AliExpressProductOut(BaseModel):
    id: int
    item_id: str
    title: str
    brand: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    price: Optional[float] = None
    promotion_price: Optional[float] = None
    rating: Optional[float] = None
    sales_count: Optional[int] = None
    free_shipping: bool
    shipping_fee: Optional[float] = None
    aliexpress_url: Optional[str] = None
    cached_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AliExpressCategoryChildOut(BaseModel):
    id: str
    name: str


class AliExpressCategoryGroupOut(BaseModel):
    id: str
    name: str
    children: List[AliExpressCategoryChildOut] = []


# --- AliExpress Native Reviews ---

class AliExpressNativeReviewCreate(BaseModel):
    device_id: Optional[str] = None
    author_name: Optional[str] = "Anonymous"
    star_rating: float  # 1-5
    body: str


class AliExpressNativeReviewOut(BaseModel):
    id: int
    aliexpress_product_item_id: str
    author_name: Optional[str] = None
    star_rating: float
    body: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Canopy Fetch Reviews Request ---


class CanopyFetchReviewsRequest(BaseModel):
    asin: str
    page: Optional[int] = 1
