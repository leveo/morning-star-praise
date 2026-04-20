import logging
import re
import subprocess
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

from youtube_transcript_api import YouTubeTranscriptApi

from app.config import settings


def extract_video_id(url: str) -> str | None:
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
        r'(?:youtube\.com/shorts/)([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def get_video_title(video_id: str) -> str:
    """Get video title using yt-dlp (no download)."""
    try:
        result = subprocess.run(
            ['yt-dlp', '--get-title', '--no-download', f'https://youtube.com/watch?v={video_id}'],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return f"YouTube Video {video_id}"


def extract_lyrics_from_subtitles(
    video_id: str,
    languages: list[str] | None = None,
) -> dict:
    """Extract lyrics from YouTube subtitles using youtube-transcript-api.

    Returns: {title, lyrics, language, subtitle_type}
    """
    if languages is None:
        languages = ['zh-Hans', 'zh-Hant', 'zh', 'en', 'ko', 'ja']

    title = get_video_title(video_id)

    api = YouTubeTranscriptApi()
    transcript_list = api.list(video_id)

    # Try manually created subtitles first
    transcript = None
    detected_lang = 'en'
    subtitle_type = 'manual'

    try:
        transcript = transcript_list.find_manually_created_transcript(languages)
        detected_lang = transcript.language_code
    except Exception:
        # Fall back to auto-generated
        try:
            transcript = transcript_list.find_generated_transcript(languages)
            detected_lang = transcript.language_code
            subtitle_type = 'auto-generated'
        except Exception:
            pass

    if transcript is None:
        raise ValueError(f"No subtitles found for video {video_id}")

    fetched = transcript.fetch()
    entries = list(fetched)

    # Skip markers and clean text
    skip_markers = {'[Music]', '[Applause]', '[音乐]', '[掌声]', '[音楽]'}

    # Group lines into sections (heuristic: gap > 3 seconds between entries = new section)
    sections = []
    current_section = []
    for i, entry in enumerate(entries):
        text = entry.text.strip()
        text = re.sub(r'<[^>]+>', '', text)
        if not text or text in skip_markers:
            if current_section:
                sections.append(current_section)
                current_section = []
            continue

        if i > 0 and current_section:
            prev_entry = entries[i - 1]
            gap = entry.start - (prev_entry.start + prev_entry.duration)
            if gap > 3.0:
                sections.append(current_section)
                current_section = []

        # Deduplicate within section
        if not current_section or text != current_section[-1]:
            current_section.append(text)

    if current_section:
        sections.append(current_section)

    # Build lyrics text with sections separated by blank lines
    lyrics = "\n\n".join("\n".join(section) for section in sections)

    # Map language code to our format
    lang_map = {
        'zh-Hans': 'zh-hans', 'zh-Hant': 'zh-hant', 'zh': 'zh-hans',
        'en': 'en', 'ko': 'ko', 'ja': 'ja',
    }
    language = lang_map.get(detected_lang, 'en')

    return {
        'title': title,
        'lyrics': lyrics,
        'language': language,
        'subtitle_type': subtitle_type,
    }


def extract_frames_from_video(
    video_id: str,
    interval_seconds: float = 2.0,
    similarity_threshold: float = 0.95,
    session_id: str = "",
) -> dict:
    """Download video and extract key frames where lyrics change.

    Returns: {title, frames: [{image_path, timestamp}]}
    """
    title = get_video_title(video_id)
    work_dir = settings.UPLOADS_DIR / f"yt_{uuid.uuid4().hex[:8]}"
    work_dir.mkdir(parents=True, exist_ok=True)
    frames_dir = work_dir / "frames"
    frames_dir.mkdir(exist_ok=True)

    video_url = f'https://youtube.com/watch?v={video_id}'

    # Download video at 720p
    video_path = work_dir / "video.mp4"
    dl_result = subprocess.run(
        [
            'yt-dlp',
            '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
            '--merge-output-format', 'mp4',
            '--no-playlist',
            '-o', str(video_path),
            video_url,
        ],
        capture_output=True, text=True, timeout=300,
    )

    # yt-dlp may add extension, check for any video file
    if not video_path.exists():
        # Look for any video file in work_dir
        for ext in ['.mp4', '.mkv', '.webm']:
            candidate = work_dir / f"video{ext}"
            if candidate.exists():
                video_path = candidate
                break

    if not video_path.exists():
        raise ValueError(f"Failed to download video: {dl_result.stderr[:200]}")

    # Check video file size
    video_size_mb = video_path.stat().st_size / (1024 * 1024)
    logger.info(f"Downloaded video: {video_path.name}, {video_size_mb:.1f}MB")

    # Extract frames at interval using ffmpeg
    ff_result = subprocess.run(
        [
            'ffmpeg', '-i', str(video_path),
            '-vf', f'fps=1/{interval_seconds}',
            '-q:v', '2',
            str(frames_dir / 'frame_%04d.jpg'),
        ],
        capture_output=True, text=True, timeout=300,
    )

    # Get all extracted frames sorted
    frame_files = sorted(frames_dir.glob('frame_*.jpg'))
    logger.info(f"Extracted {len(frame_files)} frames from video")
    if not frame_files:
        raise ValueError(f"No frames extracted: {ff_result.stderr[:200]}")

    # Phase 1: Basic dedup — compare full frames, keep those that differ significantly
    # Use a generous threshold to let varied frames through; Phase 2 does precise filtering
    from PIL import Image
    import numpy as np

    key_frames = [frame_files[0]]
    prev_img = np.array(Image.open(frame_files[0]).resize((160, 90)))

    for frame_path in frame_files[1:]:
        curr_img = np.array(Image.open(frame_path).resize((160, 90)))
        diff = np.mean(np.abs(curr_img.astype(float) - prev_img.astype(float))) / 255.0

        # Keep frame if >3% different (generous — catches most text changes even with animated BG)
        if diff > 0.03:
            key_frames.append(frame_path)
            prev_img = curr_img

    logger.info(f"Phase 1 pixel dedup: {len(frame_files)} -> {len(key_frames)} frames")

    # Phase 2: Local text filter first (free), Gemini only as fallback
    filtered_frames = _local_text_filter(key_frames)
    logger.info(f"Phase 2 local filter: {len(key_frames)} -> {len(filtered_frames)} frames")

    # OCR pass: extract text + estimate font size from bounding boxes
    frame_texts, frame_font_sizes = _ocr_frames_with_size(filtered_frames, session_id)

    # Find clean background frames (no/minimal text) near each lyrics frame
    bg_map = _find_background_frames(filtered_frames, frame_files, work_dir=work_dir, session_id=session_id)

    # Move filtered frames + backgrounds to output
    output_frames = []
    kept_names = set()
    for i, frame_path in enumerate(filtered_frames):
        orig_num = int(re.search(r'(\d+)', frame_path.stem).group(1))
        timestamp = (orig_num - 1) * interval_seconds

        # Save lyrics frame
        output_name = f"slide_{i+1:03d}.jpg"
        output_path = work_dir / output_name
        frame_path.rename(output_path)
        kept_names.add(output_name)

        # Save background frame
        bg_url = ""
        bg_frame = bg_map.get(str(frame_path))
        if bg_frame and bg_frame.exists():
            bg_name = f"bg_{i+1:03d}.jpg"
            bg_out = work_dir / bg_name
            import shutil
            shutil.copy2(str(bg_frame), str(bg_out))
            kept_names.add(bg_name)
            bg_url = f'/api/youtube/frame/{work_dir.name}/{bg_name}'

        output_frames.append({
            'image_path': str(output_path),
            'image_url': f'/api/youtube/frame/{work_dir.name}/{output_name}',
            'background_url': bg_url or f'/api/youtube/frame/{work_dir.name}/{output_name}',
            'timestamp': timestamp,
            'text': frame_texts.get(str(frame_path), ''),
            'font_size': frame_font_sizes.get(str(frame_path), 0),
        })

    # Cleanup
    video_path.unlink(missing_ok=True)
    for f in key_frames:
        if f.exists() and f.name not in kept_names:
            f.unlink(missing_ok=True)
    for f in frame_files:
        if f.exists():
            f.unlink(missing_ok=True)
    if frames_dir.exists():
        try:
            frames_dir.rmdir()
        except OSError:
            pass

    return {
        'title': title,
        'frames': output_frames,
        'work_dir': work_dir.name,
    }


def _local_text_filter(frames: list[Path]) -> list[Path]:
    """Fallback filter when Gemini is unavailable.

    Scores frames by text clarity (sharp white text on dark background).
    Penalizes blurry/transitioning frames. Groups consecutive text frames
    and keeps the clearest one per group.
    """
    from PIL import Image, ImageFilter
    import numpy as np

    if len(frames) <= 1:
        return frames

    scored = []
    for frame_path in frames:
        img_pil = Image.open(frame_path).convert("L").resize((320, 180))
        img = np.array(img_pil)
        text_region = img[50:, :]  # lower ~72%

        # Text presence: bright pixels (white text) ratio
        bright = np.sum(text_region > 200) / text_region.size

        # Text sharpness: high-frequency edges (sharp text has clear edges, blurry text doesn't)
        edges = np.array(img_pil.filter(ImageFilter.FIND_EDGES))
        edge_region = edges[50:, :]
        sharpness = np.mean(edge_region) / 255.0

        # Dark background check
        dark_ratio = np.sum(text_region < 100) / text_region.size

        # Combined score: needs bright text + sharp edges + dark background
        if dark_ratio > 0.3 and bright > 0.01:
            score = bright * 0.5 + sharpness * 0.5
        else:
            score = 0

        scored.append((frame_path, score))

    if not scored:
        return frames

    scores = [s for _, s in scored]
    scores_nonzero = [s for s in scores if s > 0]
    if not scores_nonzero:
        return frames

    # Threshold: keep frames with reasonable text presence
    threshold = max(sorted(scores_nonzero)[len(scores_nonzero) // 3], 0.01)

    # Group consecutive above-threshold frames, keep the sharpest per group
    kept = []
    group: list[tuple[Path, float]] = []

    for path, score in scored:
        if score >= threshold:
            group.append((path, score))
        else:
            if group:
                kept.append(max(group, key=lambda x: x[1])[0])
                group = []

    if group:
        kept.append(max(group, key=lambda x: x[1])[0])

    logger.info(f"Local text filter: threshold={threshold:.4f}, kept {len(kept)}/{len(frames)}")
    return kept if kept else frames


def _score_frame_text(fp: Path) -> float:
    """Score a frame by text presence. Low score = clean background."""
    from PIL import Image
    import numpy as np
    try:
        img = np.array(Image.open(fp).convert("L").resize((160, 90)))
        text_region = img[30:, :]
        return float(np.sum(text_region > 200) / text_region.size)
    except Exception:
        return 1.0


def _inpaint_text_local(image_path: Path, output_path: Path) -> bool:
    """Remove text from image using OpenCV inpainting (local, no LLM).

    Creates a mask of bright text pixels and inpaints them.
    """
    try:
        import cv2
        import numpy as np

        img = cv2.imread(str(image_path))
        if img is None:
            return False

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Create mask: bright pixels (text) in the lower 2/3
        h = gray.shape[0]
        mask = np.zeros_like(gray)
        text_region = gray[h // 3:, :]
        # Threshold for white/bright text
        _, text_mask = cv2.threshold(text_region, 200, 255, cv2.THRESH_BINARY)
        # Dilate to cover text edges
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        text_mask = cv2.dilate(text_mask, kernel, iterations=2)
        mask[h // 3:, :] = text_mask

        # Inpaint
        result = cv2.inpaint(img, mask, inpaintRadius=7, flags=cv2.INPAINT_TELEA)
        cv2.imwrite(str(output_path), result)
        return True

    except Exception as e:
        logger.debug(f"Local inpainting failed: {e}")
        return False


def _inpaint_text_gemini(image_path: Path, output_path: Path, session_id: str = "") -> bool:
    """Remove text from image using Gemini (API cost)."""
    try:
        import base64
        import io
        from app.config import settings
        if not settings.GOOGLE_API_KEY:
            return False

        from google import genai
        from google.genai import types
        from PIL import Image

        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        b64 = base64.b64encode(image_path.read_bytes()).decode()

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[{
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                    {"text": "Remove all text/lyrics from this worship video background image. Keep only the background. Output the cleaned image."},
                ],
            }],
            config=types.GenerateContentConfig(response_modalities=["image", "text"]),
        )

        if session_id:
            from app.services.usage_tracker import track_call
            track_call(session_id, "inpaint_gemini", response)

        for part in response.candidates[0].content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                img_data = base64.b64decode(part.inline_data.data)
                img = Image.open(io.BytesIO(img_data)).convert("RGB")
                img.save(str(output_path), "JPEG", quality=85)
                return True

    except Exception as e:
        logger.debug(f"Gemini inpainting failed: {e}")

    return False


_BG_THRESHOLD = 0.03  # < 3% bright pixels = clean background


def _find_background_frames(
    lyrics_frames: list[Path],
    all_frames: list[Path],
    work_dir: Path | None = None,
    session_id: str = "",
) -> dict[str, Path]:
    """Find or generate clean background for each lyrics frame.

    Strategy (in order):
    1. Nearby clean frame (within ±5 frames, no text)
    2. Any clean frame from the entire video
    3. Local inpainting (OpenCV, remove text from the lyrics frame itself)
    4. Gemini inpainting (API fallback)
    """
    # Score all frames
    frame_scores = {str(fp): _score_frame_text(fp) for fp in all_frames}
    all_frame_strs = [str(f) for f in all_frames]

    # Find the single best clean background from the entire video
    global_best_bg = None
    global_best_score = 1.0
    for fp in all_frames:
        score = frame_scores[str(fp)]
        if score < global_best_score:
            global_best_score = score
            global_best_bg = fp

    result = {}
    stats = {"nearby": 0, "global": 0, "inpaint_local": 0, "inpaint_gemini": 0, "none": 0}

    for lyrics_fp in lyrics_frames:
        lyrics_str = str(lyrics_fp)

        # Option 1: Nearby clean frame (±5 frames)
        try:
            idx = all_frame_strs.index(lyrics_str)
        except ValueError:
            idx = -1

        found = False
        if idx >= 0:
            for offset in [-1, -2, 1, -3, 2, -4, -5, 3, 4, 5]:
                check_idx = idx + offset
                if 0 <= check_idx < len(all_frames):
                    if frame_scores[all_frame_strs[check_idx]] < _BG_THRESHOLD:
                        result[lyrics_str] = all_frames[check_idx]
                        stats["nearby"] += 1
                        found = True
                        break

        if found:
            continue

        # Option 2: Best clean frame from entire video
        if global_best_bg and global_best_score < _BG_THRESHOLD:
            result[lyrics_str] = global_best_bg
            stats["global"] += 1
            continue

        # Option 3: Local inpainting (OpenCV)
        if work_dir:
            inpaint_path = work_dir / f"inpaint_{lyrics_fp.stem}.jpg"
            if _inpaint_text_local(lyrics_fp, inpaint_path):
                result[lyrics_str] = inpaint_path
                stats["inpaint_local"] += 1
                continue

        # Option 4: Gemini inpainting (API cost)
        if work_dir:
            gemini_path = work_dir / f"gemini_bg_{lyrics_fp.stem}.jpg"
            if _inpaint_text_gemini(lyrics_fp, gemini_path, session_id):
                result[lyrics_str] = gemini_path
                stats["inpaint_gemini"] += 1
                continue

        stats["none"] += 1

    logger.info(f"Background sources: {stats}")
    return result


def _ocr_frames_with_size(frames: list[Path], session_id: str = "") -> tuple[dict[str, str], dict[str, int]]:
    """OCR frames preserving line structure, and estimate font size.

    Returns (texts_dict, font_size_dict).
    texts_dict values preserve the original line breaks from the video.
    font_size is estimated to match the video's text proportions.
    """
    from app.services.local_ocr import ocr_image, _get_ocr
    from PIL import Image
    import numpy as np

    texts = {}
    font_sizes = {}
    ocr = _get_ocr()

    for frame_path in frames:
        text = None
        estimated_size = 0

        if ocr:
            try:
                results = list(ocr.predict(str(frame_path)))
                # Collect all text boxes with their Y positions
                text_boxes = []  # [(y_center, height, text)]

                for r in results:
                    if 'rec_texts' not in r:
                        continue
                    polys = r.get('rec_polys', r.get('dt_polys', []))
                    for txt, score, poly in zip(r['rec_texts'], r['rec_scores'], polys):
                        if score > 0.5 and txt.strip():
                            if poly is not None and len(poly) >= 4:
                                poly_arr = np.array(poly)
                                y_coords = poly_arr[:, 1]
                                y_center = float(np.mean(y_coords))
                                box_h = float(np.max(y_coords) - np.min(y_coords))
                                text_boxes.append((y_center, box_h, txt.strip()))
                            else:
                                text_boxes.append((0, 0, txt.strip()))

                if text_boxes:
                    # Sort by Y position to preserve visual line order
                    text_boxes.sort(key=lambda x: x[0])

                    # Group into lines: boxes with similar Y center (within 1 box height)
                    lines = []
                    current_line_parts = [text_boxes[0]]

                    for box in text_boxes[1:]:
                        prev_y = current_line_parts[-1][0]
                        prev_h = current_line_parts[-1][1]
                        gap_threshold = max(prev_h * 0.6, 15)

                        if abs(box[0] - prev_y) < gap_threshold:
                            # Same line
                            current_line_parts.append(box)
                        else:
                            # New line — join current parts
                            line_text = " ".join(p[2] for p in current_line_parts)
                            lines.append(line_text)
                            current_line_parts = [box]

                    if current_line_parts:
                        lines.append(" ".join(p[2] for p in current_line_parts))

                    text = "\n".join(lines)

                    # Estimate font size from average box height
                    box_heights = [b[1] for b in text_boxes if b[1] > 0]
                    if box_heights:
                        img = Image.open(frame_path)
                        img_h = img.height
                        avg_h = sum(box_heights) / len(box_heights)
                        ratio = avg_h / img_h
                        estimated_size = int(ratio * 7.5 * 72)

                        # If too many lines, reduce font to fit
                        num_lines = len(lines)
                        # Max lines that fit: slide usable height (~5.5in) / line height
                        line_height_in = (estimated_size / 72) * 1.4
                        max_fitting = int(5.5 / line_height_in) if line_height_in > 0 else 8

                        if num_lines > max_fitting and max_fitting > 0:
                            # Scale down to fit all lines
                            scale = max_fitting / num_lines
                            estimated_size = int(estimated_size * scale)

                        estimated_size = max(24, min(estimated_size, 66))

            except Exception as e:
                logger.debug(f"PaddleOCR layout extraction failed: {e}")

        # Fallback to Gemini if PaddleOCR got nothing
        if not text:
            text = ocr_image(frame_path, session_id=session_id)

        if text:
            texts[str(frame_path)] = text
        if estimated_size:
            font_sizes[str(frame_path)] = estimated_size

    logger.info(f"OCR: {len(texts)}/{len(frames)} texts, {len(font_sizes)} with size estimates")
    return texts, font_sizes


def _ocr_frames(frames: list[Path], session_id: str = "") -> dict[str, str]:
    """OCR each frame using PaddleOCR (local), Gemini as fallback.

    Returns {frame_path_str: text}.
    """
    from app.services.local_ocr import ocr_image

    result = {}
    for frame_path in frames:
        text = ocr_image(frame_path, session_id=session_id)
        if text:
            result[str(frame_path)] = text

    logger.info(f"OCR extracted text for {len(result)}/{len(frames)} frames")
    return result


_FRAME_OCR_PROMPT = """Extract ONLY the Chinese lyrics text visible in this worship video screenshot.
Rules:
- Output ONLY the Chinese text, nothing else
- If no Chinese text is visible, output "NONE"
- Do not include English text
- Do not add explanation"""


def _dedup_frames_by_text(frames: list[Path], session_id: str = "") -> list[Path]:
    """Remove consecutive frames with identical lyrics text.

    Only deduplicates ADJACENT frames — repeated choruses are preserved.
    """
    from app.services import llm_service

    prev_text = ""
    deduped = []

    for frame_path in frames:
        try:
            text = llm_service.generate_from_image(
                frame_path.read_bytes(), "image/jpeg", _FRAME_OCR_PROMPT,
                session_id=session_id, action="frame_ocr",
            )
            if text == "NONE" or not text:
                continue
            normalized = ''.join(c for c in text if '\u4e00' <= c <= '\u9fff')
            # Only skip if SAME as immediately previous frame
            if normalized and normalized != prev_text:
                deduped.append(frame_path)
                prev_text = normalized
        except Exception:
            deduped.append(frame_path)

    return deduped


_FRAME_FILTER_PROMPT = """Analyze this screenshot from a worship song video.

Answer with ONLY "KEEP" or "SKIP" (one word, nothing else).

KEEP if:
- The frame shows complete, fully visible Chinese lyrics/text that is clearly readable
- The text is stable and not mid-animation (not fading in/out, not sliding, not partially visible)

SKIP if:
- No Chinese text visible
- Text is partially visible, cut off, or mid-transition/animation
- Text is blurry or still appearing (motion blur)
- Only background/scenery with no lyrics
- Duplicate content — same lyrics as would appear on another stable frame
- Only English text without Chinese"""


def _filter_frames_with_gemini(frames: list[Path], session_id: str = "") -> list[Path]:
    """Use the configured vision LLM to keep frames with complete Chinese lyrics."""
    from app.services import llm_service

    if not llm_service.is_vision_enabled():
        return frames

    kept = []
    for frame_path in frames:
        try:
            answer = llm_service.generate_from_image(
                frame_path.read_bytes(), "image/jpeg", _FRAME_FILTER_PROMPT,
                session_id=session_id, action="frame_filter",
            ).upper()
            if "KEEP" in answer:
                kept.append(frame_path)
        except Exception:
            # On per-frame error, keep the frame (be conservative)
            kept.append(frame_path)

    if len(kept) > 1:
        kept = _dedup_frames_by_text(kept, session_id=session_id)
    return kept
