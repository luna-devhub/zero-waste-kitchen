import re

STOPWORDS = {
    "fresh","dried","optional","to","taste","as","needed",
    "chopped","sliced","minced","crushed","ground","grated",
    "bruised","thinly","finely","roughly"
}

PARENS_RE = re.compile(r"\([^)]*\)")
NONALPHA_RE = re.compile(r"[^a-z0-9\s]")

def normalize_name(name: str) -> str:
    s = (name or "").lower().strip()
    s = PARENS_RE.sub("", s)           # remove "(...)"
    s = s.split(",", 1)[0].strip()     # remove ", sliced"
    s = NONALPHA_RE.sub(" ", s)        # remove punctuation
    tokens = [t for t in s.split() if t and t not in STOPWORDS]
    return " ".join(tokens)

def name_matches(recipe_name: str, pantry_name: str) -> bool:
    r = normalize_name(recipe_name)
    p = normalize_name(pantry_name)
    if not r or not p:
        return False
    if r == p:
        return True
    return (r in p) or (p in r)