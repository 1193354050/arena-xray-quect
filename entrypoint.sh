#!/bin/sh
set -eu
PORT="${PORT:-8080}"
UUID="${UUID:?UUID required}"
WSPATH="${WSPATH:-/ws}"
VER="${XRAY_VER:-v26.10.31}"
SHA="${XRAY_SHA256:-e4bd9119f50ae7c41658b1abd0679ae06f98bd864a2907ff33f2f2cf7081b214}"
DIR=/tmp/xr
mkdir -p "$DIR"
BIN="$DIR/xray"
if [ ! -x "$BIN" ]; then
  apk add --no-cache curl unzip ca-certificates >/dev/null
  curl -fsSL "https://github.com/XTLS/Xray-core/releases/download/${VER}/Xray-linux-64.zip" -o "$DIR/x.zip"
  echo "${SHA}  $DIR/x.zip" | sha256sum -c -
  unzip -o "$DIR/x.zip" xray -d "$DIR"
  chmod +x "$BIN"
  rm -f "$DIR/x.zip"
fi
cat > "$DIR/c.json" << JSON
{"log":{"loglevel":"${XLOG:-warning}"},"inbounds":[{"listen":"0.0.0.0","port":${PORT},"protocol":"vless","settings":{"clients":[{"id":"${UUID}"}],"decryption":"none"},"streamSettings":{"network":"ws","wsSettings":{"path":"${WSPATH}"}}}],"outbounds":[{"protocol":"freedom","settings":{"domainStrategy":"UseIPv4"}}]}
JSON
exec "$BIN" run -c "$DIR/c.json"
