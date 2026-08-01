import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Fixe la racine du workspace sur ce projet : un package-lock.json existe
  // aussi dans le dossier home (autre projet), ce qui faussait la détection.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
