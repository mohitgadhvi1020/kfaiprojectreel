import React from "react";
import { interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";

interface SubtitleOverlayProps {
  text: string;
  speaker: string;
  emotion: string;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  text,
  speaker,
  emotion,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideUp = spring({ frame, fps, config: { damping: 20, stiffness: 120 } });
  const translateY = interpolate(slideUp, [0, 1], [40, 0]);
  const opacity = interpolate(slideUp, [0, 1], [0, 1]);

  const emotionEmoji: Record<string, string> = {
    neutral: "",
    excited: "🔥",
    angry: "😤",
    laughing: "😂",
    thinking: "🤔",
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 100,
        left: 40,
        right: 40,
        transform: `translateY(${translateY}px)`,
        opacity,
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.85)",
          borderRadius: 20,
          padding: "24px 32px",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {/* Speaker tag */}
        <div
          style={{
            fontSize: 18,
            color: "#93c5fd",
            fontWeight: 700,
            marginBottom: 8,
            fontFamily: "Inter, sans-serif",
            textTransform: "uppercase",
            letterSpacing: 1.5,
          }}
        >
          {speaker} {emotionEmoji[emotion] || ""}
        </div>

        {/* Dialogue text */}
        <div
          style={{
            fontSize: 32,
            lineHeight: 1.4,
            color: "#ffffff",
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};
