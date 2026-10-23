"""ODA Canvas 一键部署：前端配置环境信息 → 通过 K8s API Server-Side Apply 部署 ODA Component。

无需服务器安装 kubectl/helm：直接调用 Canvas 集群 API（Bearer Token）。
对象集：Secret / PVC / Deployment / Service / Component(oda.tmforum.org)。
配置持久化在 data/oda_canvas.json（token 只写不回显）。
"""
import json
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user

router = APIRouter(prefix="/api/v1/console/oda", tags=["oda"])


# ---------- 配置 ----------
class OdaConfig(BaseModel):
    apiServer: str = ""
    token: str = ""
    namespace: str = "components"
    insecureTLS: bool = True
    image: str = ""
    publicUrl: str = ""
    jwtSecret: str = ""
    adminPassword: str = ""
    release: str = "openan-mockagent"
    componentId: str = "TMFC900"
    apiVersion: str = "v1beta3"
    storageSize: str = "2Gi"
    datasetSearch: bool = True
    stubFallback: bool = True
    selectedAgents: list[str] = []   # 要部署的打桩实例 id；空 = 全部
    autoStart: bool = False          # 部署后 Pod 内自动启动已选实例（OPENAN_DEBUG_AUTOSTART）


def _config_path() -> Path:
    return Path("data/oda_canvas.json")


def _load_config() -> OdaConfig:
    p = _config_path()
    if p.exists():
        try:
            return OdaConfig(**json.loads(p.read_text(encoding="utf-8")))
        except (OSError, ValueError, TypeError):
            pass
    return OdaConfig()


