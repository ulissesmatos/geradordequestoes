import { ImageResponse } from "next/og";
import { getAppSettings } from "@/lib/app-settings";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const appSettings = await getAppSettings();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#0a6268",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: "80px",
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.02em" }}>{appSettings.appName}</div>
        <div style={{ marginTop: 28, fontSize: 32, color: "rgba(255,255,255,0.85)", maxWidth: 900 }}>
          Questões novas a cada prompt. No padrão da sua banca.
        </div>
      </div>
    ),
    { ...size }
  );
}
