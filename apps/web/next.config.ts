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
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // CopilotKit 的浏览器包会间接引入 Node 专用的遥测 SDK（@segment/analytics-node）：
      // 它既不该进客户端包（体积 + 隐私），也会把 jose 的 Node 构建拖进 webpack 解析，
      // 在部分 bun 安装产物上直接报 "Module not found: Can't resolve 'jose'"。
      // 服务端不受影响：@copilotkit/runtime 在 serverExternalPackages 里，仍是外部依赖。
      config.resolve.alias = {
        ...config.resolve.alias,
        '@segment/analytics-node': false,
      }
    }
    return config
  },
}

export default nextConfig