def _save_config(cfg: OdaConfig) -> None:
    p = _config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(cfg.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")


@router.get("/config")
def get_config(user: dict = Depends(get_current_user)):
    cfg = _load_config()
    data = cfg.model_dump()
    has_token = bool(data.pop("token"))
    return {"config": {**data, "jwtSecret": "***" if data["jwtSecret"] else "", "adminPassword": "***" if data["adminPassword"] else ""}, "hasToken": has_token}


@router.put("/config")
def put_config(payload: OdaConfig, user: dict = Depends(get_current_user)):
    old = _load_config()
    if payload.token in ("", None, "***"):
        payload.token = old.token
    if payload.jwtSecret == "***":
        payload.jwtSecret = old.jwtSecret
    if payload.adminPassword == "***":
        payload.adminPassword = old.adminPassword
    _save_config(payload)
    return {"ok": True}


# ---------- 打桩实例清单（与 mock_agent_define.json 对齐） ----------
def _agents() -> list[dict]:
    from .mock_instances_router import _load_define, resolve_define_path

    define = _load_define(resolve_define_path())
    return [
        {"id": i["id"], "name": str(i["id"]).replace("-stub", ""), "port": int(i.get("port", 9300))}
        for i in define.get("instances", [])
    ]


def _selected_agents(cfg: OdaConfig) -> list[dict]:
    """按配置选择的实例过滤；未选择（空）= 全部。"""
    agents = _agents()
    if not cfg.selectedAgents:
        return agents
    chosen = set(cfg.selectedAgents)
    return [a for a in agents if a["id"] in chosen]


# ---------- K8s 客户端 ----------
def _require(cfg_field: str, cfg: OdaConfig):
    if not getattr(cfg, cfg_field):
        raise HTTPException(status_code=400, detail=f"请先配置 {cfg_field}")


def _client(cfg: OdaConfig) -> httpx.Client:
    _require("apiServer", cfg)
    headers = {"Accept": "application/json"}
    if cfg.token:
        headers["Authorization"] = f"Bearer {cfg.token}"
    return httpx.Client(
        base_url=cfg.apiServer.rstrip("/"),
        headers=headers,
        verify=not cfg.insecureTLS,
        timeout=30,
    )


def _apply(client: httpx.Client, cfg: OdaConfig, group: str, version: str, plural: str, name: str, obj: dict) -> dict:
    if group:
        url = f"/apis/{group}/{version}/namespaces/{cfg.namespace}/{plural}/{name}"
    else:
        url = f"/api/v1/namespaces/{cfg.namespace}/{plural}/{name}"
    r = client.patch(
        url,
        params={"fieldManager": "openan-debug", "force": "true"},
        content=json.dumps(obj, ensure_ascii=False),
        headers={"Content-Type": "application/apply-patch+yaml"},
    )
    ok = r.status_code in (200, 201)
    return {"kind": obj["kind"], "name": name, "ok": ok, "status": r.status_code, "detail": None if ok else r.text[:300]}


def _labels(release: str) -> dict:
    return {
        "app.kubernetes.io/name": "openan-mockagent",
        "app.kubernetes.io/instance": release,
        "app.kubernetes.io/managed-by": "openan-debug",
        "oda.tmforum.org/componentName": release,
    }


# ---------- 清单生成 ----------
def _manifests(cfg: OdaConfig) -> list[dict]:
    agents = _selected_agents(cfg)
    release = cfg.release or "openan-mockagent"
    svc = f"{release}-core"
    labels = _labels(release)
    public_base = (cfg.publicUrl or f"http://{svc}:9000").rstrip("/")
    objs: list[dict] = []

    secret_data = {"jwt-secret": cfg.jwtSecret or "dev-secret-change-me"}
    if cfg.adminPassword:
        secret_data["admin-password"] = cfg.adminPassword
    objs.append({
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": release, "labels": labels},
        "type": "Opaque",
        "stringData": secret_data,
    })

    objs.append({
        "apiVersion": "v1",
        "kind": "PersistentVolumeClaim",
        "metadata": {"name": release, "labels": labels},
        "spec": {"accessModes": ["ReadWriteOnce"], "resources": {"requests": {"storage": cfg.storageSize or "2Gi"}}},
    })

    container_ports = [{"name": "http", "containerPort": 9000}] + [
        {"name": f"agent-{a['name']}", "containerPort": a["port"]} for a in agents
    ]
    env = [
        {"name": "OPENAN_DEBUG_HOST", "value": "0.0.0.0"},
        {"name": "OPENAN_DEBUG_PORT", "value": "9000"},
        {"name": "OPENAN_DEBUG_JWT_SECRET", "valueFrom": {"secretKeyRef": {"name": release, "key": "jwt-secret"}}},
        {"name": "OPENAN_DEBUG_DATASET_SEARCH", "value": "on" if cfg.datasetSearch else "off"},
        {"name": "OPENAN_DEBUG_STUB_FALLBACK", "value": "on" if cfg.stubFallback else "off"},
        {"name": "A2AT_LANGUAGE", "value": "zh-CN"},
        {"name": "OPENAN_DEBUG_PUBLIC_URL", "value": f"{public_base}/debug/a2a"},
        {"name": "OPENAN_DEBUG_AGENT_INTERNAL_URL", "value": "http://localhost:9000/debug/a2a/message:send"},
    ]
    if cfg.adminPassword:
        env.append({"name": "OPENAN_DEBUG_ADMIN_PASSWORD", "valueFrom": {"secretKeyRef": {"name": release, "key": "admin-password"}}})
    if cfg.autoStart:
        env.append({"name": "OPENAN_DEBUG_AUTOSTART", "value": ",".join(a["id"] for a in agents)})
    objs.append({
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": release, "labels": labels},
        "spec": {
            "replicas": 1,
            "selector": {"matchLabels": {"app.kubernetes.io/name": "openan-mockagent", "app.kubernetes.io/instance": release}},
            "template": {
                "metadata": {"labels": labels},
                "spec": {
                    "containers": [{
                        "name": "mockagent",
                        "image": cfg.image,
                        "imagePullPolicy": "IfNotPresent",
                        "ports": container_ports,
                        "env": env,
                        "readinessProbe": {"httpGet": {"path": "/readyz", "port": "http"}, "initialDelaySeconds": 5, "periodSeconds": 10},
                        "livenessProbe": {"httpGet": {"path": "/healthz", "port": "http"}, "initialDelaySeconds": 10, "periodSeconds": 20},
                        "volumeMounts": [{"name": "data", "mountPath": "/app/data"}],
                    }],
                    "volumes": [{"name": "data", "persistentVolumeClaim": {"claimName": release}}],
                },
            },
        },
    })

    service_ports = [{"name": "http", "port": 9000, "targetPort": "http"}] + [
        {"name": f"agent-{a['name']}", "port": a["port"], "targetPort": f"agent-{a['name']}"} for a in agents
    ]
    objs.append({
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": svc, "labels": labels},
        "spec": {"type": "ClusterIP", "selector": {"app.kubernetes.io/name": "openan-mockagent", "app.kubernetes.io/instance": release}, "ports": service_ports},
    })

    exposed = [{
        "name": "mockagent-a2a",
        "specification": [f"{public_base}/openapi.json"],
        "apiType": "openapi",
        "implementation": svc,
        "path": "/debug/a2a",
        "developerUI": f"{public_base}/docs",
        "port": 9000,
    }]
    for a in agents:
        exposed.append({
            "name": f"mockagent-{a['name']}",
            "specification": [f"http://{svc}:{a['port']}/openapi.json"],
            "apiType": "openapi",
            "implementation": svc,
            "path": "/",
            "port": a["port"],
        })
    management = [{
        "name": "mockagent-console",
        "specification": [f"{public_base}/openapi.json"],
        "apiType": "openapi",
        "implementation": svc,
        "path": "/debug",
        "developerUI": f"{public_base}/docs",
        "port": 9000,
    }]
    objs.append({
        "apiVersion": f"oda.tmforum.org/{cfg.apiVersion or 'v1beta3'}",
        "kind": "Component",
        "metadata": {"name": release, "labels": labels},
        "spec": {
            "id": cfg.componentId or "TMFC900",
            "name": "A2A-T MockAgent",
            "version": "1.0.0",
            "description": f"A2A-T 协议 MockAgent：内嵌默认 Agent + {len(agents)} 个打桩实例（{'、'.join(a['name'] for a in agents) or '无'}；数据集检索回包）",
            "functionalBlock": "CoreCommerce",
            "maintainers": [{"name": "OpenAN Debug Team", "email": "openan-debug@example.com"}],
            "coreFunction": {"exposedAPIs": exposed, "dependentAPIs": []},
            "managementFunction": {"exposedAPIs": management, "dependentAPIs": []},
            "securityFunction": {
                "canvasSystemRole": "admin",
                "componentRole": [
                    {"name": "admin", "description": "MockAgent 管理员（控制台/实例管理/变体管理）"},
                    {"name": "user", "description": "联调用户（调测台/数据集查看）"},
                ],
            },
        },
    })
    return objs


# ---------- API ----------
@router.get("/agents")
def list_agents(user: dict = Depends(get_current_user)):
    """可供选择的打桩实例清单（部署选择用）。"""
    from .mock_instances_router import _load_define, resolve_define_path

    define = _load_define(resolve_define_path())
    return {
        "agents": [
            {"id": i["id"], "name": i.get("name") or i["id"], "port": int(i.get("port", 9300)),
             "description": i.get("description", ""), "running": False}
            for i in define.get("instances", [])
        ]
    }


@router.post("/test-connection")
def test_connection(user: dict = Depends(get_current_user)):
    cfg = _load_config()
    with _client(cfg) as client:
        out: dict = {}
        r = client.get("/version")
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"API Server 不可达：HTTP {r.status_code} {r.text[:200]}")
        out["k8sVersion"] = r.json().get("gitVersion")
        r = client.get("/apis/oda.tmforum.org")
        out["componentCrd"] = r.status_code == 200
        out["versions"] = [v.get("version") for v in (r.json().get("versions") or [])] if r.status_code == 200 else []
        r = client.get(f"/api/v1/namespaces/{cfg.namespace}")
        out["namespaceReachable"] = r.status_code == 200
        if r.status_code == 404:
            out["namespaceError"] = f"命名空间 {cfg.namespace} 不存在"
        return out


