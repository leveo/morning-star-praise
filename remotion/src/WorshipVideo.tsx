import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  interpolateColors,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
import { z } from "zod";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const isVideoSrc = (src: string): boolean =>
  /\.(mp4|webm|mov)$/i.test(src);

/** Same composition serves both the CLI render (where ``backgroundSrc``
 *  is a relative filename under Remotion's public dir) and the
 *  ``@remotion/player`` embed in the frontend (where everything is a
 *  real URL served by FastAPI). ``staticFile()`` throws on absolute
 *  URLs, so intercept anything that already looks like one. */
const resolveAssetUrl = (src: string): string => {
  if (/^https?:\/\//.test(src) || src.startsWith("/") || src.startsWith("blob:") || src.startsWith("data:")) {
    return src;
  }
  return staticFile(src);
};

// Inter loads via @remotion/google-fonts (proper delayRender integration).
// CJK text falls back to system fonts on the render machine — e.g. PingFang SC
// or Hiragino Sans GB on macOS Chromium, Noto Sans CJK on Linux. For fully
// deterministic CJK output across platforms, drop a .woff2 into public/fonts/
// and load it via `@remotion/fonts` instead of relying on system fallbacks.
const { fontFamily: interFamily } = loadInter("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

const CJK_FONT_STACK =
  '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", "Heiti SC", sans-serif';

export const unitSchema = z.object({
  text: z.string(),
  startSec: z.number().nullable(),
  isLineBreak: z.boolean(),
});

export const chunkSchema = z.object({
  text: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  backgroundSrc: z.string().nullable(),
  // CLI render gets a filename under public_dir; Player gets an absolute URL
  // — `resolveAssetUrl` branches on that.
  sheetImageSrc: z.string().nullable().optional(),
  units: z.array(unitSchema).optional(),
});

export const worshipVideoSchema = z.object({
  title: z.string(),
  composer: z.string(),
  language: z.string(),
  audioSrc: z.string(),
  audioDurationSec: z.number(),
  introDurationSec: z.number(),
  chunks: z.array(chunkSchema),
  titleBackgroundSrc: z.string().nullable(),
  karaokeMode: z.boolean().optional(),
  // Font sizes are expressed in PPT points (1080p canvas uses px = pt * 2
  // since the PPT reference slide is 540pt tall). null / undefined = use
  // the per-language defaults (80px zh / 72px en for content slides).
  primaryFontSizePt: z.number().nullable().optional(),
  secondaryFontSizePt: z.number().nullable().optional(),
  lineSpacingMultiplier: z.number().nullable().optional(),
  showPageNumbers: z.boolean().optional(),
  // 'dark' = black semi-transparent overlay + white text (default);
  // 'light' = white semi-transparent overlay + black text.
  paddingStyle: z.enum(["dark", "light"]).optional(),
});

export type WorshipVideoProps = z.infer<typeof worshipVideoSchema>;
export type KaraokeUnit = z.infer<typeof unitSchema>;
export type PaddingStyle = "dark" | "light";

const KARAOKE_RAMP_SEC = 0.15;

const hasChinese = (s: string) => /[\u4e00-\u9fff]/.test(s);

const titleFontSize = (textLen: number): number => {
  if (textLen <= 4) return 192;
  if (textLen <= 8) return 168;
  if (textLen <= 12) return 144;
  if (textLen <= 20) return 132;
  return 120;
};

type SlideProps = {
  text: string;
  backgroundSrc: string | null;
  sheetImageSrc?: string | null;
  language: string;
  isTitle?: boolean;
  secondary?: string;
  units?: KaraokeUnit[];
  sequenceStartSec?: number;
  primaryFontSizePt?: number | null;
  secondaryFontSizePt?: number | null;
  lineSpacingMultiplier?: number | null;
  /** 1-based page number to render in the corner. 0 means "don't show". */
  pageNumber?: number;
  /** Total content pages for the "N / total" badge. */
  totalPages?: number;
  paddingStyle?: PaddingStyle;
};

// PPT-reference slide is 540pt tall; our Remotion canvas is 1080px tall.
// So px = pt * (1080 / 540) = pt * 2.
const PT_TO_PX = 2;

const groupUnitsByLine = (units: KaraokeUnit[]): KaraokeUnit[][] => {
  const lines: KaraokeUnit[][] = [[]];
  for (const u of units) {
    if (u.isLineBreak) {
      lines.push([]);
    } else {
      lines[lines.length - 1].push(u);
    }
  }
  return lines;
};

type PaddingPalette = {
  overlayBg: string;
  primaryText: string;
  secondaryText: string;
  pageBadgeBg: string;
  pageBadgeFg: string;
  textShadow: string;
  karaokeUnsung: string;
  karaokeSung: string;
};

const PADDING_PALETTE: Record<PaddingStyle, PaddingPalette> = {
  dark: {
    overlayBg: "rgba(0,0,0,0.4)",
    primaryText: "#ffffff",
    secondaryText: "#d2d2d2",
    pageBadgeBg: "rgba(0,0,0,0.55)",
    pageBadgeFg: "#ffffff",
    textShadow: "3px 3px 0 rgba(0,0,0,0.75)",
    karaokeUnsung: "#ffffff",
    karaokeSung: "#fde047",          // tailwind yellow-300
  },
  light: {
    overlayBg: "rgba(255,255,255,0.55)",
    primaryText: "#0f172a",
    secondaryText: "#475569",
    pageBadgeBg: "rgba(255,255,255,0.7)",
    pageBadgeFg: "#0f172a",
    textShadow: "1px 1px 0 rgba(255,255,255,0.85)",
    karaokeUnsung: "#0f172a",        // slate-900
    karaokeSung: "#b45309",          // amber-700 (stands out on white)
  },
};

const KaraokeBlock: React.FC<{
  units: KaraokeUnit[];
  absTimeSec: number;
  paddingStyle: PaddingStyle;
}> = ({ units, absTimeSec, paddingStyle }) => {
  const { karaokeUnsung: unsung, karaokeSung: sung } = PADDING_PALETTE[paddingStyle];
  const lines = groupUnitsByLine(units);
  return (
    <>
      {lines.map((lineUnits, i) => (
        <div key={i}>
          {lineUnits.length === 0 ? (
            <>&nbsp;</>
          ) : (
            lineUnits.map((u, j) => {
              if (u.startSec == null) {
                return (
                  <span key={j} style={{ color: unsung }}>
                    {u.text}
                  </span>
                );
              }
              const color = interpolateColors(
                absTimeSec,
                [u.startSec, u.startSec + KARAOKE_RAMP_SEC],
                [unsung, sung],
              );
              return (
                <span key={j} style={{ color }}>
                  {u.text}
                </span>
              );
            })
          )}
        </div>
      ))}
    </>
  );
};

const Slide: React.FC<SlideProps> = ({
  text,
  backgroundSrc,
  sheetImageSrc = null,
  language,
  isTitle = false,
  secondary = "",
  units,
  sequenceStartSec = 0,
  primaryFontSizePt,
  secondaryFontSizePt,
  lineSpacingMultiplier,
  pageNumber = 0,
  totalPages = 0,
  paddingStyle = "dark",
}) => {
  const {
    overlayBg,
    primaryText: primaryTextColor,
    secondaryText: secondaryTextColor,
    pageBadgeBg,
    pageBadgeFg,
    textShadow,
  } = PADDING_PALETTE[paddingStyle];
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeFrames = Math.max(1, Math.round(fps * 0.4));
  // Skip fade-in for the title slide so frame 0 of the MP4 (and its auto
  // poster/thumbnail) isn't a black frame from the opacity ramp.
  const opacity = isTitle
    ? 1
    : interpolate(frame, [0, fadeFrames], [0, 1], {
        easing: Easing.out(Easing.cubic),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  const isZh = language.startsWith("zh") || hasChinese(text);
  const fontFamilyStack = isZh
    ? `${CJK_FONT_STACK}, ${interFamily}`
    : `${interFamily}, ${CJK_FONT_STACK}`;

  const primarySize = isTitle
    ? titleFontSize(text.length)
    : primaryFontSizePt != null
      ? Math.round(primaryFontSizePt * PT_TO_PX)
      : isZh
        ? 80
        : 72;
  const secondarySize = secondaryFontSizePt != null
    ? Math.round(secondaryFontSizePt * PT_TO_PX)
    : Math.round(primarySize * 0.42);
  const primaryLineHeight = lineSpacingMultiplier ?? (isZh ? 1.5 : 1.3);

  const lines = text.split("\n");
  const useKaraoke = !isTitle && Array.isArray(units) && units.length > 0;
  const absTimeSec = sequenceStartSec + frame / fps;

  const bgIsVideo = backgroundSrc ? isVideoSrc(backgroundSrc) : false;
  const coverStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  };

  return (
    <AbsoluteFill style={{ opacity }}>
      {backgroundSrc ? (
        bgIsVideo ? (
          <Video src={resolveAssetUrl(backgroundSrc)} loop muted style={coverStyle} />
        ) : (
          <Img src={resolveAssetUrl(backgroundSrc)} style={coverStyle} />
        )
      ) : (
        <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }} />
      )}

      {/* Semi-transparent overlay — 0.5" pad at 144 DPI = 72px */}
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            top: 72,
            left: 72,
            right: 72,
            bottom: 72,
            backgroundColor: overlayBg,
          }}
        />
      </AbsoluteFill>

      {/* Stack to column only when a sheet overlay is present — otherwise keep
          the original single-child flex so sheet-less slides don't shift. */}
      <AbsoluteFill
        style={{
          padding: 130,
          display: "flex",
          flexDirection: !isTitle && sheetImageSrc ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: !isTitle && sheetImageSrc ? 40 : 0,
          textAlign: "center",
        }}
      >
        {!isTitle && sheetImageSrc ? (
          <Img
            src={resolveAssetUrl(sheetImageSrc)}
            style={{
              maxHeight: "40%",
              maxWidth: "90%",
              objectFit: "contain",
              backgroundColor: "rgba(255,255,255,0.95)",
              borderRadius: 8,
              padding: 12,
            }}
          />
        ) : null}
        <div
          style={{
            color: primaryTextColor,
            fontFamily: fontFamilyStack,
            fontSize: primarySize,
            fontWeight: 700,
            lineHeight: primaryLineHeight,
            textShadow,
            whiteSpace: "pre-wrap",
            wordBreak: isZh ? "normal" : "break-word",
          }}
        >
          {useKaraoke ? (
            <KaraokeBlock units={units!} absTimeSec={absTimeSec} paddingStyle={paddingStyle} />
          ) : (
            lines.map((line, i) => (
              <div key={i}>{line === "" ? "\u00A0" : line}</div>
            ))
          )}
          {isTitle && secondary ? (
            <div
              style={{
                fontSize: secondarySize,
                color: secondaryTextColor,
                marginTop: 40,
                fontWeight: 400,
              }}
            >
              {secondary}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>

      {pageNumber > 0 && totalPages > 0 && !isTitle ? (
        <div
          style={{
            position: "absolute",
            right: 90,
            bottom: 90,
            padding: "8px 20px",
            borderRadius: 999,
            backgroundColor: pageBadgeBg,
            color: pageBadgeFg,
            fontFamily: fontFamilyStack,
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: 1,
          }}
        >
          {pageNumber} / {totalPages}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const WorshipVideo: React.FC<WorshipVideoProps> = ({
  title,
  composer,
  language,
  audioSrc,
  introDurationSec,
  chunks,
  titleBackgroundSrc,
  karaokeMode = false,
  primaryFontSizePt,
  secondaryFontSizePt,
  lineSpacingMultiplier,
  showPageNumbers = false,
  paddingStyle = "dark",
}) => {
  const { fps } = useVideoConfig();
  const fadeFrames = Math.max(1, Math.round(fps * 0.4));

  const introFrames = Math.max(1, Math.round(introDurationSec * fps));

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <Audio src={resolveAssetUrl(audioSrc)} />

      {/* Title slide */}
      <Sequence from={0} durationInFrames={introFrames} premountFor={fps}>
        <Slide
          text={title}
          backgroundSrc={titleBackgroundSrc}
          language={language}
          isTitle
          secondary={composer}
          primaryFontSizePt={primaryFontSizePt}
          secondaryFontSizePt={secondaryFontSizePt}
          lineSpacingMultiplier={lineSpacingMultiplier}
          paddingStyle={paddingStyle}
        />
      </Sequence>

      {/* Content slides — each starts `fadeFrames` early so its fade-in
          overlaps the end of the previous slide for a smooth crossfade. */}
      {chunks.map((chunk, i) => {
        const nativeFrom = Math.round(chunk.startSec * fps);
        const overlappedFrom = Math.max(0, nativeFrom - fadeFrames);
        const dur =
          Math.max(1, Math.round((chunk.endSec - chunk.startSec) * fps)) +
          (nativeFrom - overlappedFrom);
        return (
          <Sequence
            key={i}
            from={overlappedFrom}
            durationInFrames={dur}
            premountFor={fps}
          >
            <Slide
              text={chunk.text}
              backgroundSrc={chunk.backgroundSrc}
              sheetImageSrc={chunk.sheetImageSrc ?? null}
              language={language}
              units={karaokeMode ? chunk.units : undefined}
              sequenceStartSec={overlappedFrom / fps}
              primaryFontSizePt={primaryFontSizePt}
              secondaryFontSizePt={secondaryFontSizePt}
              lineSpacingMultiplier={lineSpacingMultiplier}
              pageNumber={showPageNumbers ? i + 1 : 0}
              totalPages={showPageNumbers ? chunks.length : 0}
              paddingStyle={paddingStyle}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
