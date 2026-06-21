import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/tools/room-check/history", destination: "/tools/clean-check/history", permanent: true },
      { source: "/tools/room-check", destination: "/tools/clean-check", permanent: true },
      { source: "/tools/tutor/library", destination: "/tools/study-quiz/library", permanent: true },
      { source: "/tools/tutor", destination: "/tools/study-quiz", permanent: true },
    ];
  },
};

export default nextConfig;
