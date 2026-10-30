# OpenAN Demo 閮ㄧ讲鎸囧涔?
> 鐗堟湰锛歷1.0 锝?鏇存柊鏃ユ湡锛?026-10-15 锝?閫傜敤浠撳簱锛歚project-openan/openan-demo`
>
> 鏈寚瀵间功璁板綍 `observation-demo` 涓?`ontology-showcase` 涓や釜 Demo 鍦ㄩ樋閲屼簯 ECS 涓?> **鍗曠鍙ｃ€乁RL 璺緞鍖哄垎銆佹棤 Docker锛坣ginx + systemd 瑁告満閮ㄧ讲锛?* 鐨勫畬鏁村彲澶嶇幇娴佺▼銆?
---

## 1. 閮ㄧ讲缁撴灉姒傝

| 椤圭洰 | 鍊?|
|---|---|
| 鏈嶅姟鍣?| 203.0.113.10锛堥樋閲屼簯 ap-southeast-1锛孶buntu 24.04锛宔cs.e-c1m2.large 2C8G锛?|
| 瀵瑰绔彛 | **9010**锛堝崟绔彛锛屾墍鏈?Demo 閫氳繃 URL 璺緞鍖哄垎锛?|
| 鍏ュ彛瀵艰埅椤?| http://203.0.113.10:9010/ |
| Observation Demo锛圓2A-T 灞曞睆锛?| http://203.0.113.10:9010/observation-demo/ |
| Ontology Showcase锛堟湰浣撳簲鐢ㄦ紨绀猴級 | http://203.0.113.10:9010/ontology-showcase/ |
| 鍚庣 API 鍋ュ悍妫€鏌?| http://203.0.113.10:9010/api/health |
| 閮ㄧ讲鏂瑰紡 | nginx 鎵樼闈欐€佷骇鐗?+ systemd 甯搁┗ Node 鍚庣锛?*鍏ㄧ▼鏈娇鐢?Docker**锛?|

## 2. 鍓嶇疆鏉′欢

### 2.1 杞欢涓庣増鏈?
| 缁勪欢 | 鐗堟湰 | 璇存槑 |
|---|---|---|
| 鏈嶅姟鍣?OS | Ubuntu 24.04 LTS | 宸查瑁?nginx 1.24銆乬it銆乸ython3 |
| 鏈嶅姟鍣?Node | v20.18.1锛堢郴缁熻嚜甯︼級 | 浠呬綔鍏滃簳锛?*涓嶇敤浜庢瀯寤?* |
| 鏋勫缓 Node | v22.14.0锛坄/opt/node22`锛岀嫭绔嬬洰褰曪級 | Vite 8 瑕佹眰 Node 鈮?20.19锛屼笉寰楀姩绯荤粺 Node 浠ュ厤褰卞搷鍏朵粬鏈嶅姟 |
| 鏈湴鏋勫缓鏈?| Windows 10/11 + Node 鈮?20.19 | 鎺ㄨ崘鍦ㄦ湰鍦版瀯寤哄悗涓婁紶浜х墿锛堟湇鍔″櫒鍏綉甯﹀灏忥紝鏈嶅姟鍣ㄧ npm 鏋佹參锛?|

### 2.2 闃块噷浜戝畨鍏ㄧ粍

鍏ユ柟鍚戞斁琛岃鍒欙紙鎺у埗鍙?鈫?ECS 鈫?瀹夊叏缁?鈫?閰嶇疆瑙勫垯锛夛細

| 鍗忚 | 绔彛 | 婧愬湴鍧€ | 鐢ㄩ€?|
|---|---|---|---|
| TCP | 9010 | 0.0.0.0/0 | Demo 瀵瑰璁块棶鍏ュ彛 |
| TCP | 22 |锛堝凡鏈夛級| SSH 杩愮淮 |

> 9022锛堝悗绔?API锛変粎缁戝畾鏈満鍥炵幆銆佺敱 nginx 杞彂锛?*鏃犻渶**鍦ㄥ畨鍏ㄧ粍鏀捐銆?
## 3. 鏋舵瀯

