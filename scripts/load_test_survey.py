#!/usr/bin/env python3
"""Load test cho luong lam bai khao sat cong khai (khong can dang nhap).

Mo phong N sinh vien cung mo link khao sat, bam "Bat dau lam bai" roi nop
phieu, chay dong thoi bang asyncio + aiohttp. Moi "sinh vien" duoc gan mot
X-Forwarded-For rieng vi backend gioi han rate theo IP nguon
(PublicSurveySubmission: 10/phut/IP, PublicSurveyStart: 30/phut/IP - xem
Program.cs). Neu khong gia lap IP rieng, ca N request se dung chung 1 IP that
cua may chay test va bi 429 gan nhu ngay lap tuc, khong phan anh dung suc chiu
tai thuc te (moi sinh vien ngoai doi co IP rieng).

Cai dat:
    pip install aiohttp

Vi du:
    python scripts/load_test_survey.py --url http://localhost:8080 \
        --link-token abc123 --users 500 --ramp-up 10
"""
from __future__ import annotations

import argparse
import asyncio
import random
import statistics
import time
from dataclasses import dataclass, field

import aiohttp


@dataclass
class StepResult:
    ok: bool
    status: int
    elapsed_ms: float
    error: str = ""


@dataclass
class UserResult:
    user_id: int
    get_survey: StepResult | None = None
    start: StepResult | None = None
    submit: StepResult | None = None

    @property
    def succeeded(self) -> bool:
        return bool(
            self.get_survey and self.get_survey.ok
            and self.start and self.start.ok
            and self.submit and self.submit.ok
        )


def fake_ip(user_id: int) -> str:
    # Chia deu qua nhieu /24 gia de khong ca dan tap trung vao 1 subnet.
    return f"10.{(user_id // 65536) % 256}.{(user_id // 256) % 256}.{user_id % 256}"


def build_answer_value(scale: dict) -> str:
    if scale["scaleKind"] == "Text":
        return random.choice([
            "Mon hoc hay, giang vien nhiet tinh.",
            "Can them bai tap thuc hanh.",
            "Khong co gop y them.",
        ])
    options = scale["options"]
    return str(random.choice(options)["value"])


async def run_virtual_user(
    session: aiohttp.ClientSession,
    base_url: str,
    link_token: str,
    user_id: int,
    timeout: aiohttp.ClientTimeout,
) -> UserResult:
    result = UserResult(user_id=user_id)
    headers = {"X-Forwarded-For": fake_ip(user_id)}

    # 1) Mo link khao sat
    t0 = time.perf_counter()
    try:
        async with session.get(
            f"{base_url}/api/public/surveys/{link_token}",
            headers=headers,
            timeout=timeout,
        ) as resp:
            elapsed = (time.perf_counter() - t0) * 1000
            if resp.status != 200:
                result.get_survey = StepResult(False, resp.status, elapsed, await resp.text())
                return result
            survey = await resp.json()
            result.get_survey = StepResult(True, resp.status, elapsed)
    except Exception as exc:  # noqa: BLE001
        result.get_survey = StepResult(False, 0, (time.perf_counter() - t0) * 1000, str(exc))
        return result

    if not survey.get("isOpen", False):
        result.start = StepResult(False, 409, 0, "Link khong con mo (isOpen=false)")
        return result

    # 2) Bam "Bat dau lam bai"
    t0 = time.perf_counter()
    try:
        async with session.post(
            f"{base_url}/api/public/surveys/{link_token}/start",
            headers=headers,
            timeout=timeout,
        ) as resp:
            elapsed = (time.perf_counter() - t0) * 1000
            if resp.status != 200:
                result.start = StepResult(False, resp.status, elapsed, await resp.text())
                return result
            start_ticket = (await resp.json())["startTicket"]
            result.start = StepResult(True, resp.status, elapsed)
    except Exception as exc:  # noqa: BLE001
        result.start = StepResult(False, 0, (time.perf_counter() - t0) * 1000, str(exc))
        return result

    # 3) Tra loi cau hoi theo dung thang diem cua tung cau
    scales_by_id = {s["answerScaleId"]: s for s in survey["answerScales"]}
    answers = [
        {
            "questionId": q["questionId"],
            "answerValue": build_answer_value(scales_by_id[q["answerScaleId"]]),
        }
        for q in survey["questions"]
    ]
    body = {
        "answers": answers,
        "additionalComments": None,
        "startTicket": start_ticket,
    }

    # 4) Nop phieu
    t0 = time.perf_counter()
    try:
        async with session.post(
            f"{base_url}/api/public/surveys/{link_token}/responses",
            json=body,
            headers=headers,
            timeout=timeout,
        ) as resp:
            elapsed = (time.perf_counter() - t0) * 1000
            ok = resp.status == 200
            result.submit = StepResult(ok, resp.status, elapsed, "" if ok else await resp.text())
    except Exception as exc:  # noqa: BLE001
        result.submit = StepResult(False, 0, (time.perf_counter() - t0) * 1000, str(exc))

    return result


