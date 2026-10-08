import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "CareerDev Global symbol logo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "white",
        }}
      >
        <img
          src="https://careerdevglobal-nine.vercel.app/S1.svg"
          alt="CareerDev Global"
          width="430"
          height="418"
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { ...size }
  );
}