```
娴忚鍣?  鈹? http://203.0.113.10:9010/{path}
  鈻?闃块噷浜戝畨鍏ㄧ粍锛圱CP 9010锛?  鈻?nginx :9010                鈫?/etc/nginx/sites-available/openan-demos.conf
  鈹溾攢 /                     鈫?/var/www/openan-demos/index.html        锛堝鑸〉锛?  鈹溾攢 /observation-demo/    鈫?.../observation-demo/dist/               锛堢函闈欐€侊紝Vite singlefile锛?  鈹溾攢 /ontology-showcase/   鈫?.../ontology-showcase/dist/              锛堢函闈欐€侊級
  鈹溾攢 /api/                 鈫?http://127.0.0.1:9022  锛坧roxy_buffering off锛屾敮鎸?NDJSON 娴佸紡锛?  鈹斺攢 /ontology-showcase/api/ 鈫?http://127.0.0.1:9022/api/ 锛堝吋瀹圭浉瀵硅矾寰勮皟鐢級
                 鈻?        systemd: openan-ontology-api
        /opt/node22/bin/node server/index.js锛圓PI_PORT=9022锛孉PI_HOST=127.0.0.1锛?```

鍏抽敭璁捐锛?
- **鍗曠鍙?+ URL 璺緞鍖哄垎**锛?010 涓€涓鍙ｅ悓鏃舵湇鍔′袱涓?Demo锛?- **鍓嶇绾潤鎬?*锛歚observation-demo` 浣跨敤 `vite-plugin-singlefile`锛堝崟 HTML锛夛紝`ontology-showcase`
  鏋勫缓鏃舵寚瀹?`--base=/ontology-showcase/`锛屼袱鑰呴兘鏃犻渶 Node 杩愯鏃讹紱
- **鍚庣浠呭唴缃?*锛欰PI 鍙洃鍚?`127.0.0.1`锛岀敱 nginx 鍙嶄唬 `/api/`锛?- **寮€鏈鸿嚜鎰?*锛歴ystemd 鏈嶅姟 `Restart=always`锛宯ginx/systemd 鍧囦负绯荤粺鏈嶅姟锛岄噸鍚嚜鍔ㄦ仮澶嶃€?
## 4. 閮ㄧ讲姝ラ锛堜粠闆跺鐜帮級

### 姝ラ 0锛氬畨鍏ㄧ粍鏀捐 9010

鎺у埗鍙版坊鍔犲叆鏂瑰悜瑙勫垯锛歍CP 9010锛屾簮 `0.0.0.0/0`銆?
### 姝ラ 1锛氭湇鍔″櫒鍒濆鍖?
```bash
ssh root@203.0.113.10

# 1.1 鍏嬮殕浠撳簱锛堟繁搴?1 鍗冲彲锛?mkdir -p /opt/openan-demo && cd /opt/openan-demo
git clone --depth 1 https://github.com/project-openan/openan-demo.git

# 1.2 瀹夎鐙珛 Node 22锛堣В鍘嬪嵆鐢紝涓嶆敼绯荤粺鐜锛?curl -fsSL -o /tmp/node22.tar.xz https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz
mkdir -p /opt/node22 && tar -xJf /tmp/node22.tar.xz -C /opt/node22 --strip-components=1
/opt/node22/bin/node -v   # v22.14.0
```

### 姝ラ 2锛氭湰鍦版瀯寤哄墠绔紙鎺ㄨ崘鍦?Windows 鏈湴鎵ц锛?
> 鈿狅笍 鏈嶅姟鍣ㄥ叕缃戝甫瀹芥湁闄愶紙瀹炴祴 npm ci 瓒呰繃 20 鍒嗛挓鏃犳硶瀹屾垚锛夛紝鍔″繀鏈湴鏋勫缓鍚庡彧涓婁紶浜х墿銆?> `--ignore-scripts` 鐢ㄤ簬璺宠繃 electron/puppeteer 绛変簩杩涘埗涓嬭浇锛堟祻瑙堝櫒鐗堢敤涓嶅埌锛夈€?
```powershell
# observation-demo
cd observation-demo
npm ci --ignore-scripts --no-audit --no-fund
npx vite build                      # 浜х墿 dist/锛坕ndex.html + public 璧勬簮锛?
# ontology-showcase
cd ..\ontology-showcase
npm ci --ignore-scripts --no-audit --no-fund
npx vite build --base=/ontology-showcase/   # base 蹇呴』涓庣嚎涓婅闂矾寰勪竴鑷?```

