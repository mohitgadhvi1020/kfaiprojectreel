import React from "react";
import { Composition } from "remotion";
import { DialogueVideo, DialogueVideoProps } from "./compositions/DialogueVideo";

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="DialogueVideo"
        component={DialogueVideo}
        durationInFrames={30 * 60}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          lines: [],
          characterA: { name: "Character A", avatarSrc: "" },
          characterB: { name: "Character B", avatarSrc: "" },
          backgroundVideoSrc: "",
        } satisfies DialogueVideoProps}
      />
    </>
  );
};
