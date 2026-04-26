// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import "./index.css";
import type { CalculateMetadataFunction } from "remotion";
import { Composition } from "remotion";
import {
  WorshipVideo,
  worshipVideoSchema,
  type WorshipVideoProps,
} from "./WorshipVideo";

const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const VIDEO_FPS = 30;

const calculateMetadata: CalculateMetadataFunction<WorshipVideoProps> = ({
  props,
}) => {
  const durationInFrames = Math.max(
    1,
    Math.ceil(props.audioDurationSec * VIDEO_FPS),
  );
  return { durationInFrames };
};

const defaultProps: WorshipVideoProps = {
  title: "Amazing Grace",
  composer: "",
  language: "en",
  audioSrc: "audio.mp3",
  audioDurationSec: 10,
  introDurationSec: 2,
  chunks: [
    {
      text: "Amazing grace how sweet the sound\nThat saved a wretch like me",
      startSec: 2,
      endSec: 6,
      backgroundSrc: null,
    },
    {
      text: "I once was lost but now am found\nWas blind but now I see",
      startSec: 6,
      endSec: 10,
      backgroundSrc: null,
    },
  ],
  titleBackgroundSrc: null,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="WorshipVideo"
        component={WorshipVideo}
        durationInFrames={300}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        schema={worshipVideoSchema}
        defaultProps={defaultProps}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};
