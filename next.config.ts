import type { NextConfig } from "next";

const imageRemotePatterns: Array<{
  protocol: "http" | "https";
  hostname: string;
  port?: string;
  pathname?: string;
}> = [
  {
    protocol: "http",
    hostname: "103.31.204.110",
    port: "1608",
    pathname: "/**",
  },
  {
    protocol: "https",
    hostname: "s3.jahris.id",
    pathname: "/**",
  },
  {
    protocol: "https",
    hostname: "s3-jaxer.tetrabit.my.id",
    pathname: "/**",
  },
];

try {
  const minioPublicUrl = new URL(
    process.env.MINIO_PUBLIC_URL || "https://s3.jahris.id",
  );
  const protocol = minioPublicUrl.protocol.replace(":", "");
  if (protocol === "http" || protocol === "https") {
    const alreadyConfigured = imageRemotePatterns.some(
      (pattern) =>
        pattern.protocol === protocol &&
        pattern.hostname === minioPublicUrl.hostname &&
        (pattern.port || "") === minioPublicUrl.port,
    );
    if (!alreadyConfigured) {
      imageRemotePatterns.push({
        protocol,
        hostname: minioPublicUrl.hostname,
        port: minioPublicUrl.port,
        pathname: "/**",
      });
    }
  }
} catch {
  // Invalid MINIO_PUBLIC_URL falls back to the static hosts above.
}

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "cross-origin",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: imageRemotePatterns,
  },
};

export default nextConfig;