@router.post("/deploy")
def deploy(user: dict = Depends(get_current_user)):
    cfg = _load_config()
    _require("image", cfg)
    results = []
    with _client(cfg) as client:
        # 确保命名空间存在
        r = client.get(f"/api/v1/namespaces/{cfg.namespace}")
        if r.status_code == 404:
            r = client.post("/api/v1/namespaces", content=json.dumps({"apiVersion": "v1", "kind": "Namespace", "metadata": {"name": cfg.namespace}}), headers={"Content-Type": "application/json"})
            results.append({"kind": "Namespace", "name": cfg.namespace, "ok": r.status_code in (200, 201), "status": r.status_code, "detail": None if r.status_code in (200, 201) else r.text[:200]})
        for obj in _manifests(cfg):
            group = "oda.tmforum.org" if obj["apiVersion"].startswith("oda.tmforum.org/") else ("" if obj["apiVersion"].startswith("v1") else obj["apiVersion"].split("/")[0])
            version = obj["apiVersion"].split("/")[-1]
            results.append(_apply(client, cfg, group, version, _plural(obj["kind"]), obj["metadata"]["name"], obj))
    ok = all(r["ok"] for r in results)
    return {"ok": ok, "results": results}


def _plural(kind: str) -> str:
    return {"Secret": "secrets", "PersistentVolumeClaim": "persistentvolumeclaims", "Deployment": "deployments", "Service": "services", "Component": "components"}[kind]


