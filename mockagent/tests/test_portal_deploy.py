# -*- coding: utf-8 -*-
"""场景 Portal 一键部署测试：网关（静态+反代）/ 配置加载 / 卡片生成 / server.conf 改写。

不真实拉起 registry/orch（外部仓库依赖），组件级单测 + 真实网关反代（临时上游）。
"""
import json
import socket
import sys
import threading
from pathlib import Path

import pytest
import uvicorn
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

import deploy_scenario_portal as dsp  # noqa: E402
from mockagent_engine.portal_gateway import create_app  # noqa: E402


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture()
def upstream():
    """临时上游服务（验证网关真实反代）。"""
    app = FastAPI()

    @app.get("/api/orchestrate/ping")
    def ping():
        return {"pong": True, "query": "none"}

    @app.get("/rest/v1/orchestrate/ping")
    def ping_rest():
        return {"pong": True, "channel": "rest"}

    @app.post("/api/orchestrate/echo")
    async def echo(request: Request):
        return {"echo": await request.json()}

    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    import time

    for _ in range(50):
        try:
            import httpx

            httpx.get(f"http://127.0.0.1:{port}/api/orchestrate/ping", timeout=1)
            break
        except Exception:
            time.sleep(0.2)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=5)


@pytest.fixture()
def gateway_client(tmp_path, upstream):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>portal</html>", encoding="utf-8")
    (dist / "assets").mkdir()
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    routes = [
        {"prefix": "/api/orchestrate/", "upstream": upstream},
        {"prefix": "/rest/v1/orchestrate/", "upstream": upstream},
    ]
    return TestClient(create_app(dist, routes))


def test_gateway_serves_static_and_spa_fallback(gateway_client):
    assert gateway_client.get("/").status_code == 200
    assert "portal" in gateway_client.get("/").text
    assert gateway_client.get("/assets/app.js").status_code == 200
    # 未命中静态文件的前端路由回 index.html
    assert "portal" in gateway_client.get("/console/some/route").text


def test_gateway_healthz_lists_routes(gateway_client):
    body = gateway_client.get("/healthz").json()
    assert body["status"] == "ok"
    assert body["routes"] == ["/api/orchestrate/", "/rest/v1/orchestrate/"]


def test_gateway_proxies_to_upstream(gateway_client, upstream):
    resp = gateway_client.get("/api/orchestrate/ping")
    assert resp.status_code == 200
    assert resp.json()["pong"] is True
    # 透明转发：/rest/v1/orchestrate/ 前缀同样原样转发到上游同名路径
    resp = gateway_client.get("/rest/v1/orchestrate/ping")
    assert resp.status_code == 200
    assert resp.json()["channel"] == "rest"


def test_gateway_proxy_post_body_passthrough(gateway_client):
    resp = gateway_client.post("/api/orchestrate/echo", json={"intent": "保障直播"})
    assert resp.status_code == 200
    assert resp.json()["echo"]["intent"] == "保障直播"


def test_gateway_502_when_upstream_down(tmp_path):
    dist = tmp_path / "d2"
    dist.mkdir()
    (dist / "index.html").write_text("<html>x</html>", encoding="utf-8")
    client = TestClient(create_app(dist, [{"prefix": "/api/orchestrate/", "upstream": "http://127.0.0.1:1"}]))
    resp = client.get("/api/orchestrate/anything")
    assert resp.status_code == 502
    assert "unreachable" in resp.json()["detail"]


def test_gateway_requires_valid_dist(tmp_path):
    with pytest.raises(RuntimeError):
        create_app(tmp_path / "empty", [])


# ---- 部署脚本单元 ----

def test_load_config_merges_defaults_and_resolves_paths():
    config = dsp.load_config(PROJECT_ROOT / "deploy" / "scenarios-portal.json")
    entry = next(s for s in config["scenarios"] if s["scenarioId"] == "live-assurance-demo")
    assert entry["registryPort"] == 9100 and entry["orchPort"] == 9101 and entry["portalPort"] == 9103
    assert Path(entry["portalDist"]).is_absolute()
    assert (Path(entry["orchestrationCenterRepo"]) / "orchestrate" / "start.py").is_file()
    if not (Path(entry["registryCenterRepo"]) / "agent_registry").is_dir():
        pytest.skip(f"registry-center 仓库不在本机：{entry['registryCenterRepo']}")
    assert (Path(entry["registryCenterRepo"]) / "agent_registry").is_dir()
    # 网关路由模板完整（orch + registry）
    targets = {r["target"] for r in entry["gateway"]["routes"]}
    assert targets == {"orch", "registry"}