async def run_load_test(
    base_url: str,
    link_token: str,
    num_users: int,
    ramp_up_seconds: float,
    request_timeout_seconds: float,
) -> list[UserResult]:
    timeout = aiohttp.ClientTimeout(total=request_timeout_seconds)
    connector = aiohttp.TCPConnector(limit=0)  # khong gioi han tu phia client

    async def scheduled(user_id: int, delay: float, session: aiohttp.ClientSession) -> UserResult:
        if delay > 0:
            await asyncio.sleep(delay)
        return await run_virtual_user(session, base_url, link_token, user_id, timeout)

    async with aiohttp.ClientSession(connector=connector) as session:
        delay_step = ramp_up_seconds / num_users if ramp_up_seconds > 0 and num_users > 1 else 0
        tasks = [
            asyncio.create_task(scheduled(i, i * delay_step, session))
            for i in range(num_users)
        ]
        return await asyncio.gather(*tasks)


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(len(ordered) * pct))
    return ordered[idx]


def print_step_stats(name: str, steps: list[StepResult]) -> None:
    if not steps:
        print(f"  {name}: khong co du lieu")
        return
    latencies = [s.elapsed_ms for s in steps if s.ok]
    ok_count = sum(1 for s in steps if s.ok)
    fail_count = len(steps) - ok_count
    print(f"  {name}: {ok_count} thanh cong / {fail_count} that bai (tong {len(steps)})")
    if latencies:
        print(
            f"    latency ms - min {min(latencies):.0f}"
            f" p50 {percentile(latencies, 0.50):.0f}"
            f" p90 {percentile(latencies, 0.90):.0f}"
            f" p99 {percentile(latencies, 0.99):.0f}"
            f" max {max(latencies):.0f}"
            f" mean {statistics.mean(latencies):.0f}"
        )
    if fail_count:
        sample_errors = {}
        for s in steps:
            if not s.ok:
                key = f"HTTP {s.status}" if s.status else "loi ket noi"
                sample_errors.setdefault(key, 0)
                sample_errors[key] += 1
        print(f"    loi: {sample_errors}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://localhost:8080", help="Base URL cua frontend/API (mac dinh http://localhost:8080)")
    parser.add_argument("--link-token", required=True, help="linkToken cua dot khao sat dang mo, dung de test")
    parser.add_argument("--users", type=int, default=100, help="So luong sinh vien gia lap chay dong thoi (mac dinh 100)")
    parser.add_argument("--ramp-up", type=float, default=0.0, help="So giay rai deu thoi diem bat dau cua N nguoi dung (0 = tat ca bat dau cung luc, mac dinh 0)")
    parser.add_argument("--timeout", type=float, default=30.0, help="Timeout moi request, giay (mac dinh 30)")
    args = parser.parse_args()

    print(f"Bat dau load test: {args.users} nguoi dung, ramp-up {args.ramp_up}s, target {args.url}")
    started = time.perf_counter()
    results = asyncio.run(
        run_load_test(args.url, args.link_token, args.users, args.ramp_up, args.timeout)
    )
    total_wall_seconds = time.perf_counter() - started

    succeeded = sum(1 for r in results if r.succeeded)
    print()
    print(f"Tong ket: {succeeded}/{len(results)} nguoi dung hoan tat ca 3 buoc thanh cong")
    print(f"Thoi gian chay: {total_wall_seconds:.1f}s ({len(results) / total_wall_seconds:.1f} nguoi dung/giay quy doi)")
    print()
    print_step_stats("GET /surveys/{token}", [r.get_survey for r in results if r.get_survey])
    print_step_stats("POST /start", [r.start for r in results if r.start])
    print_step_stats("POST /responses", [r.submit for r in results if r.submit])


if __name__ == "__main__":
    main()
