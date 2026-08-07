#!/bin/sh
set -e

# 本项目使用 legacy HS256 JWT 作为 API key：
# - 已有 Authorization（用户会话 JWT）时原样透传
# - 仅有 apikey 时，把 apikey 直接作为 Authorization 传给下游（PostgREST / GoTrue 会校验签名）
export LUA_AUTH_EXPR="\$((headers.authorization ~= nil and headers.authorization:sub(1, 10) ~= 'Bearer sb_' and headers.authorization) or headers.apikey)"

# 用 awk 做环境变量替换（保留 YAML 引号；eval 会破坏双引号导致 YAML 解析失败）
awk '{
  result = ""
  rest = $0
  while (match(rest, /\$[A-Za-z_][A-Za-z_0-9]*/)) {
    varname = substr(rest, RSTART + 1, RLENGTH - 1)
    if (varname in ENVIRON) {
      result = result substr(rest, 1, RSTART - 1) ENVIRON[varname]
    } else {
      result = result substr(rest, 1, RSTART + RLENGTH - 1)
    }
    rest = substr(rest, RSTART + RLENGTH)
  }
  print result rest
}' /home/kong/kong.template.yml > /home/kong/kong.yml

exec ./docker-entrypoint.sh kong docker-start
