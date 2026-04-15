from google import genai

from app.config import settings

ZH_TO_EN_PROMPT = """Translate the following Chinese worship song lyrics into English.

CRITICAL RULE: If this is a well-known classic hymn (经典诗歌/赞美诗), you MUST use the established, widely-sung English translation rather than creating a new one. For example:
- 奇异恩典 → use John Newton's "Amazing Grace" original English lyrics
- 万古磐石 → use "Rock of Ages" by Augustus Toplady
- 普世欢腾 → use "Joy to the World" by Isaac Watts
- 圣哉三一 → use "Holy, Holy, Holy" by Reginald Heber
- 我知谁掌管明天 → use "I Know Who Holds Tomorrow"
- 耶稣恩友 → use "What a Friend We Have in Jesus"
- 当转眼仰望耶稣 → use "Turn Your Eyes Upon Jesus"
- 你真伟大 → use "How Great Thou Art"
- 我需要你 → use "I Need Thee Every Hour"

Also, for songs by contemporary worship ministries that have official bilingual releases, use the OFFICIAL translation:
- 赞美之泉 (Stream of Praise) songs — use their official English translations
- 约书亚乐团 (Joshua Band) — use their official English versions
- 有情天音乐 (Heavenly Melody) — use their official translations
- 泥土音乐 (Clay Music) — use their official translations
- 生命河灵粮堂 (River of Life) — use their official translations
- Hillsong — use official Chinese translations where they exist
- Bethel Music — use official Chinese translations where they exist

Only create a new translation if there is NO established or official translation available.

STRICT LENGTH RULE:
- The translation MUST have EXACTLY the same number of sections (separated by blank lines) as the input.
- Each section MUST have EXACTLY the same number of lines as the corresponding input section.
- If the original has 4 sections with [4, 4, 4, 4] lines, the translation must also have 4 sections with [4, 4, 4, 4] lines.
- Do NOT add extra verses, choruses, or lines that are not in the input, even if the full original song has more.
- Translate ONLY what is given. Nothing more, nothing less.

Requirements for new translations:
1. Stay faithful to the original meaning
2. Try to make it rhyme where possible
3. Use natural, poetic English suitable for worship
4. Do NOT add any explanation or notes — output ONLY the translated lyrics
5. Preserve blank lines between sections

Song title: {title}
Composer/Artist: {composer}

Lyrics to translate ({line_count} lines, {section_count} sections):
{lyrics}"""

EN_TO_ZH_PROMPT = """Translate the following English worship song lyrics into {variant} Chinese.

CRITICAL RULE: If this is a well-known classic hymn, you MUST use the established, widely-sung Chinese translation from the Chinese hymnal (赞美诗/诗歌本) rather than creating a new one. For example:
- "Amazing Grace" → use 奇异恩典 (赞美诗中的经典翻译)
- "Rock of Ages" → use 万古磐石
- "Joy to the World" → use 普世欢腾
- "Holy, Holy, Holy" → use 圣哉三一
- "How Great Thou Art" → use 你真伟大
- "What a Friend We Have in Jesus" → use 耶稣恩友
- "Blessed Assurance" → use 有福的确据
- "It Is Well with My Soul" → use 我心灵得安宁
- "Great Is Thy Faithfulness" → use 你的信实广大
- "I Need Thee Every Hour" → use 我需要你
- "Turn Your Eyes Upon Jesus" → use 当转眼仰望耶稣

Also, for songs by contemporary worship artists/ministries that have official bilingual releases, use the OFFICIAL Chinese translation:
- Hillsong Worship/United — use official Chinese translations where they exist
- Bethel Music — use official Chinese translations
- Elevation Worship — use official Chinese translations
- Chris Tomlin, Matt Redman, etc. — use official Chinese translations if available
- 赞美之泉 (Stream of Praise) — use their original Chinese lyrics for their English songs

Only create a new translation if there is NO established or official translation available.

STRICT LENGTH RULE:
- The translation MUST have EXACTLY the same number of sections (separated by blank lines) as the input.
- Each section MUST have EXACTLY the same number of lines as the corresponding input section.
- If the original has 4 sections with [4, 4, 4, 4] lines, the translation must also have 4 sections with [4, 4, 4, 4] lines.
- Do NOT add extra verses, choruses, or lines that are not in the input, even if the full original song has more.
- Translate ONLY what is given. Nothing more, nothing less.

Requirements for new translations:
1. Stay faithful to the original meaning
2. Try to make it rhyme (押韵) where possible
3. Use natural, poetic Chinese suitable for worship (敬拜诗歌风格)
4. Do NOT add any explanation or notes — output ONLY the translated lyrics
5. Preserve blank lines between sections
6. Output in {variant} Chinese characters only

Song title: {title}
Composer/Artist: {composer}

Lyrics to translate ({line_count} lines, {section_count} sections):
{lyrics}"""


def _call_gemini(prompt: str, session_id: str = "", action: str = "translate") -> str:
    if not settings.GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY not configured. Set the environment variable or add it to Google Secret Manager.")
    client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    if session_id:
        from app.services.usage_tracker import track_call
        track_call(session_id, action, response)
    return response.text.strip()


def _get_structure(lyrics: str) -> tuple[int, int, list[int]]:
    """Return (total_lines, section_count, lines_per_section)."""
    sections = [s for s in lyrics.strip().split("\n\n") if s.strip()]
    lines_per = [len(s.strip().splitlines()) for s in sections]
    return sum(lines_per), len(sections), lines_per


def _trim_to_match(original: str, translated: str) -> str:
    """Trim translated lyrics to match original structure.

    If translation has more sections than original, remove extras.
    If a translated section has more lines than original section, trim lines.
    """
    orig_sections = [s for s in original.strip().split("\n\n") if s.strip()]
    trans_sections = [s for s in translated.strip().split("\n\n") if s.strip()]

    result = []
    for i, orig_sec in enumerate(orig_sections):
        if i >= len(trans_sections):
            break
        orig_lines = orig_sec.strip().splitlines()
        trans_lines = trans_sections[i].strip().splitlines()
        # Trim to match original line count
        trimmed = trans_lines[:len(orig_lines)]
        result.append("\n".join(trimmed))

    return "\n\n".join(result)


def translate_lyrics_to_english(lyrics: str, title: str = "", composer: str = "", session_id: str = "") -> str:
    total, sections, _ = _get_structure(lyrics)
    raw = _call_gemini(ZH_TO_EN_PROMPT.format(
        lyrics=lyrics, title=title or "Unknown", composer=composer or "Unknown",
        line_count=total, section_count=sections,
    ), session_id=session_id, action="translate_zh_to_en")
    return _trim_to_match(lyrics, raw)


def translate_lyrics_to_chinese(lyrics: str, variant: str = "simplified", title: str = "", composer: str = "", session_id: str = "") -> str:
    zh_variant = "Simplified (简体)" if variant == "simplified" else "Traditional (繁體)"
    total, sections, _ = _get_structure(lyrics)
    raw = _call_gemini(EN_TO_ZH_PROMPT.format(
        lyrics=lyrics, variant=zh_variant, title=title or "Unknown", composer=composer or "Unknown",
        line_count=total, section_count=sections,
    ), session_id=session_id, action="translate_en_to_zh")
    return _trim_to_match(lyrics, raw)
