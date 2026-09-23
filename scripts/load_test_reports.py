#!/usr/bin/env python3
"""Load test cho cac endpoint BAO CAO (can dang nhap), dung de do p95/p99 cua API.

Khac voi `load_test_survey.py`: script do luong nop phieu cong khai (khong can dang
nhap, moi luot nop chiem mot suat cua lop nen bi chan boi ClassSize), script nay do
cac endpoint bao cao — dung doi tuong ma tieu chi chap nhan o muc 0.5 cua ke hoach
noi toi ("worker chay nen khong lam p95 cua API bao cao tang qua 10%"). Endpoint bao
cao chi DOC: chay bao nhieu lan cung duoc, khong ghi gi vao co so du lieu.

Dang nhap bang `/api/auth/dev/login`, chi ton tai khi API chay o moi truong
Development. Script tu chon phan quyen dau tien neu tai khoan yeu cau chon ho so.

Cai dat:
    pip install aiohttp

Vi du — do p95 cua man y kien mo o 32 ket noi dong thoi trong 30 giay:
    python scripts/load_test_reports.py --url http://localhost:5115 \
        --email admin@vmu.edu.vn --concurrency 32 --duration 30

Vi du — so sanh truoc/sau bang tep JSON:
    python scripts/load_test_reports.py --url http://localhost:5115 \
        --email admin@vmu.edu.vn --concurrency 32 --duration 30 --json-out baseline.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import time
from dataclasses import dataclass
from pathlib import Path

import aiohttp

DEFAULT_PATH = "/api/v1/reports/open-comments"


@dataclass
class Sample:
    ok: bool
    status: int
    elapsed_ms: float
    error: str = ""


async def sign_in(session: aiohttp.ClientSession, base_url: str, email: str) -> str:
    """Dang nhap bang duong dev va tra ve mo ta phan quyen dang dung."""
    async with session.get(f"{base_url}/api/auth/dev/login", params={"email": email}) as resp:
        payload = await resp.json()
        if resp.status != 200:
            raise SystemExit(f"Dang nhap that bai: HTTP {resp.status} {payload}")

    if payload.get("profileSelectionRequired"):
        csrf = (await (await session.get(f"{base_url}/api/auth/csrf")).json())["token"]
        profiles = (await (await session.get(f"{base_url}/api/auth/pending-profiles")).json())[
            "availableProfiles"
        ]
        if not profiles:
            raise SystemExit("Tai khoan khong co phan quyen nao de chon.")

        chosen = profiles[0]
        async with session.post(
            f"{base_url}/api/auth/select-profile",
            json={"profileId": chosen["id"]},
            headers={"X-CSRF-TOKEN": csrf},
        ) as resp:
            if resp.status != 200:
                raise SystemExit(f"Chon phan quyen that bai: HTTP {resp.status} {await resp.text()}")

        return f"{chosen.get('name')} ({chosen.get('roleCode')})"

    return "phien mac dinh"


async def hammer(
    session: aiohttp.ClientSession,
    url: str,
    deadline: float,
    samples: list[Sample],
) -> None:
    while time.perf_counter() < deadline:
        started = time.perf_counter()
        try:
            async with session.get(url) as resp:
                body = await resp.read()
                elapsed = (time.perf_counter() - started) * 1000
                ok = resp.status == 200
                samples.append(
                    Sample(ok, resp.status, elapsed, "" if ok else f"{len(body)} byte: {body[:120]!r}")
                )
        except Exception as exc:  # noqa: BLE001
            samples.append(Sample(False, 0, (time.perf_counter() - started) * 1000, str(exc)))


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * pct))]


def summarise(samples: list[Sample], wall_seconds: float) -> dict:
    ok = [s for s in samples if s.ok]
    latencies = [s.elapsed_ms for s in ok]
    errors: dict[str, int] = {}
    for sample in samples:
        if not sample.ok:
            key = f"HTTP {sample.status}" if sample.status else "loi ket noi"
            errors[key] = errors.get(key, 0) + 1

    summary: dict = {
        "requests": len(samples),
        "ok": len(ok),
        "failed": len(samples) - len(ok),
        "wall_seconds": round(wall_seconds, 2),
        "requests_per_second": round(len(samples) / wall_seconds, 1) if wall_seconds else 0.0,
        "latency_ms": None,
    }
    if latencies:
        summary["latency_ms"] = {
            "min": round(min(latencies), 1),
            "p50": round(percentile(latencies, 0.50), 1),
            "p90": round(percentile(latencies, 0.90), 1),
            "p95": round(percentile(latencies, 0.95), 1),
            "p99": round(percentile(latencies, 0.99), 1),
            "max": round(max(latencies), 1),
            "mean": round(statistics.mean(latencies), 1),
        }
    if errors:
        summary["errors"] = errors

    return summary


def print_summary(label: str, summary: dict) -> None:
    print(f"  {label}: {summary['ok']} thanh cong / {summary['failed']} that bai"
          f" (tong {summary['requests']}, {summary['requests_per_second']} req/s)")
    latency = summary["latency_ms"]
    if latency:
        print(
            f"    latency ms - min {latency['min']:.0f}"
            f" p50 {latency['p50']:.0f}"
            f" p90 {latency['p90']:.0f}"
            f" p95 {latency['p95']:.0f}"
            f" p99 {latency['p99']:.0f}"
            f" max {latency['max']:.0f}"
            f" mean {latency['mean']:.0f}"
        )
    if "errors" in summary:
        print(f"    loi: {summary['errors']}")


async def run(
    base_url: str,
    email: str,
    paths: list[str],
    concurrency: int,
    duration: float,
    timeout_seconds: float,
) -> dict:
    timeout = aiohttp.ClientTimeout(total=timeout_seconds)
    connector = aiohttp.TCPConnector(limit=0)

    results: dict[str, list[Sample]] = {path: [] for path in paths}

    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        profile = await sign_in(session, base_url, email)
        print(f"Da dang nhap bang: {profile}")

        started = time.perf_counter()
        deadline = started + duration
        tasks = [
            asyncio.create_task(
                hammer(session, f"{base_url}{paths[index % len(paths)]}", deadline, results[paths[index % len(paths)]])
            )
            for index in range(concurrency)
        ]
        await asyncio.gather(*tasks)
        wall = time.perf_counter() - started

    return {
        "url": base_url,
        "email": email,
        "concurrency": concurrency,
        "duration_seconds": duration,
        "wall_seconds": round(wall, 2),
        "steps": {path: summarise(samples, wall) for path, samples in results.items()},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://localhost:5115", help="Base URL cua API (mac dinh http://localhost:5115)")
    parser.add_argument("--email", required=True, help="Email tai khoan quan tri de dang nhap bang duong dev")
    parser.add_argument("--path", default=DEFAULT_PATH, help=f"Duong dan bao cao, nhieu duong ngan cach bang dau phay (mac dinh {DEFAULT_PATH})")
    parser.add_argument("--concurrency", type=int, default=32, help="So ket noi dong thoi (mac dinh 32)")
    parser.add_argument("--duration", type=float, default=30.0, help="Thoi gian do, giay (mac dinh 30)")
    parser.add_argument("--timeout", type=float, default=60.0, help="Timeout moi request, giay (mac dinh 60)")
    parser.add_argument("--json-out", help="Ghi ket qua ra tep JSON de so sanh truoc/sau bang so lieu")
    args = parser.parse_args()

    paths = [p.strip() for p in args.path.split(",") if p.strip()]
    print(
        f"Bat dau do: {args.concurrency} ket noi dong thoi trong {args.duration:.0f}s, "
        f"{len(paths)} duong dan, target {args.url}"
    )

    payload = asyncio.run(
        run(args.url, args.email, paths, args.concurrency, args.duration, args.timeout)
    )

    print()
    for path, summary in payload["steps"].items():
        print_summary(path, summary)

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nDa ghi ket qua vao: {args.json_out}")


if __name__ == "__main__":
    main()
