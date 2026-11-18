# 由 deploy-ops `env sync` 从 skills/deploy-ops/.env 渲染生成。
# 注意：NEXT_PUBLIC_* 在 build 时被内联进客户端包，改域名必须重新构建（CI 会做）。
NODE_ENV=production

# 浏览器访问 Elysia 的前缀（nginx 的 /elysia/ 反代到 127.0.0.1:3101）
NEXT_PUBLIC_API_URL={{PUBLIC_API_URL}}

# Next 的 BFF（/api/demo SSE 透传）实际请求的地址
API_INTERNAL_URL=http://127.0.0.1:{{API_PORT}}

# CopilotKit runtime（服务端才有）
LLM_BASE_URL={{LLM_BASE_URL}}
LLM_API_KEY={{LLM_API_KEY}}
LLM_MODEL={{LLM_MODEL}}
