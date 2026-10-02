#!/bin/bash
# 달 없는 밤 · 서버 설치 (Ubuntu 22.04/24.04 · AWS 라이트세일/오라클 공용)
# 사용법: curl -fsSL https://raw.githubusercontent.com/gh920327-cmyk/blood-catacomb/main/deploy/setup.sh | sudo bash
# 다시 실행해도 안전합니다 (이미 깔린 건 건너뜀).
set -e
REPO=https://github.com/gh920327-cmyk/blood-catacomb.git
APP=/opt/bc
DATA=/var/lib/bc
OLD=https://blood-catacomb.onrender.com
export DEBIAN_FRONTEND=noninteractive
say(){ echo -e "\n\033[1;33m▶ $*\033[0m"; }

say "1/7 메모리 여유분(스왑) 준비"
if [ ! -f /swapfile ]; then fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi

say "2/7 기본 도구 설치"
apt-get update -y -qq
apt-get install -y -qq curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null

say "3/7 Node.js 22 설치"
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

say "4/7 HTTPS 서버(Caddy) 설치"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y -qq && apt-get install -y -qq caddy >/dev/null
fi

say "5/7 게임 내려받기"
id bc >/dev/null 2>&1 || useradd -r -m -d /home/bc -s /usr/sbin/nologin bc
mkdir -p "$DATA"
if [ ! -d "$APP/.git" ]; then git clone -q "$REPO" "$APP"; fi
git -C "$APP" fetch -q origin main && git -C "$APP" reset -q --hard origin/main
for f in ranks.json fame.json raidlog.jsonl; do
  if [ ! -f "$DATA/$f" ] && [ -f "$APP/data/$f" ]; then cp "$APP/data/$f" "$DATA/$f"; fi
done
# 옛 서버의 현재 랭킹·명예의 전당 가져오기 (실패해도 계속)
if [ ! -f "$DATA/.imported" ] && curl -fsS --max-time 20 "$OLD/api/export" -o /tmp/bcexp.json; then
  node -e '
    const fs=require("fs"),o=JSON.parse(fs.readFileSync("/tmp/bcexp.json","utf8")),D=process.argv[1];
    if(o.ranks&&Array.isArray(o.ranks.cpr))fs.writeFileSync(D+"/ranks.json",JSON.stringify(o.ranks));
    if(Array.isArray(o.fame)&&o.fame.length)fs.writeFileSync(D+"/fame.json",JSON.stringify(o.fame));
    console.log("랭킹",(o.ranks.cpr||[]).length,"명 · 명예의 전당",(o.fame||[]).length,"건 가져옴");' "$DATA" && touch "$DATA/.imported" || true
fi
chown -R bc:bc "$DATA"
[ -f /etc/bc.env ] || echo "BC_MOVE_TO=" > /etc/bc.env

say "6/7 자동 실행 · 자동 업데이트 등록"
cat > /etc/systemd/system/bc.service <<EOF
[Unit]
Description=Moonless Night game server
After=network-online.target
[Service]
User=bc
WorkingDirectory=$APP
Environment=PORT=3000
Environment=BC_DATA=$DATA
EnvironmentFile=-/etc/bc.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
EOF
cat > /usr/local/bin/bc-update <<EOF
#!/bin/bash
# 깃허브 main에 새 커밋이 있으면 받아서 재시작
cd $APP || exit 0
git fetch -q origin main || exit 0
if [ "\$(git rev-parse HEAD)" != "\$(git rev-parse origin/main)" ]; then
  git reset -q --hard origin/main
  systemctl restart bc
  echo "updated to \$(git rev-parse --short HEAD)"
fi
EOF
chmod +x /usr/local/bin/bc-update
cat > /etc/systemd/system/bc-update.service <<EOF
[Unit]
Description=Moonless Night auto update
[Service]
Type=oneshot
ExecStart=/usr/local/bin/bc-update
EOF
cat > /etc/systemd/system/bc-update.timer <<EOF
[Unit]
Description=Check GitHub for updates every minute
[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable -q --now bc.service bc-update.timer
systemctl restart bc

say "7/7 HTTPS 주소 연결"
IP=$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')
HOST="${IP//./-}.sslip.io"
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
  encode gzip
  reverse_proxy 127.0.0.1:3000
}
EOF
systemctl enable -q caddy
systemctl restart caddy

sleep 3
if curl -fsS --max-time 5 http://127.0.0.1:3000/health >/dev/null; then OK="게임 서버 정상"; else OK="게임 서버 응답 없음 (journalctl -u bc 확인)"; fi
echo
echo "=============================================="
echo " 설치 끝 · $OK"
echo " 새 주소:  https://$HOST/"
echo " (인증서 발급에 1분 정도 걸릴 수 있어요)"
echo "=============================================="