@router.get("/status")
def status(user: dict = Depends(get_current_user)):
    cfg = _load_config()
    _require("apiServer", cfg)
    release = cfg.release or "openan-mockagent"
    out: dict = {"release": release, "namespace": cfg.namespace}
    with _client(cfg) as client:
        r = client.get(f"/apis/oda.tmforum.org/{cfg.apiVersion or 'v1beta3'}/namespaces/{cfg.namespace}/components/{release}")
        if r.status_code == 200:
            comp = r.json()
            summary = ((comp.get("status") or {}).get("summary") or {}).get("status") or {}
            out["component"] = {
                "deploymentStatus": summary.get("deployment_status") or "unknown",
                "exposedAPIs": len((comp.get("spec") or {}).get("coreFunction", {}).get("exposedAPIs", [])),
            }
        else:
            out["component"] = {"deploymentStatus": f"未部署(HTTP {r.status_code})"}
        out["selectedAgents"] = _selected_agents(cfg)
        r = client.get(f"/api/v1/namespaces/{cfg.namespace}/pods", params={"labelSelector": f"app.kubernetes.io/name=openan-mockagent"})
        pods = []
        if r.status_code == 200:
            for item in r.json().get("items", []):
                cs = (item.get("status", {}).get("containerStatuses") or [{}])[0]
                pods.append({
                    "name": item["metadata"]["name"],
                    "phase": item.get("status", {}).get("phase"),
                    "ready": cs.get("ready"),
                    "restarts": cs.get("restartCount"),
                    "image": (cs.get("image") or ""),
                })
        out["pods"] = pods
        r = client.get(f"/api/v1/namespaces/{cfg.namespace}/services/{release}-core")
        out["service"] = {"name": release + "-core", "exists": r.status_code == 200, "clusterIP": (r.json().get("spec", {}).get("clusterIP") if r.status_code == 200 else None)}
    return out


@router.post("/undeploy")
def undeploy(user: dict = Depends(get_current_user)):
    cfg = _load_config()
    _require("apiServer", cfg)
    release = cfg.release or "openan-mockagent"
    targets = [
        ("oda.tmforum.org", cfg.apiVersion or "v1beta3", "components", release),
        ("apps", "v1", "deployments", release),
        ("", "v1", "services", f"{release}-core"),
        ("", "v1", "secrets", release),
    ]
    results = []
    with _client(cfg) as client:
        for group, version, plural, name in targets:
            url = f"/apis/{group}/{version}/namespaces/{cfg.namespace}/{plural}/{name}" if group else f"/api/v1/namespaces/{cfg.namespace}/{plural}/{name}"
            r = client.delete(url)
            results.append({"kind": plural, "name": name, "ok": r.status_code in (200, 404), "status": r.status_code})
    return {"ok": all(r["ok"] for r in results), "results": results}
