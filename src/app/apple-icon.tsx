import { ImageResponse } from "next/og";
import { logoSvg } from "@/components/brand/logo-art";

export const dynamic = "force-static";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Same artwork as `icon.svg`, but full-bleed: iOS rounds the corners itself and paints transparent ones black. */
export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(logoSvg({ rounded: false })).toString("base64")}`;
  return new ImageResponse(<img src={src} width={size.width} height={size.height} alt="" />, size);
}
