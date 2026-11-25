# -*- coding: utf-8 -*-
"""MockAgent → 注册中心 心跳上报。

按注册中心心跳应答中的 interval 周期（默认 30s，附加 ±10% 随机抖动避免
同步风暴）为每个已挂载实例的卡片上报存活：

    POST {registry}/rest/v1/registry-center/agent-cards/{org}/{name}/heartbeat

身份链路（本部署 owner.isolation.enabled=true 时必需）：
    注册中心 owner.identity.mode=trusted_proxy 且 owner.trusted.proxy.ips
    含 127.0.0.1 —— 本机直连主口时携带 ``X-SSL-Client-DN: CN=<owner>`` 即为
    可验证身份；该 CN 必须与卡片在注册中心绑定的 owner 一致（mock 卡片
    统一绑定 mock-monitor），否则 401/403。nginx 侧必须剥离外部请求携带的
    同名伪造头（openan-portal.conf / openan-master 已配置 proxy_set_header ... ""）。

对齐注册中心语义：
    - 上报周期以服务端应答 ``interval`` 为准（动态纠正），并附加 ±10% 抖动；
    - 卡片未注册（404）/身份不符（401/403）按告警降频记录，不中断其他卡片；
    - 注册中心重启后心跳状态清零，本模块按周期自动重新上报补齐。
"""
from __future__ import annotations

import json
import random
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from .agent_registry import agents_dir

API_PATH = "/rest/v1/registry-center/agent-cards"
CARD_FILENAME = "agent_card.json"
IDENTITY_HEADER = "X-SSL-Client-DN"


def collect_cards(prefix: str, agents_root: Path | None = None) -> list[tuple[str, str]]:
    """读取 agents/*/agent_card.json，返回 [(name, organization)]。

    仅保留名称以 prefix 开头的卡片（与注册工具 register_mockagents.py 的
    注册范围一致），路径顺序稳定，便于日志对账。
    """
    root = agents_root or agents_dir()
    cards: list[tuple[str, str]] = []
    for path in sorted(root.glob(f"*/{CARD_FILENAME}")):
        try:
            card = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            print(f"[heartbeat] 跳过无效卡片文件 {path}: {exc}", flush=True)
            continue
        name = str(card.get("name") or "")
        if not name.startswith(prefix):
            continue
        org = str((card.get("provider") or {}).get("organization") or "")
        cards.append((name, org))
    return cards


class HeartbeatReporter:
    """后台线程：周期性为卡片列表上报心跳，直到 stop()。"""

    def __init__(self, cards: list[tuple[str, str]], registry_url: str,
                 owner_cn: str, interval: float = 30.0):
        self.cards = cards
        self.registry_url = registry_url.rstrip("/")
        self.owner_cn = owner_cn
        self.interval = max(1.0, float(interval))
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_state: dict[str, str] = {}

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._loop, name="mockagent-heartbeat",
                                        daemon=True)
        self._thread.start()
        print(f"[heartbeat] 启动：{len(self.cards)} 张卡 -> {self.registry_url}"
              f"（owner={self.owner_cn}, interval≈{self.interval:.0f}s）", flush=True)

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    def _log(self, key: str, level: str, message: str) -> None:
        """状态变化才打印，避免周期日志刷屏。"""
        if self._last_state.get(key) != (level, message):
            self._last_state[key] = (level, message)
            print(f"[heartbeat] {message}", flush=True)

    def _report_one(self, name: str, organization: str) -> None:
        quoted = urllib.parse.quote(name, safe="")
        quoted_org = urllib.parse.quote(organization, safe="")
        url = f"{self.registry_url}{API_PATH}/{quoted_org}/{quoted}/heartbeat"
        req = urllib.request.Request(
            url, data=b"", method="POST",
            headers={"Content-Type": "application/json", IDENTITY_HEADER: f"CN={self.owner_cn}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", "replace")[:200]
            except Exception:
                pass
            self._log(name, "warn",
                      f"{name}({organization}) -> HTTP {exc.code} {detail}")
            return
        except Exception as exc:
            self._log(name, "warn", f"{name}({organization}) -> 上报失败: {exc}")
            return
        server_interval = body.get("interval")
        if isinstance(server_interval, (int, float)) and server_interval >= 1:
            self.interval = float(server_interval)
        self._log(name, "ok",
                  f"{name}({organization}) -> OK status={body.get('health_status')}")

    def _loop(self) -> None:
        # 首轮先上报（注册中心重启后尽快恢复监测），再进入抖动周期循环。
        while not self._stop.is_set():
            for name, organization in self.cards:
                if self._stop.is_set():
                    break
                self._report_one(name, organization)
            jitter = random.uniform(0.9, 1.1)
            self._stop.wait(max(1.0, self.interval * jitter))
