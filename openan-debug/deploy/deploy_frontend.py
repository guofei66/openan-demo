# -*- coding: utf-8 -*-
"""仅发布前端 dist 到部署服务器（不动后端/systemd/nginx）。

用法：python deploy/deploy_frontend.py   （密码取环境变量 DEPLOY_PASSWORD，否则交互输入）
等价于 deploy.py 中 frontend 部分：tar dist → sftp 上传 → 远端解压到 /OpenA2A-T/openan-debug-frontend。
"""
import getpass
import os
import tarfile
import tempfile
from pathlib import Path

import paramiko

HOST = "47.236.98.226"
USER = "root"
PROJECT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = PROJECT / "frontend" / "dist"
REMOTE_BASE = "/OpenA2A-T/openan-debug"
# 前端挂载点：与 openan-master 共用 nginx 9002 端口，路径 /openan-playground/
REMOTE_FRONTEND = "/OpenA2A-T/openan-playground-frontend"
PUBLIC_URL = "http://47.236.98.226:9002/openan-playground/"


def run(ssh, command, check=True):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=300)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(f"$ {command}\n{out}{err}")
    if check and code != 0:
        raise SystemExit(f"command failed ({code}): {command}")
    return code, out


def main():
    if not FRONTEND_DIST.exists():
        raise SystemExit("frontend/dist missing; run `npm run build` in frontend/ first")
    password = os.environ.get("DEPLOY_PASSWORD") or getpass.getpass(f"password for {USER}@{HOST}: ")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, 22, USER, password, allow_agent=False, look_for_keys=False)
    run(ssh, f"mkdir -p {REMOTE_FRONTEND}")

    transport = paramiko.Transport((HOST, 22))
    transport.connect(username=USER, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    with tempfile.TemporaryDirectory() as tmp:
        frontend_tar = Path(tmp) / "frontend.tgz"
        with tarfile.open(frontend_tar, "w:gz") as tar:
            for item in sorted(FRONTEND_DIST.rglob("*")):
                tar.add(item, arcname=item.relative_to(FRONTEND_DIST))
        remote_tar = f"{REMOTE_BASE}/frontend.tgz"
        print(f"upload {frontend_tar} -> {remote_tar}")
        sftp.put(str(frontend_tar), remote_tar)
    sftp.close()
    transport.close()

    # 原子替换：解压到新目录后 rename，避免半更新状态
    run(ssh, f"rm -rf {REMOTE_FRONTEND}.new && mkdir -p {REMOTE_FRONTEND}.new")
    run(ssh, f"cd {REMOTE_FRONTEND}.new && tar xzf {REMOTE_BASE}/frontend.tgz")
    run(ssh, f"rm -rf {REMOTE_FRONTEND}.old && mv {REMOTE_FRONTEND} {REMOTE_FRONTEND}.old && mv {REMOTE_FRONTEND}.new {REMOTE_FRONTEND}")
    run(ssh, f"rm -rf {REMOTE_FRONTEND}.old")
    run(ssh, "systemctl reload nginx || systemctl reload nginx --quiet || true", check=False)
    run(ssh, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9002/openan-playground/")
    ssh.close()
    print(f"frontend deploy done: {PUBLIC_URL} （浏览器强刷 Ctrl+F5）")


if __name__ == "__main__":
    main()
