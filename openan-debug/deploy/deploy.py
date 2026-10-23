import getpass
import glob
import os
import shutil
import tarfile
import tempfile
from pathlib import Path

import paramiko

HOST = "47.236.98.226"
USER = "root"
PROJECT = Path(__file__).resolve().parent.parent
SERVER_DIR = PROJECT / "server"
FRONTEND_DIST = PROJECT / "frontend" / "dist"
SDK_DIR = PROJECT.parent / "a2a-t-sdk-python"
WFE_SDK_DIR = PROJECT.parent / "workflow-engine-sdk-python"
REMOTE_BASE = "/OpenA2A-T/openan-debug"
REMOTE_FRONTEND = "/OpenA2A-T/openan-playground-frontend"
BACKEND_PORT = 9100
PREFERRED_PORT = 9004
FALLBACK_PORTS = (9005, 9006, 9007)
PYPI_MIRROR = "https://mirrors.aliyun.com/pypi/simple/"


def make_tar(source_dir: Path, exclusions, out_path: Path):
    with tarfile.open(out_path, "w:gz") as tar:
        for item in sorted(source_dir.rglob("*")):
            rel = item.relative_to(source_dir)
            if any(part in exclusions for part in rel.parts):
                continue
            tar.add(item, arcname=str(rel))


def run(ssh, command, check=True):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=900)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(f"$ {command}\n{out}{err}")
    if check and code != 0:
        raise SystemExit(f"command failed ({code}): {command}")
    return code, out


def ensure_remote_dir(sftp, remote_dir):
    parts = [p for p in remote_dir.split("/") if p]
    current = ""
    for part in parts:
        current += "/" + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def pick_public_port(ssh) -> int:
    for port in (PREFERRED_PORT,) + FALLBACK_PORTS:
        code, _ = run(ssh, f"ss -tlnp | grep -q ':{port} '", check=False)
        if code != 0:
            if port != PREFERRED_PORT:
                print(f"port {PREFERRED_PORT} busy, using fallback port {port}")
            return port
    raise SystemExit(f"no free port among {(PREFERRED_PORT,) + FALLBACK_PORTS}; cannot install nginx block")


def nginx_setup(ssh) -> int:
    run(ssh, "which nginx || (apt-get install -y nginx || yum install -y nginx)", check=False)
    run(ssh, "systemctl enable --now nginx", check=False)

    conf = "/etc/nginx/conf.d/openan-debug.conf"
    run(ssh, f"python3 {REMOTE_BASE}/deploy/remote_nginx_restore.py")
    run(ssh, f"rm -f {conf}")
    run(ssh, "systemctl reload nginx && sleep 1")

    port = pick_public_port(ssh)
    run(ssh, f"cp {REMOTE_BASE}/deploy/nginx-server.conf {conf}")
    if port != PREFERRED_PORT:
        run(ssh, f"sed -i 's/listen {PREFERRED_PORT};/listen {port};/' {conf}")
    run(ssh, "nginx -t")
    run(ssh, "systemctl reload nginx")
    return port


def nginx_setup_legacy_insert(ssh):
    """Legacy port-80 insertion decision tree, kept for future reuse; not used by default."""
    marker = run(ssh, "grep -rl 'openan-debug begin' /etc/nginx/ 2>/dev/null | head -1", check=False)[1].strip()
    if marker:
        print("openan-debug locations already present in nginx, skip setup (idempotent re-deploy)")
        return

    website_ref = run(ssh, "grep -rl 'OpenA2A-T/website' /etc/nginx/ 2>/dev/null | head -1", check=False)[1].strip()
    if website_ref:
        print("existing OpenA2A-T website detected, inserting locations into its server block")
        run(ssh, f"python3 {REMOTE_BASE}/deploy/remote_nginx_insert.py")
        return

    listen80 = run(
        ssh,
        "grep -rE '^[[:space:]]*listen[[:space:]]+80([[:space:];]|$)' "
        "/etc/nginx/conf.d/ /etc/nginx/sites-enabled/ 2>/dev/null | head -1",
        check=False,
    )[1].strip()
    if not listen80:
        include_ok = run(
            ssh,
            "grep -qE 'include[[:space:]].*/etc/nginx/conf.d/[^;]*\\.conf;' /etc/nginx/nginx.conf && echo yes || echo no",
            check=False,
        )[1].strip()
        if include_ok != "yes":
            raise SystemExit("/etc/nginx/nginx.conf does not include /etc/nginx/conf.d/*.conf; refusing to continue")
        print("fresh nginx detected, installing standalone server block")
        run(
            ssh,
            "test -f /etc/nginx/conf.d/default.conf && "
            "grep -qE 'listen[^;]*80' /etc/nginx/conf.d/default.conf && "
            "mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.bak-openan-debug || true",
            check=False,
        )
        run(ssh, f"cp {REMOTE_BASE}/deploy/nginx-server.conf /etc/nginx/conf.d/openan-debug.conf")
        return

    print("port 80 already owned by an existing site, inserting /debug/ locations into that block")
    run(ssh, f"python3 {REMOTE_BASE}/deploy/remote_nginx_insert80.py")


