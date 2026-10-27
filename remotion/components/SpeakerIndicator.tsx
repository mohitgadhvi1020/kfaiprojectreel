import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

interface SpeakerIndicatorProps {
  activeSide: "left" | "right" | null;
}

export const SpeakerIndicator: React.FC<SpeakerIndicatorProps> = ({
  activeSide,
}) => {
  const frame = useCurrentFrame();

  if (!activeSide) return null;

  const barWidth = interpolate(Math.sin(frame * 0.15), [-1, 1], [60, 100]);

  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 20,
        alignItems: "center",
      }}
    >
      {/* Left indicator */}
      <div
        style={{
          width: activeSide === "left" ? barWidth : 40,
          height: 6,
          borderRadius: 3,
          background:
            activeSide === "left"
              ? "rgba(59,130,246,0.9)"
              : "rgba(255,255,255,0.2)",
          transition: "all 0.15s",
        }}
      />

      {/* Divider dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.4)",
        }}
      />

      {/* Right indicator */}
      <div
        style={{
          width: activeSide === "right" ? barWidth : 40,
          height: 6,
          borderRadius: 3,
          background:
            activeSide === "right"
              ? "rgba(236,72,153,0.9)"
              : "rgba(255,255,255,0.2)",
          transition: "all 0.15s",
        }}
      />
    </div>
  );
};
