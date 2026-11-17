/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopack: {
      // Force Turbopack for dev to avoid slow webpack compilation
      // and eliminate chunk source-map 404s.
    },
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        pathname: '/**',
      },
    ],
  },
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;