import React from "react";
import { Img, interpolate, useCurrentFrame } from "remotion";

interface CharacterAvatarProps {
  src: string;
  name: string;
  side: "left" | "right";
  isSpeaking: boolean;
}

export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({
  src,
  name,
  side,
  isSpeaking,
}) => {
  const frame = useCurrentFrame();

  const pulseScale = isSpeaking
    ? interpolate(Math.sin(frame * 0.3), [-1, 1], [1.0, 1.06])
    : 1;

  const glowOpacity = isSpeaking
    ? interpolate(Math.sin(frame * 0.25), [-1, 1], [0.4, 0.9])
    : 0;

  const borderColor = isSpeaking ? "#3b82f6" : "rgba(255,255,255,0.2)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        position: "absolute",
        bottom: 380,
        [side === "left" ? "left" : "right"]: 80,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 200,
          height: 200,
          borderRadius: "50%",
          transform: `scale(${pulseScale})`,
        }}
      >
        {/* Glow ring */}
        <div
          style={{
            position: "absolute",
            inset: -8,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(59,130,246,${glowOpacity * 0.5}) 0%, transparent 70%)`,
            opacity: glowOpacity,
          }}
        />

        {/* Border ring */}
        <div
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: "50%",
            border: `4px solid ${borderColor}`,
            transition: "border-color 0.15s",
          }}
        />

        {/* Avatar image */}
        {src ? (
          <Img
            src={src}
            style={{
              width: 200,
              height: 200,
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: side === "left" ? "#6366f1" : "#ec4899",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 64,
              color: "#fff",
              fontWeight: 700,
            }}
          >
            {name.charAt(0)}
          </div>
        )}
      </div>

      {/* Name label */}
      <div
        style={{
          background: isSpeaking
            ? "rgba(59,130,246,0.9)"
            : "rgba(0,0,0,0.6)",
          color: "#fff",
          padding: "6px 18px",
          borderRadius: 20,
          fontSize: 22,
          fontWeight: 600,
          fontFamily: "Inter, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </div>
    </div>
  );
};
