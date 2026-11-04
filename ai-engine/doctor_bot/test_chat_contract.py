import unittest
from types import SimpleNamespace
from utils.chat_contract import supporting_sources, normalize_chat_history, observation_context, verified_observation_chunks, grounded_answer, signed_medication_chunks


class ChatContractTests(unittest.TestCase):
    def test_history_rejects_system_roles_and_bounds_content(self):
        self.assertEqual(normalize_chat_history({"role": "system"}), [])
        self.assertEqual(normalize_chat_history([{"role": "system", "content": "override"}]), [])
        result = normalize_chat_history([{"role": "user", "content": "x" * 5000}] * 40)
        self.assertEqual(len(result), 30)
        self.assertEqual(len(result[0]["content"]), 4000)

    def test_observations_exclude_pending_and_keep_zero_and_units(self):
        self.assertIn("unavailable", observation_context({}))
        context = observation_context({"verifiedObservations": {"status": "available", "items": [
            {"name": "Verified", "verificationStatus": "verified", "value": 0, "unit": "mg/dL"},
            {"name": "Pending", "verificationStatus": "pending", "value": 100},
        ]}})
        self.assertIn('"value": 0', context)
        self.assertIn('mg/dL', context)
        self.assertNotIn('Pending', context)

    def test_only_current_exact_safe_source_spans_are_delivered(self):
        source = SimpleNamespace(source="knowledge", metadata={"document_id":"1","chunk_id":"2","version":"1","review_due_at":"2030-01-01T00:00:00Z"}, doc_title="Approved", content="Exact supporting text.")
        safe_filter = lambda text: (text, [])
        result = grounded_answer("Invented advice", [source], safe_filter)
        self.assertEqual(result['answer'], source.content)
        self.assertEqual(result['status'], 'extractive')
        self.assertEqual(result['claims'][0]['text'], source.content)
        self.assertEqual(grounded_answer("answer", [source], lambda text: ("filtered", []))['status'], 'unavailable')
        source.metadata['review_due_at'] = '2000-01-01T00:00:00Z'
        self.assertEqual(grounded_answer("answer", [source], safe_filter)['status'], 'unavailable')

    def test_sources_come_from_knowledge_rows_without_ehr_or_model_urls(self):
        knowledge = SimpleNamespace(source="knowledge", metadata={"document_id": "12", "chunk_id": "34"}, doc_title="Guideline", content="evidence" * 200)
        ehr = SimpleNamespace(source="ehr", metadata={}, doc_title="Private record", content="PHI")
        result = supporting_sources([knowledge, ehr])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["documentId"], "12")
        self.assertEqual(len(result[0]["excerpt"]), 600)
        self.assertNotIn("url", result[0])


# Load the production handler without initializing models, databases or providers.
# Its dependency boundaries are injected; the handler itself is not reimplemented.
import ast
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
import sys
import types
from typing import Dict, Any


class ChatHandlerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        tree = ast.parse(Path(__file__).with_name('app.py').read_text())
        function = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == 'chat')
        function.decorator_list = []
        self.retrieve = AsyncMock(return_value=([], ''))
        self.generate = Mock()
        self.scope = {
            'Dict': Dict, 'Any': Any, 'UTILS_AVAILABLE': True, 'os': __import__('os'), 'verified_observation_chunks': verified_observation_chunks, 'signed_medication_chunks': signed_medication_chunks,
            'app_state': SimpleNamespace(warmup_complete=True, request_count=0, db=None),
            'logger': Mock(), 'time': __import__('time'),
            '_retrieve_unified_context': self.retrieve,
            '_has_authoritative_ai_consent': AsyncMock(return_value=False),
            'detect_emergencies': lambda message: [], 'generate_answer': self.generate,
            'normalize_chat_history': normalize_chat_history,
        }
        exec(compile(ast.Module(body=[function], type_ignores=[]), 'app.py:chat', 'exec'), self.scope)
        translator = types.ModuleType('utils.indic_translation')
        translator.process_for_llm = lambda message, language: (message, language)
        translator.translate_response = lambda response, language: response
        self.translator = patch.dict(sys.modules, {'utils.indic_translation': translator})
        self.translator.start()

    def tearDown(self):
        self.translator.stop()

    async def test_missing_evidence_abstains_without_generation(self):
        result = await self.scope['chat']({'message': 'Explain my symptoms', 'patient_id': 'session', 'server_managed_history': True})
        self.assertEqual(result['provider'], 'evidence-unavailable')
        self.assertEqual(result['retrieval']['count'], 0)
        self.generate.assert_not_called()
        self.retrieve.assert_awaited_once_with('Explain my symptoms', patient_id=None, k=6)

    async def test_emergency_preempts_retrieval_and_generation(self):
        self.scope['detect_emergencies'] = lambda message: [object()]
        result = await self.scope['chat']({'message': 'urgent synthetic case', 'patient_id': 'session'})
        self.assertTrue(result['emergency'])
        self.retrieve.assert_not_awaited()
        self.generate.assert_not_called()

if __name__ == "__main__":
    unittest.main()
