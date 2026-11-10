"""Place-name handling for grounding: search variants and a "does this match?" check.

The AI often writes a place's long official form ("MAAT - Museum of Art, Architecture and
Technology") that geocoders miss, so simpler variants are tried too. And a geocoder may answer
a generic query ("City History Museum") with some other real place ("Saida History Museum"),
so a result is only accepted when its name resembles the suggestion.
"""

import re
import unicodedata

# Words that do not identify a place on their own.
GENERIC = frozenset(
    [
        "museum",
        "gallery",
        "history",
        "historical",
        "art",
        "arts",
        "modern",
        "contemporary",
        "national",
        "city",
        "town",
        "old",
        "new",
        "central",
        "main",
        "grand",
        "great",
        "little",
        "big",
        "park",
        "garden",
        "gardens",
        "market",
        "hall",
        "square",
        "plaza",
        "street",
        "road",
        "avenue",
        "walk",
        "walking",
        "route",
        "tour",
        "trail",
        "promenade",
        "riverside",
        "harbour",
        "harbor",
        "port",
        "beach",
        "viewpoint",
        "lookout",
        "church",
        "cathedral",
        "mosque",
        "temple",
        "chapel",
        "palace",
        "castle",
        "fort",
        "fortress",
        "tower",
        "bridge",
        "gate",
        "house",
        "centre",
        "center",
        "science",
        "aquarium",
        "zoo",
        "food",
        "night",
        "bar",
        "cafe",
        "coffee",
        "restaurant",
        "bakery",
        "tavern",
        "bistro",
        "shop",
        "shops",
        "store",
        "arcade",
        "covered",
        "sunset",
        "local",
        "quarter",
        "district",
        "neighbourhood",
        "neighborhood",
        "area",
        "village",
        "monument",
        "memorial",
        "statue",
        "fountain",
        "lake",
        "river",
        "hill",
        "hills",
        "mountain",
        "view",
        "station",
        "library",
        "theatre",
        "theater",
        "cinema",
        "club",
    ]
)
STOPWORDS = frozenset(
    [
        "the",
        "of",
        "de",
        "da",
        "do",
        "dos",
        "das",
        "del",
        "della",
        "di",
        "la",
        "le",
        "les",
        "el",
        "al",
        "and",
        "a",
        "an",
        "in",
        "at",
        "on",
        "to",
    ]
)

# Hyphen, en dash (U+2013), colon or bar between spaces.
_SUBTITLE = re.compile(r"\s+[-\u2013:|]\s+")
_PARENS = re.compile(r"\s*\([^)]*\)")


def normalise(text: str) -> str:
    """Lower case, accents removed, punctuation to spaces."""
    plain = unicodedata.normalize("NFKD", text)
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch))
    return re.sub(r"[^\w]+", " ", plain.casefold()).strip()


def _stem(word: str) -> str:
    return word[:-1] if len(word) > 3 and word.endswith("s") else word


def tokens(text: str) -> set[str]:
    return {
        _stem(word)
        for word in normalise(text).split()
        if word not in STOPWORDS and not word.isdigit()
    }


def distinctive(text: str) -> set[str]:
    return {word for word in tokens(text) if word not in {_stem(g) for g in GENERIC}}


def name_variants(name: str) -> list[str]:
    """The name as given, then simpler forms: without parentheses, and each side of a
    subtitle separator ("MAAT - Museum of ..." gives "MAAT" and "Museum of ...")."""
    variants = [name.strip()]
    bare = _PARENS.sub("", name).strip()
    variants.append(bare)
    parts = [part.strip() for part in _SUBTITLE.split(bare) if part.strip()]
    if len(parts) > 1:
        variants.extend(parts)
    seen: list[str] = []
    for variant in variants:
        if variant and variant.lower() not in (s.lower() for s in seen):
            seen.append(variant)
    return seen


def _latin(text: str) -> bool:
    return bool(re.search(r"[a-z]", normalise(text)))


def names_match(wanted: str, found: str) -> bool:
    """Whether a geocoder result plausibly is the suggested place.

    - Names in different scripts cannot be compared, so they pass (the distance check still
      applies).
    - A suggestion made only of generic words must match exactly.
    - Otherwise the result must share a distinctive word, or one name contains the other.
    """
    if not _latin(found) or not _latin(wanted):
        return True
    a, b = normalise(wanted), normalise(found)
    if a == b:
        return True
    key = distinctive(wanted)
    if not key:
        return False
    if a in b or b in a:
        return True
    return bool(key & tokens(found))