def test_build_agent_cards_schema():
    from mockagent_engine import agent_registry

    cards = dsp.build_agent_cards(agent_registry.load_define())
    assert len(cards) == 26  # 6 个 SPN 打桩实例 + 20 个 AN L4 打桩实例
    by_name = {c["name"]: c for c in cards}
    card = by_name["无线域打桩 Agent"]
    assert card["supportedInterfaces"][0]["url"].endswith(":9008/")
    assert card["supportedInterfaces"][0]["protocolBinding"] == "HTTP+JSON"
    assert card["capabilities"] == {"streaming": False}
    assert "templateUri" not in json.dumps(card)
    # AN L4 车队卡片同样生成（正式 PSOP 参与方）
    ran = by_name["RAN Agent"]
    assert ran["supportedInterfaces"][0]["url"].endswith(":9115/")


def test_write_agent_cards(tmp_path):
    target = dsp.write_agent_cards(tmp_path, [{"name": "a"}])
    assert target.name == "agents.json"
    assert json.loads(target.read_text(encoding="utf-8"))["agents"] == [{"name": "a"}]


def test_rewrite_server_conf(tmp_path):
    conf = tmp_path / "server.conf"
    conf.write_text(
        "# 注释保留\nip=0.0.0.0\n# 旧端口\nport=5001\nenable_https=true\nagent_registry_url=https://127.0.0.1:5000\n其它=keep\n",
        encoding="utf-8",
    )
    dsp.rewrite_server_conf(conf, {"ip": "127.0.0.1", "port": "9101", "enable_https": "false",
                                   "agent_registry_url": "http://127.0.0.1:9100"})
    text = conf.read_text(encoding="utf-8")
    assert "ip=127.0.0.1" in text
    assert "port=9101" in text
    assert "enable_https=false" in text
    assert "agent_registry_url=http://127.0.0.1:9100" in text
    assert "其它=keep" in text and "# 注释保留" in text
    # 大小写键（registry 用 IP/PORT）按精确键名替换
    conf2 = tmp_path / "registry.conf"
    conf2.write_text("IP=127.0.0.1\nPORT=5000\nenable_https=true\n", encoding="utf-8")
    dsp.rewrite_server_conf(conf2, {"PORT": "9100", "enable_https": "false", "signature_validation_enabled": "false"})
    text2 = conf2.read_text(encoding="utf-8")
    assert "PORT=9100" in text2 and "enable_https=false" in text2
    assert "signature_validation_enabled=false" in text2, "无该键时应追加"


def test_copy_repo_subset_excludes_noise(tmp_path):
    repo = tmp_path / "repo"
    (repo / ".git").mkdir(parents=True)
    (repo / "__pycache__").mkdir()
    (repo / "docs").mkdir()
    (repo / "pkg").mkdir()
    (repo / "pkg" / "mod.py").write_text("x = 1", encoding="utf-8")
    target = dsp.copy_repo_subset(repo, tmp_path / "copy")
    assert (target / "pkg" / "mod.py").is_file()
    assert not (target / ".git").exists()
    assert not (target / "__pycache__").exists()
    assert not (target / "docs").exists()


def test_cli_status_on_undeployed(tmp_path, capsys):
    """--status 在临时 runtimeRoot 下（不读真实部署状态）应报 not-deployed。"""
    config = json.loads((PROJECT_ROOT / "deploy" / "scenarios-portal.json").read_text(encoding="utf-8"))
    config["defaults"]["runtimeRoot"] = str(tmp_path / "rt")
    cfg = tmp_path / "scenarios-portal.json"
    cfg.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    sys.argv = ["deploy_scenario_portal.py", "--config", str(cfg), "--status", "--scenario", "live-assurance-demo"]
    dsp.main()
    out = capsys.readouterr().out
    assert "not-deployed" in out
