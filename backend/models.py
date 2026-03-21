from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    role = Column(String, default="consumer") # consumer or business
    created_at = Column(DateTime, default=datetime.utcnow)

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    category = Column(String, index=True)
    overall_sentiment_score = Column(Float, default=0.0)
    summary = Column(String, nullable=True)
    advices = Column(String, nullable=True) # Will store JSON list or pipe-separated string
    summary_seller = Column(String, nullable=True)
    advices_seller = Column(String, nullable=True) # Will store JSON list
    status = Column(String, default="ready") # "processing" or "ready"
    ingest_type = Column(String, nullable=True) # "csv", "url", "text"
    processing_step = Column(String, nullable=True) # e.g. "Cleaning Data", "Extracting Claims"
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    reviews = relationship("Review", back_populates="product", cascade="all, delete-orphan")
    themes = relationship("Theme", back_populates="product", cascade="all, delete-orphan")

class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)
    original_text = Column(Text, nullable=False)
    source = Column(String, default="manual") # e.g. "amazon.com"
    source_url = Column(String, nullable=True) # full url
    star_rating = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    product = relationship("Product", back_populates="reviews")
    claims = relationship("Claim", back_populates="review", cascade="all, delete-orphan")

class Claim(Base):
    __tablename__ = "claims"
    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(Integer, ForeignKey("reviews.id"), index=True)
    theme_id = Column(Integer, ForeignKey("themes.id"), nullable=True, index=True)
    
    claim_text = Column(String, nullable=False)
    evidence_text = Column(String, nullable=True)
    context_text = Column(String, nullable=True)
    
    sentiment_polarity = Column(String) # positive, neutral, negative
    severity = Column(Float, default=0.0)
    mention_count = Column(Integer, default=1)  # How many raw reviews express this same insight
    
    # Relationships
    review = relationship("Review", back_populates="claims")
    theme = relationship("Theme", back_populates="claims")

class Theme(Base):
    __tablename__ = "themes"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)
    name = Column(String, index=True) # e.g. "Battery", "Camera"
    
    positive_ratio = Column(Float, default=0.0)
    claim_count = Column(Integer, default=0)
    recommendation = Column(Text, nullable=True) # AI-generated actionable recommendation
    
    # Relationships
    product = relationship("Product", back_populates="themes")
    claims = relationship("Claim", back_populates="theme")

class AmazonCategory(Base):
    """Caches top-level categories fetched from the Canopy API."""
    __tablename__ = "amazon_categories"
    id = Column(Integer, primary_key=True, index=True)
    canopy_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    url = Column(String, nullable=True)
    path = Column(String, nullable=True)
    has_children = Column(Boolean, default=False)

class AmazonProduct(Base):
    """Caches Amazon product metadata fetched from the Canopy API.
    Always check this table first before hitting the Canopy API to preserve token quota."""
    __tablename__ = "amazon_products"
    id = Column(Integer, primary_key=True, index=True)
    asin = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    brand = Column(String, nullable=True)
    category = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    price = Column(Float, nullable=True)
    rating = Column(Float, nullable=True)  # Amazon's own average rating
    review_count = Column(Integer, nullable=True)
    amazon_url = Column(String, nullable=True)
    # Tag search queries so we can serve cached search results without hitting Canopy
    search_index = Column(String, nullable=True, index=True)
    cached_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    native_reviews = relationship("NativeReview", back_populates="amazon_product", cascade="all, delete-orphan")
    amazon_reviews = relationship("AmazonReview", back_populates="amazon_product", cascade="all, delete-orphan")


class AmazonReview(Base):
    """Raw reviews fetched from Canopy API to display directly to users."""
    __tablename__ = "amazon_reviews"
    id = Column(Integer, primary_key=True, index=True)
    amazon_product_asin = Column(String, ForeignKey("amazon_products.asin"), index=True, nullable=False)
    canopy_id = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    rating = Column(Float, nullable=False)
    reviewer_name = Column(String, nullable=True)
    verified_purchase = Column(Boolean, default=False)
    helpful_votes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    amazon_product = relationship("AmazonProduct", back_populates="amazon_reviews")


class NativeReview(Base):
    """A review written natively on the HYVE platform, linked to an Amazon product.
    These are collected organically and fed into the AI analysis pipeline."""
    __tablename__ = "native_reviews"
    id = Column(Integer, primary_key=True, index=True)
    amazon_product_asin = Column(String, ForeignKey("amazon_products.asin"), index=True, nullable=False)
    device_id = Column(String, nullable=True, index=True) # Anonymous guest identifier
    author_name = Column(String, nullable=True)  # Display name (not auth-linked for now)
    star_rating = Column(Float, nullable=False)  # 1-5
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('amazon_product_asin', 'device_id', name='uq_native_review_device'),
    )

    # Relationships
    amazon_product = relationship("AmazonProduct", back_populates="native_reviews")


class ExperimentResult(Base):
    __tablename__ = "experiment_results"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)
    platform = Column(String) # "hyve" or "traditional"
    time_seconds = Column(Integer)
    participant_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
