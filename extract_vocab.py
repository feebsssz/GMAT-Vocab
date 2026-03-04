"""Extract GMAT 800 vocab words from PDF and fetch English definitions."""

import json
import time
import fitz
import requests

PDF_PATH = "Gmat 800 vocab list-New.pdf"
OUTPUT_PATH = "vocab_data.json"
DICT_API = "https://api.dictionaryapi.dev/api/v2/entries/en/"


def decode_word(text: str) -> str:
    """Decode Caesar-shifted text from the PDF's CID-encoded fonts."""
    text = (
        text.replace("\u01c8", "ff")
        .replace("\u01cb", "ffi")
        .replace("\u0189", "fi")
        .replace("\u0192", "fl")
        .replace("\u0190", "fl")
    )
    result = []
    for c in text:
        if "A" <= c <= "Z":
            result.append(chr((ord(c) - ord("A") - 3) % 26 + ord("a")))
        elif c == "\\":
            result.append("y")
        elif c == "]":
            result.append("z")
        elif c == "[":
            result.append("x")
        elif c == "\u00a9":
            result.append("a")
        elif c == "\u01a7":
            result.append("a")
        elif c == "\u01a8":
            result.append("g")
        elif c == "\u01a9":
            result.append("e")
        else:
            result.append(c)
    return "".join(result)


def extract_words() -> list[str]:
    """Extract all 800 vocab words from the PDF."""
    doc = fitz.open(PDF_PATH)
    words = []
    for i in range(3, len(doc)):
        page = doc[i]
        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"].strip()
                    font = span["font"]
                    size = span["size"]
                    if font == "PingFangSC-Semibold" and abs(size - 18.0) < 1:
                        decoded = decode_word(text)
                        if len(decoded) >= 3 and decoded not in words:
                            words.append(decoded)
    doc.close()
    return words


def fetch_definition(word: str) -> dict:
    """Fetch definition from Free Dictionary API."""
    try:
        resp = requests.get(DICT_API + word, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data and isinstance(data, list):
                entry = data[0]
                meanings = entry.get("meanings", [])
                if meanings:
                    m = meanings[0]
                    pos = m.get("partOfSpeech", "")
                    defs = m.get("definitions", [])
                    definition = defs[0].get("definition", "") if defs else ""
                    # Collect all meanings
                    all_defs = []
                    for meaning in meanings:
                        p = meaning.get("partOfSpeech", "")
                        for d in meaning.get("definitions", [])[:2]:
                            all_defs.append({"pos": p, "def": d.get("definition", "")})
                    return {
                        "word": word,
                        "pos": pos,
                        "definition": definition,
                        "all_definitions": all_defs,
                    }
    except Exception as e:
        print(f"  Error fetching '{word}': {e}")
    return {"word": word, "pos": "", "definition": "", "all_definitions": []}


def main():
    print("Extracting words from PDF...")
    words = extract_words()
    print(f"Found {len(words)} words")

    print("Fetching definitions...")
    vocab_data = []
    for i, word in enumerate(words):
        entry = fetch_definition(word)
        vocab_data.append(entry)
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(words)} done")
        time.sleep(0.1)  # Rate limit

    # Count how many got definitions
    with_def = sum(1 for v in vocab_data if v["definition"])
    print(f"Got definitions for {with_def}/{len(vocab_data)} words")

    with open(OUTPUT_PATH, "w") as f:
        json.dump(vocab_data, f, indent=2)
    print(f"Saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
