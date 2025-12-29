#!/usr/bin/env python3
"""
SIB Intelligence & Efficiency Monitor
Real-time tracking of SIB's IQ, performance, and growth
"""

import json
import time
import requests
import statistics
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

class SIBMonitor:
    """Monitor SIB performance metrics and track growth"""
    
    def __init__(self, sib_url: str = "http://localhost:8001"):
        self.sib_url = sib_url
        self.history = []
        self.metrics_file = Path("/tmp/sib_metrics.json")
        self.load_history()
    
    def load_history(self):
        """Load previous metrics from disk"""
        if self.metrics_file.exists():
            try:
                with open(self.metrics_file, 'r') as f:
                    self.history = json.load(f)
            except:
                self.history = []
    
    def save_history(self):
        """Save metrics to disk"""
        with open(self.metrics_file, 'w') as f:
            json.dump(self.history, f, indent=2)
    
    def measure_latency(self, task_type: str, payload: Dict) -> Dict[str, float]:
        """Measure response latency for a task"""
        try:
            start = time.time()
            response = requests.post(
                f"{self.sib_url}/task",
                json={
                    "task_type": task_type,
                    "payload": payload,
                    "user_id": "monitor",
                    "patient_id": "test"
                },
                timeout=30
            )
            latency = (time.time() - start) * 1000  # milliseconds
            
            return {
                "success": response.status_code == 200,
                "latency_ms": latency,
                "status_code": response.status_code
            }
        except Exception as e:
            return {
                "success": False,
                "latency_ms": 0,
                "error": str(e)
            }
    
    def test_basic_tasks(self) -> Dict[str, Any]:
        """Test basic SIB capabilities and measure performance"""
        results = {}
        
        # Test 1: CHAT
        print("Testing CHAT...", end="", flush=True)
        results["chat"] = self.measure_latency(
            "CHAT",
            {"message": "Hello doctor, I have a headache"}
        )
        print(" ✓")
        
        # Test 2: MEDICAL_CONSULT
        print("Testing MEDICAL_CONSULT...", end="", flush=True)
        results["medical_consult"] = self.measure_latency(
            "MEDICAL_CONSULT",
            {"symptoms": ["fever", "cough"]}
        )
        print(" ✓")
        
        # Test 3: ASSESS_RISK
        print("Testing ASSESS_RISK...", end="", flush=True)
        results["assess_risk"] = self.measure_latency(
            "ASSESS_RISK",
            {"vitals": {"bp": "120/80", "hr": 72, "temp": 37}}
        )
        print(" ✓")
        
        # Test 4: DETECT_EMERGENCY
        print("Testing DETECT_EMERGENCY...", end="", flush=True)
        results["detect_emergency"] = self.measure_latency(
            "DETECT_EMERGENCY",
            {"symptoms": ["chest pain"], "vitals": {"bp": "180/110", "hr": 120}}
        )
        print(" ✓")
        
        # Test 5: SEND_NOTIFICATION
        print("Testing SEND_NOTIFICATION...", end="", flush=True)
        results["send_notification"] = self.measure_latency(
            "SEND_NOTIFICATION",
            {"type": "test", "title": "Test", "message": "Test"}
        )
        print(" ✓")
        
        return results
    
    def calculate_metrics(self, task_results: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate aggregate metrics from task results"""
        latencies = [r["latency_ms"] for r in task_results.values() if r.get("latency_ms")]
        successful = sum(1 for r in task_results.values() if r.get("success"))
        total = len(task_results)
        
        return {
            "timestamp": datetime.now().isoformat(),
            "total_tasks_tested": total,
            "successful_tasks": successful,
            "success_rate": (successful / total * 100) if total > 0 else 0,
            "avg_latency_ms": statistics.mean(latencies) if latencies else 0,
            "min_latency_ms": min(latencies) if latencies else 0,
            "max_latency_ms": max(latencies) if latencies else 0,
            "p50_latency_ms": statistics.median(latencies) if latencies else 0,
            "p95_latency_ms": sorted(latencies)[int(len(latencies)*0.95)] if len(latencies) > 0 else 0,
            "task_breakdown": task_results
        }
    
    def calculate_sib_iq(self, metrics: Dict[str, Any]) -> float:
        """Calculate SIB IQ score (0-100)"""
        
        # Speed score (0-30 points)
        avg_latency = metrics.get("avg_latency_ms", 1200)
        speed_score = max(0, (3000 - avg_latency) / 3000) * 30
        
        # Success rate score (0-40 points)
        success_rate = metrics.get("success_rate", 100)
        success_score = (success_rate / 100) * 40
        
        # Task variety score (0-20 points)
        task_variety = min(metrics.get("total_tasks_tested", 5) / 8, 1.0) * 20
        
        # Response consistency (0-10 points)
        if metrics.get("task_breakdown"):
            successful = sum(1 for r in metrics["task_breakdown"].values() if r.get("success"))
            consistency_score = (successful / len(metrics["task_breakdown"])) * 10
        else:
            consistency_score = 0
        
        iq = speed_score + success_score + task_variety + consistency_score
        return round(iq, 2)
    
    def track_growth(self) -> Dict[str, Any]:
        """Calculate growth metrics from historical data"""
        if len(self.history) < 2:
            return {}
        
        latest = self.history[-1]
        previous = self.history[-2]
        
        latest_iq = latest.get("sib_iq", 0)
        previous_iq = previous.get("sib_iq", 0)
        iq_change = latest_iq - previous_iq
        
        latest_success = latest.get("success_rate", 0)
        previous_success = previous.get("success_rate", 0)
        success_change = latest_success - previous_success
        
        return {
            "iq_change": round(iq_change, 2),
            "iq_change_percent": round((iq_change / previous_iq * 100) if previous_iq > 0 else 0, 2),
            "success_rate_change": round(success_change, 2),
            "latency_improvement_ms": round(
                previous.get("avg_latency_ms", 0) - latest.get("avg_latency_ms", 0), 2
            ),
            "total_measurements": len(self.history)
        }
    
    def generate_report(self) -> str:
        """Generate a comprehensive performance report"""
        print("\n" + "="*70)
        print("SIB INTELLIGENCE & EFFICIENCY REPORT".center(70))
        print("="*70)
        print()
        
        # Run tests
        print("Running performance tests...")
        task_results = self.test_basic_tasks()
        print()
        
        # Calculate metrics
        metrics = self.calculate_metrics(task_results)
        sib_iq = self.calculate_sib_iq(metrics)
        metrics["sib_iq"] = sib_iq
        
        # Save to history
        self.history.append(metrics)
        self.save_history()
        
        # Display results
        print("CORE METRICS:")
        print(f"  SIB IQ Score:           {sib_iq}/100")
        print(f"  Success Rate:           {metrics['success_rate']:.1f}%")
        print(f"  Avg Latency:            {metrics['avg_latency_ms']:.0f}ms")
        print(f"  Min Latency:            {metrics['min_latency_ms']:.0f}ms")
        print(f"  Max Latency:            {metrics['max_latency_ms']:.0f}ms")
        print(f"  P50 Latency:            {metrics['p50_latency_ms']:.0f}ms")
        print(f"  P95 Latency:            {metrics['p95_latency_ms']:.0f}ms")
        print()
        
        # Task breakdown
        print("TASK PERFORMANCE:")
        for task, result in metrics.get("task_breakdown", {}).items():
            status = "✓" if result.get("success") else "✗"
            latency = result.get("latency_ms", 0)
            print(f"  {status} {task.upper():25} {latency:7.0f}ms")
        print()
        
        # Growth metrics
        growth = self.track_growth()
        if growth:
            print("GROWTH INDICATORS (vs previous run):")
            print(f"  IQ Change:              +{growth['iq_change']:+.2f} ({growth['iq_change_percent']:+.1f}%)")
            print(f"  Success Rate Change:    {growth['success_rate_change']:+.1f}%")
            print(f"  Latency Improvement:    {growth['latency_improvement_ms']:+.0f}ms")
            print(f"  Total Measurements:     {growth['total_measurements']}")
        print()
        
        # Status
        print("PERFORMANCE STATUS:")
        if sib_iq >= 85:
            status_emoji = "🚀"
            status_text = "EXCELLENT"
        elif sib_iq >= 75:
            status_emoji = "✅"
            status_text = "GOOD"
        elif sib_iq >= 60:
            status_emoji = "⚠️"
            status_text = "FAIR"
        else:
            status_emoji = "❌"
            status_text = "NEEDS IMPROVEMENT"
        
        print(f"  {status_emoji} Status: {status_text}")
        print(f"  Target IQ: 95/100")
        print(f"  Distance to Target: {95 - sib_iq:.1f} points")
        print()
        
        print("="*70)
        
        return json.dumps(metrics, indent=2)


def main():
    """Run the monitoring script"""
    monitor = SIBMonitor()
    monitor.generate_report()


if __name__ == "__main__":
    main()
