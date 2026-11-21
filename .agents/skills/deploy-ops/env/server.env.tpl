# 由 deploy-ops `env sync` 从 .agents/skills/deploy-ops/.env 渲染生成。
# 不要在服务器上直接编辑：下次同步会被覆盖。
NODE_ENV=production

# ── HTTP：只监听回环，公网入口只有 nginx ──
PORT={{API_PORT}}
HOST=127.0.0.1
CORS_ORIGIN={{PUBLIC_ORIGIN}},http://127.0.0.1:{{WEB_PORT}}

# ── PostgreSQL（本机 5432，不对公网开放） ──
DATABASE_URL={{DATABASE_URL}}

# ── LLM（OpenAI 兼容） ──
LLM_BASE_URL={{LLM_BASE_URL}}
LLM_API_KEY={{LLM_API_KEY}}
LLM_MODEL={{LLM_MODEL}}
