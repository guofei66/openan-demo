import argparse
import json
import re
import sys
from pathlib import Path

SYSTEM_PROMPT = (
    "你是电信联调打桩数据生成器。给定一条种子 JSON（真实业务样本）和模板 URI，"
    "生成 N 条结构完全相同、仅替换标识性取值（单号、ID、名称、时间、数值、优先级等）的变体。"
    "变体必须保持与种子完全一致的字段名和嵌套结构，取值必须符合电信业务语义。"
    "只输出一个 JSON 数组，不要输出任何解释或 Markdown 代码块之外的内容。"
)


def build_messages(seed: dict, template_uri: str, count: int) -> list:
    user_prompt = (
        f"模板 URI: {template_uri}\n"
        f"生成变体条数: {count}\n"
        f"种子 JSON:\n{json.dumps(seed, ensure_ascii=False, indent=2)}\n"
        "请输出包含恰好 "
        f"{count} 条变体的 JSON 数组。"
    )
    return [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}]


def parse_variants(content: str) -> list:
    text = content.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    data = json.loads(text)
    if not isinstance(data, list) or not data:
        raise ValueError("LLM output is not a non-empty JSON array")
    if not all(isinstance(item, dict) for item in data):
        raise ValueError("LLM output contains non-object variants")
    return data


def run_generation(client, model: str, seed: dict, template_uri: str, count: int, out_path: Path) -> dict:
    response = client.chat.completions.create(
        model=model, messages=build_messages(seed, template_uri, count), temperature=0.8
    )
    choices = getattr(response, "choices", None)
    message = choices[0].message if choices else response.message
    variants = parse_variants(message.content)
    result = {"templateUri": template_uri, "seedCount": 1, "variants": variants}
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="OpenAN-Debug stub variant generator (local LLM)")
    parser.add_argument("--seed", required=True, help="seed JSON file path")
    parser.add_argument("--template-uri", required=True)
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", default="variants.json")
    args = parser.parse_args()
    from openai import OpenAI

    seed = json.loads(Path(args.seed).read_text(encoding="utf-8"))
    if not isinstance(seed, dict):
        print("seed file must contain a JSON object", file=sys.stderr)
        return 2
    client = OpenAI(base_url=args.base_url, api_key=args.api_key)
    result = run_generation(client, args.model, seed, args.template_uri, args.count, Path(args.out))
    print(f"generated {len(result['variants'])} variants -> {args.out}")
    print("next: import via OpenAN-Debug seeds page or POST /api/v1/variants/import")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
