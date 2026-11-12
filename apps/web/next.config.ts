import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  transpilePackages: ['@xs/shared'],
  serverExternalPackages: [
    '@copilotkit/runtime',
    '@copilotkitnext/runtime',
    '@copilotkitnext/agent',
  ],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
