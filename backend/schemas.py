from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Generic, TypeVar
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
    status: str = "ready"
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

# Update forward refs
Theme.model_rebuild()
Product.model_rebuild()