def main():
    password = os.environ.get("DEPLOY_PASSWORD") or getpass.getpass(f"password for {USER}@{HOST}: ")
    wheels_dir = PROJECT / "deploy" / "wheels"
    shutil.rmtree(wheels_dir, ignore_errors=True)
    wheels_dir.mkdir(parents=True, exist_ok=True)
    print("building a2a-t-sdk wheel ...")
    os.system(f'uv build --wheel --out-dir "{wheels_dir}" "{SDK_DIR}"')
    wheel_files = glob.glob(str(wheels_dir / "a2a_t_sdk-*.whl"))
    if not wheel_files:
        raise SystemExit("a2a_t wheel build failed; cannot continue")
    print("building workflow-engine-sdk wheel ...")
    os.system(f'uv build --wheel --out-dir "{wheels_dir}" "{WFE_SDK_DIR}"')
    wheel_files += glob.glob(str(wheels_dir / "workflow_exec_engine-*.whl"))
    if not FRONTEND_DIST.exists():
        raise SystemExit("frontend/dist missing; run `npm run build` in frontend/ first")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, 22, USER, password, allow_agent=False, look_for_keys=False)
    run(ssh, f"mkdir -p {REMOTE_BASE}/wheels {REMOTE_BASE}/deploy {REMOTE_BASE}/server {REMOTE_FRONTEND}")

    transport = paramiko.Transport((HOST, 22))
    transport.connect(username=USER, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    with tempfile.TemporaryDirectory() as tmp:
        server_tar = Path(tmp) / "server.tgz"
        frontend_tar = Path(tmp) / "frontend.tgz"
        config_tar = Path(tmp) / "config.tgz"
        config_dir = PROJECT / "config"
        make_tar(SERVER_DIR, {".venv", "__pycache__", "data", ".pytest_cache"}, server_tar)
        make_tar(FRONTEND_DIST, set(), frontend_tar)
        if config_dir.exists():
            make_tar(config_dir, set(), config_tar)
        uploads = [
            (server_tar, f"{REMOTE_BASE}/server.tgz"),
            (frontend_tar, f"{REMOTE_BASE}/frontend.tgz"),
            *([(config_tar, f"{REMOTE_BASE}/config.tgz")] if config_dir.exists() else []),
            *[(wheel, f"{REMOTE_BASE}/wheels/{Path(wheel).name}") for wheel in wheel_files],
            (PROJECT / "deploy" / "openan-debug.service", "/etc/systemd/system/openan-debug.service"),
            (PROJECT / "deploy" / "server.env.template", f"{REMOTE_BASE}/deploy/server.env.template"),
            (PROJECT / "deploy" / "nginx-locations.conf", f"{REMOTE_BASE}/deploy/nginx-locations.conf"),
            (PROJECT / "deploy" / "nginx-server.conf", f"{REMOTE_BASE}/deploy/nginx-server.conf"),
            (PROJECT / "deploy" / "remote_nginx_restore.py", f"{REMOTE_BASE}/deploy/remote_nginx_restore.py"),
            (PROJECT / "deploy" / "remote_nginx_insert.py", f"{REMOTE_BASE}/deploy/remote_nginx_insert.py"),
            (PROJECT / "deploy" / "remote_nginx_insert80.py", f"{REMOTE_BASE}/deploy/remote_nginx_insert80.py"),
        ]
        for local, remote in uploads:
            ensure_remote_dir(sftp, os.path.dirname(remote))
            print(f"upload {local} -> {remote}")
            sftp.put(str(local), remote)
    sftp.close()
    transport.close()

    run(ssh, f"cd {REMOTE_BASE} && tar xzf server.tgz -C server")
    run(ssh, f"cd {REMOTE_BASE} && tar xzf frontend.tgz -C {REMOTE_FRONTEND}")
    run(ssh, f"mkdir -p {REMOTE_BASE}/config && tar xzf {REMOTE_BASE}/config.tgz -C {REMOTE_BASE}/config")
    run(ssh, "test -f ~/.local/bin/uv || (curl -LsSf https://astral.sh/uv/install.sh | sh)", check=False)
    run(ssh, f"cd {REMOTE_BASE}/server && ~/.local/bin/uv venv .venv --python 3.12", check=False)
    install_cmd = (
        f"cd {REMOTE_BASE}/server && ~/.local/bin/uv pip install --python .venv/bin/python "
        f"-r requirements.txt {REMOTE_BASE}/wheels/a2a_t_sdk-*.whl {REMOTE_BASE}/wheels/workflow_exec_engine-*.whl"
    )
    code, _ = run(ssh, install_cmd, check=False)
    if code != 0:
        print("default PyPI install failed, retrying with aliyun mirror ...")
        run(ssh, f"{install_cmd} --index-url {PYPI_MIRROR}")
    port = nginx_setup(ssh)
    code, _ = run(ssh, f"test -f {REMOTE_BASE}/server/.env", check=False)
    if code != 0:
        run(ssh, f"cp {REMOTE_BASE}/deploy/server.env.template {REMOTE_BASE}/server/.env")
        run(ssh, f"sed -i 's|OPENAN_DEBUG_PUBLIC_URL=.*|OPENAN_DEBUG_PUBLIC_URL=http://{HOST}:{port}/debug/a2a|' {REMOTE_BASE}/server/.env")
    run(ssh, "systemctl daemon-reload && systemctl enable openan-debug && systemctl restart openan-debug")
    run(ssh, f"sleep 3 && curl -s --fail -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{BACKEND_PORT}/api/v1/health")
    run(ssh, f"curl -s --fail -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/debug/")
    run(ssh, f"curl -s --fail -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/debug/a2a/.well-known/agent-card.json")
    run(ssh, "journalctl -u openan-debug -n 20 --no-pager | grep -o 'password: .*' || true")
    ssh.close()
    print(f"deploy done: http://{HOST}:{port}/debug/")


if __name__ == "__main__":
    main()
