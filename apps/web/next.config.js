/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true
  },
  async redirects() {
    return [
      {
        source: "/auth",
        destination: "/",
        permanent: false
      }
    ];
  }
};

module.exports = nextConfig;
