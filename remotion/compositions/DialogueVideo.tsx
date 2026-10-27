import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  OffthreadVideo,
  Loop,
} from "remotion";
import { CharacterAvatar } from "../components/CharacterAvatar";
import { SubtitleOverlay } from "../components/SubtitleOverlay";
import { SpeakerIndicator } from "../components/SpeakerIndicator";

export interface DialogueLine {
  character: "A" | "B";
  text: string;
  emotion: string;
  audioSrc: string;
  durationInFrames: number;
}

export interface CharacterInfo {
  name: string;
  avatarSrc: string;
}

export interface DialogueVideoProps {
  lines: DialogueLine[];
  characterA: CharacterInfo;
  characterB: CharacterInfo;
  backgroundVideoSrc: string;
}

export const DialogueVideo: React.FC<DialogueVideoProps> = ({
  lines,
  characterA,
  characterB,
  backgroundVideoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  let currentLineIndex = -1;
  let accumulatedFrames = 0;

  const lineOffsets: number[] = [];
  for (const line of lines) {
    lineOffsets.push(accumulatedFrames);
    accumulatedFrames += line.durationInFrames;
  }

  for (let i = 0; i < lineOffsets.length; i++) {
    const start = lineOffsets[i];
    const end = start + lines[i].durationInFrames;
    if (frame >= start && frame < end) {
      currentLineIndex = i;
      break;
    }
  }

  const currentLine = currentLineIndex >= 0 ? lines[currentLineIndex] : null;
  const activeSide = currentLine
    ? currentLine.character === "A"
      ? "left"
      : "right"
    : null;
  const speakerName = currentLine
    ? currentLine.character === "A"
      ? characterA.name
      : characterB.name
    : "";

  const totalContentFrames = lines.reduce(
    (sum, l) => sum + l.durationInFrames,
    0
  );
  const bgLoopDuration = Math.max(totalContentFrames, durationInFrames);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background gameplay video */}
      {backgroundVideoSrc && (
        <Loop durationInFrames={bgLoopDuration}>
          <OffthreadVideo
            src={backgroundVideoSrc}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            volume={0.08}
          />
        </Loop>
      )}

      {/* Dark overlay for readability */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.6) 80%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Speaker indicator bar at top */}
      <SpeakerIndicator activeSide={activeSide} />

      {/* Character avatars */}
      <CharacterAvatar
        src={characterA.avatarSrc}
        name={characterA.name}
        side="left"
        isSpeaking={currentLine?.character === "A"}
      />
      <CharacterAvatar
        src={characterB.avatarSrc}
        name={characterB.name}
        side="right"
        isSpeaking={currentLine?.character === "B"}
      />

      {/* Audio sequences */}
      {lines.map((line, i) => (
        <Sequence
          key={`audio-${i}`}
          from={lineOffsets[i]}
          durationInFrames={line.durationInFrames}
        >
          {line.audioSrc && <Audio src={line.audioSrc} volume={1} />}
        </Sequence>
      ))}

      {/* Subtitle sequences */}
      {lines.map((line, i) => (
        <Sequence
          key={`sub-${i}`}
          from={lineOffsets[i]}
          durationInFrames={line.durationInFrames}
        >
          <SubtitleOverlay
            text={line.text}
            speaker={
              line.character === "A" ? characterA.name : characterB.name
            }
            emotion={line.emotion}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
