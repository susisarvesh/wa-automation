import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Simple Vsmart-colored mark for browser tabs. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#3659c9",
          borderRadius: "6px 14px 6px 14px",
        }}
      >
        <div
          style={{
            width: 16,
            height: 10,
            borderLeft: "3px solid #f97316",
            borderBottom: "3px solid #f97316",
            transform: "rotate(-45deg) translateY(-2px)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
