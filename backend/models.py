from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean
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
    status = Column(String, default="ready") # "processing" or "ready"
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
