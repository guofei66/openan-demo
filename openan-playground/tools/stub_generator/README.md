# 本地打桩数据泛化工具

在本地（有 LLM 访问权限的环境）把一条种子样本泛化为 N 条变体，再通过 OpenAN-Debug 页面导入。

## 用法

python cli.py --seed seed.json --template-uri "Notification-T/network-layer/subscribe-incident/v1" --count 5 --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 --api-key sk-xxx --model qwen-plus --out variants.json

## 输入

`seed.json`：一条真实业务样本 JSON（对象）。

## 输出

`variants.json`：
{"templateUri": "...", "seedCount": 1, "variants": [{...}, ...]}

## 导入

OpenAN-Debug 登录 → 种子数据管理 → 选择种子 → 导入变体文件（选择 variants.json）。
