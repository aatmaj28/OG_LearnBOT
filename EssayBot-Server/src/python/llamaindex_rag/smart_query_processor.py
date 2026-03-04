"""
File: smart_query_processor.py
Optimized Query Processing for Essay Grading with Anti-Gaming Protection
"""

import re
import logging
from typing import Dict, List, Tuple, Optional, Set
from dataclasses import dataclass
from collections import Counter
import hashlib

logger = logging.getLogger(__name__)


@dataclass
class QueryAnalysis:
    """Analysis of query characteristics for grading"""
    specificity_score: float  # 0.0 = vague/gaming attempt, 1.0 = specific
    content_overlap_score: float  # How much query matches document content
    term_rarity_score: float  # Rare terms = specific knowledge
    query_type: str  # "specific", "moderate", "vague", "minimal", "gibberish", "gaming_attempt"
    should_expand: bool  # Whether to apply expansion
    similarity_boost: float  # Multiplier for scores (0.3 to 1.2)
    is_valid: bool  # False for gibberish/gaming attempts
    gaming_indicators: List[str]  # Detected gaming patterns


class DynamicQueryProcessor:
    """Processes queries with anti-gaming and gibberish detection"""

    def __init__(self):
        self.document_vocabulary = set()
        self.term_frequencies = Counter()
        self.rare_terms = set()
        self.common_terms = set()
        self.document_bigrams = set()

        # Cache for learned vocabularies per assignment
        self._vocabulary_cache = {}

        # Gaming detection patterns
        self.gaming_patterns = [
            # Direct grade manipulation
            (r'\b(grade|score|mark)\s*(me|this|it)?\s*(100|perfect|high|full)',
             "direct_grade_request"),
            (r'\bgive\s*(me|this)?\s*(a|an)?\s*(100|perfect|A\+?)', "grade_demand"),
            (r'\b(ignore|disregard|skip)\s*(the)?\s*(rubric|criteria|requirements)', "rubric_bypass"),

            # AI manipulation attempts
            (r'(system\s*prompt|instruction|command)', "system_prompt_hack"),
            (r'as\s*an?\s*ai\s*(language)?\s*model', "ai_roleplay"),
            (r'(override|bypass|ignore)\s*(your)?\s*(instructions|rules)',
             "instruction_override"),

            # Copy-paste indicators
            (r'lorem\s*ipsum', "lorem_ipsum"),
            (r'(test|sample|example)\s*text', "placeholder_text"),

            # Nonsense patterns
            (r'([a-z])\1{4,}', "repeated_chars"),  # aaaaa
            (r'(asdf|qwerty|zxcv)', "keyboard_mashing"),
            (r'^[^aeiou]{20,}$', "no_vowels"),  # Long strings without vowels
        ]

        # Academic term synonyms (only used if both exist in document)
        self.academic_synonyms = {
            "analyze": ["examine", "investigate", "explore"],
            "compare": ["contrast", "differentiate", "distinguish"],
            "evaluate": ["assess", "appraise", "judge"],
            "discuss": ["explain", "elaborate", "describe"],
            "demonstrate": ["show", "illustrate", "prove"],
            "argue": ["contend", "maintain", "assert"],
        }

    def learn_from_documents(self, documents: List[str], cache_key: Optional[str] = None) -> None:
        """Learn vocabulary from documents with caching"""

        # Check cache
        if cache_key and cache_key in self._vocabulary_cache:
            cached = self._vocabulary_cache[cache_key]
            self.document_vocabulary = cached['vocabulary']
            self.term_frequencies = cached['frequencies']
            self.rare_terms = cached['rare']
            self.common_terms = cached['common']
            self.document_bigrams = cached['bigrams']
            logger.info(f"Using cached vocabulary for {cache_key}")
            return

        # Process documents
        all_text = " ".join(documents).lower()

        # Extract terms more efficiently
        terms = re.findall(r'\b[a-zA-Z]{3,}\b', all_text)
        self.term_frequencies = Counter(terms)
        self.document_vocabulary = set(terms)

        # Extract bigrams efficiently
        words = all_text.split()
        self.document_bigrams = {
            f"{words[i]} {words[i+1]}"
            for i in range(len(words) - 1)
            if len(words[i]) + len(words[i+1]) > 5
        }

        # Categorize terms by frequency
        if terms:
            total_terms = len(terms)
            for term, freq in self.term_frequencies.items():
                frequency_ratio = freq / total_terms
                if frequency_ratio < 0.01:
                    self.rare_terms.add(term)
                elif frequency_ratio > 0.05:
                    self.common_terms.add(term)

        # Cache if key provided
        if cache_key:
            self._vocabulary_cache[cache_key] = {
                'vocabulary': self.document_vocabulary,
                'frequencies': self.term_frequencies,
                'rare': self.rare_terms,
                'common': self.common_terms,
                'bigrams': self.document_bigrams
            }
            logger.info(f"Cached vocabulary for {cache_key}")

    def detect_gaming_attempts(self, text: str) -> Tuple[bool, List[str]]:
        """Detect gaming attempts and return indicators"""
        text_lower = text.lower()
        detected = []

        for pattern, indicator in self.gaming_patterns:
            if re.search(pattern, text_lower):
                detected.append(indicator)

        return len(detected) > 0, detected

    def detect_gibberish(self, text: str) -> bool:
        """Detect gibberish or nonsense text"""
        if len(text) < 20:
            return False

        text_lower = text.lower()
        words = text_lower.split()

        # Check for gibberish indicators
        if not words:
            return True

        # Check word validity
        valid_words = sum(1 for word in words if len(word) >
                          1 and re.match(r'^[a-z]+$', word))
        valid_ratio = valid_words / len(words)

        if valid_ratio < 0.5:
            return True

        # Check for repetitive patterns
        unique_words = set(words)
        if len(unique_words) < len(words) * 0.2:  # Less than 20% unique words
            return True

        # Check character distribution
        char_freq = Counter(text_lower.replace(' ', ''))
        if char_freq:
            max_freq = max(char_freq.values())
            total_chars = sum(char_freq.values())
            if max_freq > total_chars * 0.3:  # One character is >30% of text
                return True

        return False

    def analyze_query(self, query: str) -> QueryAnalysis:
        """Comprehensive query analysis with anti-gaming"""

        # First, check for gaming attempts
        is_gaming, gaming_indicators = self.detect_gaming_attempts(query)
        if is_gaming:
            logger.warning(f"Gaming attempt detected: {gaming_indicators}")
            return QueryAnalysis(
                specificity_score=0.0,
                content_overlap_score=0.0,
                term_rarity_score=0.0,
                query_type="gaming_attempt",
                should_expand=False,
                similarity_boost=0.3,  # Heavy penalty
                is_valid=False,
                gaming_indicators=gaming_indicators
            )

        # Check for gibberish
        if self.detect_gibberish(query):
            logger.warning("Gibberish detected in query")
            return QueryAnalysis(
                specificity_score=0.0,
                content_overlap_score=0.0,
                term_rarity_score=0.0,
                query_type="gibberish",
                should_expand=False,
                similarity_boost=0.3,
                is_valid=False,
                gaming_indicators=["gibberish_text"]
            )

        # Normal analysis
        query_lower = query.lower()
        query_terms = set(re.findall(r'\b[a-zA-Z]{3,}\b', query_lower))
        query_words = query_lower.split()

        if not query_terms:
            return QueryAnalysis(
                specificity_score=0.0,
                content_overlap_score=0.0,
                term_rarity_score=0.0,
                query_type="minimal",
                should_expand=False,
                similarity_boost=0.5,
                is_valid=True,
                gaming_indicators=[]
            )

        # 1. Content overlap
        matching_terms = query_terms.intersection(self.document_vocabulary)
        content_overlap_score = len(matching_terms) / len(query_terms)

        # 2. Term rarity
        rare_matches = query_terms.intersection(self.rare_terms)
        term_rarity_score = len(rare_matches) / len(query_terms)

        # 3. Bigram matches
        bigram_matches = 0
        for i in range(len(query_words) - 1):
            bigram = f"{query_words[i]} {query_words[i+1]}"
            if bigram in self.document_bigrams:
                bigram_matches += 1
        bigram_score = bigram_matches / max(len(query_words) - 1, 1)

        # 4. Length score
        length_score = min(len(query_words) / 20, 1.0)

        # 5. Vague pattern detection
        vague_patterns = [
            r'\bi\s+(know|understand|think|believe|feel)',
            r'\b(everything|nothing|all|some|many)\b',
            r'\b(this|that|it|they)\s+(is|are|was|were)',
            r'\b(very|really|quite|pretty|somewhat)\s+\w+',
        ]

        vague_count = sum(
            1 for p in vague_patterns if re.search(p, query_lower))
        vague_penalty = max(0.4, 1 - (vague_count * 0.2))

        # Calculate final score
        specificity_score = (
            content_overlap_score * 0.35 +
            term_rarity_score * 0.30 +
            bigram_score * 0.25 +
            length_score * 0.10
        ) * vague_penalty

        # Determine query type and boost
        if specificity_score >= 0.7:
            query_type = "specific"
            should_expand = True
            similarity_boost = 1.2
        elif specificity_score >= 0.4:
            query_type = "moderate"
            should_expand = True
            similarity_boost = 1.0
        elif specificity_score >= 0.2:
            query_type = "vague"
            should_expand = False
            similarity_boost = 0.8
        else:
            query_type = "minimal"
            should_expand = False
            similarity_boost = 0.6

        return QueryAnalysis(
            specificity_score=specificity_score,
            content_overlap_score=content_overlap_score,
            term_rarity_score=term_rarity_score,
            query_type=query_type,
            should_expand=should_expand,
            similarity_boost=similarity_boost,
            is_valid=True,
            gaming_indicators=[]
        )

    def process_query_for_retrieval(self, query: str) -> Tuple[str, float]:
        """Process query and return (processed_query, similarity_boost)"""
        analysis = self.analyze_query(query)

        # Don't process invalid queries
        if not analysis.is_valid:
            return query, analysis.similarity_boost

        # Expand if appropriate
        if analysis.should_expand:
            processed_query = self._smart_expand(query)
        else:
            processed_query = query

        return processed_query, analysis.similarity_boost

    def _smart_expand(self, query: str) -> str:
        """Intelligent query expansion using document vocabulary"""
        words = query.lower().split()
        expanded_words = []

        for word in words:
            expanded_words.append(word)

            # Add synonyms only if they exist in document
            if word in self.academic_synonyms and word in self.document_vocabulary:
                for synonym in self.academic_synonyms[word]:
                    if synonym in self.document_vocabulary:
                        expanded_words.append(synonym)
                        break  # Add only one synonym

        return " ".join(expanded_words)

    def clear_cache(self):
        """Clear vocabulary cache"""
        self._vocabulary_cache.clear()
        logger.info("Vocabulary cache cleared")


# Singleton instance
_query_processor = None


def get_query_processor() -> DynamicQueryProcessor:
    """Get or create global query processor"""
    global _query_processor
    if _query_processor is None:
        _query_processor = DynamicQueryProcessor()
    return _query_processor