### 姝ラ 3锛氭墦鍖呬笂浼?
```powershell
# 鐢?tar 鎵撳寘锛圵indows 鑷甫 bsdtar锛?tar -czf obs-dist.tar.gz  -C ..\observation-demo\dist .
tar -czf onto-dist.tar.gz -C ..\ontology-showcase\dist .
scp obs-dist.tar.gz onto-dist.tar.gz root@203.0.113.10:/tmp/
```

> 鈿狅笍 **涓嶈鐢?PowerShell 鐨?`Compress-Archive`**锛氬叾 zip 鏉＄洰浣跨敤鍙嶆枩鏉犲垎闅旇矾寰勶紝
> Linux 瑙ｅ帇鍚?`assets\xxx` 浼氬彉鎴愬甫 `\` 鐨勫钩闈㈡枃浠跺悕锛屽鑷撮〉闈㈣祫婧?404銆佺櫧灞忋€?
```bash
# 鏈嶅姟鍣ㄤ笂瑙ｅ帇
rm -rf /opt/openan-demo/openan-demo/observation-demo/dist
mkdir -p /opt/openan-demo/openan-demo/observation-demo/dist
tar -xzf /tmp/obs-dist.tar.gz -C /opt/openan-demo/openan-demo/observation-demo/dist

rm -rf /opt/openan-demo/openan-demo/ontology-showcase/dist
mkdir -p /opt/openan-demo/openan-demo/ontology-showcase/dist
tar -xzf /tmp/onto-dist.tar.gz -C /opt/openan-demo/openan-demo/ontology-showcase/dist
```

### 姝ラ 4锛氬悗绔?API锛坰ystemd 甯搁┗锛?
鍚庣 `server/index.js` 浠呬緷璧?Node 鍐呯疆妯″潡锛屾棤闇€ npm install銆?瀵规簮鐮佸仛涓€澶勬渶灏忔敼鍔ㄤ互鏀寔缁戝畾鍦板潃鐜鍙橀噺锛?
```js
// ontology-showcase/server/index.js
// 鍘?  server.listen(port, '0.0.0.0', () => {
server.listen(port, process.env.API_HOST || '0.0.0.0', () => {
```

鍒涘缓 `/etc/systemd/system/openan-ontology-api.service`锛?
```ini
[Unit]
Description=OpenAN Ontology Showcase API (node)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/openan-demo/openan-demo/ontology-showcase
ExecStart=/opt/node22/bin/node server/index.js
Environment=API_PORT=9022
Environment=API_HOST=127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now openan-ontology-api
curl http://127.0.0.1:9022/api/health   # {"ok":true,"service":"ontology-application-api"}
```

### 姝ラ 5锛歯ginx 绔欑偣閰嶇疆

鍒涘缓 `/etc/nginx/sites-available/openan-demos.conf`锛?
```nginx
server {
    listen 9010;
    listen [::]:9010;
    server_name _;
    absolute_redirect off;

    access_log /var/log/nginx/openan-demos.access.log;
    error_log  /var/log/nginx/openan-demos.error.log;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml text/plain;
    gzip_min_length 1024;

    # 瀵艰埅椤?    location = / {
        root /var/www/openan-demos;
        try_files /index.html =404;
    }

    # observation-demo 鏍圭粷瀵硅矾寰勮祫婧愶紙浠ｇ爜涓互 /icons /assets /design 缁濆璺緞寮曠敤锛?    location /icons/ {
        alias /opt/openan-demo/openan-demo/observation-demo/dist/icons/;
    }
    location /assets/ {
        alias /opt/openan-demo/openan-demo/observation-demo/dist/assets/;
    }
    location /design/ {
        alias /opt/openan-demo/openan-demo/observation-demo/dist/design/;
    }
    location = /favicon.ico { return 204; }

    location / { return 404; }

    location = /observation-demo  { return 301 /observation-demo/; }
    location = /ontology-showcase { return 301 /ontology-showcase/; }

    # observation-demo锛堥潤鎬侊級
    location /observation-demo/ {
        alias /opt/openan-demo/openan-demo/observation-demo/dist/;
        try_files $uri $uri/ /observation-demo/index.html;
    }

    # ontology-showcase锛堥潤鎬侊級
    location /ontology-showcase/ {
        alias /opt/openan-demo/openan-demo/ontology-showcase/dist/;
        try_files $uri $uri/ /ontology-showcase/index.html;
    }

    # 鍚庣 API锛歂DJSON 娴佸紡鎺ュ彛蹇呴』鍏抽棴缂撳啿
    location /api/ {
        proxy_pass http://127.0.0.1:9022;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    # 鍏煎鐩稿璺緞 api 璋冪敤
    location /ontology-showcase/api/ {
        proxy_pass http://127.0.0.1:9022/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 600s;
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/openan-demos.conf /etc/nginx/sites-enabled/openan-demos.conf
nginx -t && systemctl reload nginx
```

### 姝ラ 6锛氬鑸〉

鍐欏叆 `/var/www/openan-demos/index.html`锛堟繁鑹插弻鍗＄墖锛屽垎鍒摼鎺ヤ袱涓?Demo锛屾牱寮忎换鎰忋€佸唴瀹硅嚜瀹氾級銆?
### 姝ラ 7锛氶獙璇佹竻鍗?
```bash
# 鏈嶅姟鍣ㄥ唴
for u in "/" "/observation-demo/" "/ontology-showcase/"; do
  curl -s -o /dev/null -w "%{http_code}  $u\n" http://127.0.0.1:9010$u
done
curl http://127.0.0.1:9010/api/health
```

```bash
# 澶栫綉锛堜换涓€鏈哄櫒锛?curl http://203.0.113.10:9010/observation-demo/                      # 200
curl http://203.0.113.10:9010/ontology-showcase/assets/index-*.js    # 200锛堣祫婧愯兘鍔犺浇锛?curl -N -X POST http://203.0.113.10:9010/api/runs \
     -H "Content-Type: application/json" -d '{"input":"鍐掔儫娴嬭瘯"}'      # NDJSON 浜嬩欢娴?```

娴忚鍣ㄩ€愰」纭锛氬鑸〉涓ゅ崱鐗囧彲璺宠浆锛涗袱涓?Demo 鍙墦寮€銆佹棤鐧藉睆锛?Ontology Showcase 杈撳叆浠诲姟鍚庤兘瀹炴椂鐪嬪埌鎵ц浜嬩欢娴併€?
## 5. 杩愮淮鎵嬪唽

| 鎿嶄綔 | 鍛戒护 |
|---|---|
| 鍚庣鐘舵€?/ 閲嶅惎 | `systemctl status openan-ontology-api` 锝?`systemctl restart openan-ontology-api` |
| 鍚庣鏃ュ織 | `journalctl -u openan-ontology-api -f` |
| nginx 閰嶇疆鏍￠獙 / 閲嶈浇 | `nginx -t && systemctl reload nginx` |
| 璁块棶鏃ュ織 | `tail -f /var/log/nginx/openan-demos.access.log` |
| 鍋ュ悍妫€鏌?| `curl http://127.0.0.1:9010/api/health` |
| 鏇存柊鍓嶇浜х墿 | 鏈湴鏋勫缓 鈫?tar 鎵撳寘 鈫?scp 涓婁紶 鈫?鏈嶅姟鍣ㄨВ鍘嬭鐩?`dist/`锛堟棤闇€閲嶅惎浠讳綍鏈嶅姟锛?|
| 鏇存柊鍚庣浠ｇ爜 | 瑕嗙洊 `server/*.js` 鈫?`systemctl restart openan-ontology-api` |

## 6. 鏁呴殰鎺掓煡

| 鐜拌薄 | 鍘熷洜涓庡鐞?|
|---|---|
| 澶栫綉 502 浣嗘湇鍔″櫒鏈満姝ｅ父 | 璇锋眰瀹為檯琚湰鍦?鍏徃浠ｇ悊鎷︽埅锛堝畨鍏ㄧ粍鏈斁琛屾椂浠ｇ悊浼氬洖 502锛夈€傜敤 `curl --noproxy "*"` 鎴栬８ TCP锛坄Test-NetConnection`锛夐獙璇侊紝骞跺埌闃块噷浜戞帶鍒跺彴纭瀹夊叏缁勮鍒?|
| 椤甸潰鐧藉睆銆丣S/CSS 404 | 鎵撳寘鐢ㄤ簡 `Compress-Archive`锛堝弽鏂滄潬璺緞鍧戯級锛屾敼鐢?tar 閲嶆柊鎵撳寘涓婁紶 |
| 鏈嶅姟鍣ㄤ笂 npm 鏋佹參/SSH 瓒呮椂 | 鏈嶅姟鍣ㄥ叕缃戝甫瀹藉皬琚?npm 鍗犳弧锛涙敼鐢ㄦ湰鍦版瀯寤轰笂浼犱骇鐗╃殑娴佺▼ |
| 澶栫綉璁块棶 000/瓒呮椂 | 瀹夊叏缁勬湭鏀捐 9010锛涘彟澶栭樋閲屼簯 ECS 鍐呴儴鏃犳硶鍥炵幆璁块棶鑷繁鐨勫叕缃?IP锛堝睘姝ｅ父鐜拌薄锛屼笉鑳戒綔涓哄垽鎹級 |
| API 娴佸紡鍝嶅簲涓€娆℃€у悙鍑?| nginx 鏈叧闂紦鍐诧紝纭 `proxy_buffering off;` 鐢熸晥 |
| Demo 璧勬簮 404 浣?index.html 200 | `ontology-showcase` 鏋勫缓鏃舵湭鍔?`--base=/ontology-showcase/`锛屼骇鐗╃粷瀵硅矾寰勬寚鍚戞牴璺緞鎵€鑷?|
| observation-demo 鍥炬爣/绮剧伒鍥惧ぇ閲?404 | 鍏舵簮鐮佷互鏍圭粷瀵硅矾寰勶紙`/icons/...`銆乣/assets/...`銆乣/design/...`锛夊紩鐢?`public/` 璧勬簮锛涢渶鍦?nginx 涓负杩欎笁涓洰褰曟坊鍔犳槧灏勫埌 `observation-demo/dist/` 瀵瑰簲瀛愮洰褰曪紙瑙佹楠?5 閰嶇疆锛夛紝涓婃父鍙敼杩涗负浣跨敤 `import.meta.env.BASE_URL` |

## 7. 鏈嶅姟鍣ㄨ矾寰勯€熸煡

| 鍐呭 | 璺緞 |
|---|---|
| 浠ｇ爜浠撳簱 | `/opt/openan-demo/openan-demo` |
| observation-demo 浜х墿 | `/opt/openan-demo/openan-demo/observation-demo/dist/` |
| ontology-showcase 浜х墿 | `/opt/openan-demo/openan-demo/ontology-showcase/dist/` |
| 鍚庣婧愮爜 | `/opt/openan-demo/openan-demo/ontology-showcase/server/` |
| nginx 绔欑偣閰嶇疆 | `/etc/nginx/sites-available/openan-demos.conf` |
| 瀵艰埅椤?| `/var/www/openan-demos/index.html` |
| systemd 鏈嶅姟 | `/etc/systemd/system/openan-ontology-api.service` |
| 鐙珛 Node 22 | `/opt/node22/` |
