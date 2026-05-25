#!/usr/bin/env python3
"""
Router Benchmark: Qwen 0.6B vs Qwen 2.5 3B

Compares routing intent/backends and latency for representative healthcare prompts.
Usage:
  python3 scripts/router_benchmark.py
"""

from __future__ import annotations

import json
import os
import statistics
import time
from dataclasses import asdict
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "tinyllama"

FAST_MODEL = MODEL_DIR / "qwen-0.6b-medicaldataset-f16.gguf"
ACCURACY_MODEL = MODEL_DIR / "qwen2.5-3b-instruct-q4_k_m.gguf"

# Representative prompt set for medical + insurance + mixed-intent traffic.
CASES = [
    {
        "id": "greeting",
        "query": "Hi doctor",
        "expected_intent": "greeting",
        "expected_backend": "local",
    },
    {
        "id": "symptom_basic",
        "query": "I have fever and cough since yesterday",
        "expected_intent": "symptom_check",
        "expected_backend": "isha",
    },
    {
        "id": "medication",
        "query": "Can I take paracetamol with my BP medicine?",
        "expected_intent": "medication_info",
        "expected_backend": "isha",
    },
    {
        "id": "insurance_claim",
        "query": "How do I file my mediclaim insurance claim for this hospitalization?",
        "expected_intent": "medical_query",
        "expected_backend": "isha",
    },
    {
        "id": "report_and_appointment",
        "query": "Please analyze my blood report and also book an appointment for tomorrow",
        "expected_intent": "medical_query",
        "expected_backend": "isha",
    },
    {
        "id": "emergency",
        "query": "My father has severe chest pain and difficulty breathing",
        "expected_intent": "emergency",
        "expected_backend": "groq",
    },
]


def safe_import_router():
    import sys
    sib_dir = str(ROOT / "sib")
    if sib_dir not in sys.path:
        sys.path.insert(0, sib_dir)

    from tinyllama_router import TinyLlamaRouter  # pylint: disable=import-error
    from route_safety_validator import validate_routing  # pylint: disable=import-error
    return TinyLlamaRouter, validate_routing


def evaluate_model(name: str, model_path: Path):
    TinyLlamaRouter, validate_routing = safe_import_router()

    if not model_path.exists():
        return {
            "model": name,
            "model_path": str(model_path),
            "available": False,
            "error": "model file missing",
            "cases": [],
        }

    router = TinyLlamaRouter(model_path=str(model_path))

    rows = []
    latencies = []
    intent_hits = 0
    backend_hits = 0

    for case in CASES:
        start = time.time()
        decision = router.classify(case["query"], language="en", context=None, use_rag=False)
        after_route_ms = (time.time() - start) * 1000

        safety = validate_routing(
            query=case["query"],
            intent=decision.intent,
            backend=decision.backend,
            confidence=decision.confidence,
        )

        final_intent = safety.intent
        final_backend = safety.backend

        intent_ok = final_intent == case["expected_intent"]
        backend_ok = final_backend == case["expected_backend"]

        if intent_ok:
            intent_hits += 1
        if backend_ok:
            backend_hits += 1

        latencies.append(after_route_ms)

        row = {
            "id": case["id"],
            "query": case["query"],
            "predicted_intent": decision.intent,
            "predicted_backend": decision.backend,
            "final_intent": final_intent,
            "final_backend": final_backend,
            "confidence": round(float(decision.confidence), 4),
            "latency_ms": round(after_route_ms, 2),
            "safety_reason": safety.reason,
            "expected_intent": case["expected_intent"],
            "expected_backend": case["expected_backend"],
            "intent_ok": intent_ok,
            "backend_ok": backend_ok,
        }
        rows.append(row)

    return {
        "model": name,
        "model_path": str(model_path),
        "available": True,
        "summary": {
            "cases": len(CASES),
            "intent_accuracy": round(intent_hits / len(CASES), 4),
            "backend_accuracy": round(backend_hits / len(CASES), 4),
            "latency_avg_ms": round(statistics.mean(latencies), 2),
            "latency_p95_ms": round(sorted(latencies)[max(int(len(latencies) * 0.95) - 1, 0)], 2),
            "latency_max_ms": round(max(latencies), 2),
        },
        "cases": rows,
    }


def main():
    results = {
        "timestamp": int(time.time()),
        "benchmark": "router_profile_compare",
        "models": [
            evaluate_model("qwen-0.6b-fast", FAST_MODEL),
            evaluate_model("qwen2.5-3b-accuracy", ACCURACY_MODEL),
        ],
    }

    out_dir = ROOT / "logs" / "perf" / "router-benchmark"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"router-benchmark-{int(time.time())}.json"
    out_file.write_text(json.dumps(results, indent=2), encoding="utf-8")

    print("Router benchmark completed")
    print(f"Output: {out_file}")

    for model in results["models"]:
        if not model.get("available"):
            print(f"- {model['model']}: unavailable ({model.get('error')})")
            continue
        s = model["summary"]
        print(
            f"- {model['model']}: "
            f"intent_acc={s['intent_accuracy']:.2%}, "
            f"backend_acc={s['backend_accuracy']:.2%}, "
            f"avg={s['latency_avg_ms']}ms, p95={s['latency_p95_ms']}ms"
        )


if __name__ == "__main__":
    main()
