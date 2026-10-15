import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export for 100% serverless Vercel deployment
  output: 'export',
};

export default nextConfig;
