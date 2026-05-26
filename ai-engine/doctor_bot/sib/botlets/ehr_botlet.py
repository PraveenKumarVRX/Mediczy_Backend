"""
EHRBotlet - EHR Ingestion and Retrieval
=======================================

Handles Electronic Health Record operations:
- File ingestion (PDF, HL7, TXT)
- MedSpaCy preprocessing
- ClinicalBERT embeddings
- FAISS storage and retrieval
- Real-time index updates
- n8n processing workflow automation
"""

import logging
import asyncio
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime

logger = logging.getLogger("sib.ehrbotlet")


class EHRBotlet:
    """
    EHR ingestion and retrieval botlet.
    
    Integrates with:
    - utils/preprocess.py for NLP preprocessing
    - utils/embed_store.py for FAISS storage
    - utils/real_time_ingest.py for file ingestion
    """
    
    def __init__(self, memory):
        """
        Initialize EHRBotlet.
        
        Args:
            memory: SharedMemory instance
        """
        self.memory = memory
        self.ingestion_count = 0
        self.retrieval_count = 0
        
        # Initialize n8n client for processing automation
        from ..utils.n8n_client import get_n8n_client
        self.n8n = get_n8n_client()
        
        logger.info("📄 EHRBotlet initialized (with n8n automation)")
    
    def ingest_file(self, file_path: str, patient_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Ingest an EHR file (PDF, HL7, TXT).
        
        Args:
            file_path: Path to the EHR file
            patient_id: Optional patient identifier
            
        Returns:
            Ingestion result with extracted data
        """
        try:
            from utils.real_time_ingest import ingest_single_file
            
            result = ingest_single_file(file_path, force=False)
            
            if result:
                self.ingestion_count += 1
                
                # Store patient context if patient_id provided
                if patient_id and result.get("entities"):
                    self.memory.set_patient_context(patient_id, {
                        "ehr_entities": result["entities"],
                        "ehr_sections": list(result.get("sections", {}).keys()),
                        "last_ehr_update": datetime.now().isoformat()
                    })
                
                ingestion_result = {
                    "status": "success",
                    "file": file_path,
                    "patient_id": result.get("patient_id", patient_id),
                    "sections": list(result.get("sections", {}).keys()),
                    "entities_count": len(result.get("entities", [])),
                    "ingested_at": datetime.now().isoformat()
                }
                
                # Trigger n8n EHR processing workflow
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self._trigger_ehr_processing(patient_id, ingestion_result, result))
                    else:
                        loop.run_until_complete(self._trigger_ehr_processing(patient_id, ingestion_result, result))
                except Exception as e:
                    logger.warning(f"Failed to trigger n8n EHR processing: {e}")
                
                return ingestion_result
            else:
                return {
                    "status": "failed",
                    "file": file_path,
                    "error": "Ingestion returned no result"
                }
        
        except Exception as e:
            logger.error(f"EHR ingestion failed: {e}")
            return {
                "status": "error",
                "file": file_path,
                "error": str(e)
            }
    
    def ingest_text(self, text: str, patient_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Ingest raw EHR text.
        
        Args:
            text: Raw EHR text content
            patient_id: Optional patient identifier
            
        Returns:
            Processing result
        """
        try:
            from utils.preprocess import process_ehr_text
            from utils.embed_store import add_texts
            
            # Process the text
            processed = process_ehr_text(text)
            
            # Extract sentences for embedding
            sentences = []
            if "sections" in processed:
                for section_content in processed["sections"].values():
                    if isinstance(section_content, list):
                        sentences.extend(section_content)
                    elif isinstance(section_content, str):
                        sentences.append(section_content)
            
            # Add to FAISS index
            if sentences:
                add_texts(sentences, metadata={"patient_id": patient_id or "unknown"})
            
            self.ingestion_count += 1
            
            # Store patient context
            if patient_id and processed.get("entities"):
                self.memory.set_patient_context(patient_id, {
                    "ehr_entities": processed["entities"],
                    "ehr_sections": list(processed.get("sections", {}).keys()),
                    "last_ehr_update": datetime.now().isoformat()
                })
            
            return {
                "status": "success",
                "patient_id": patient_id,
                "sections": list(processed.get("sections", {}).keys()),
                "entities_count": len(processed.get("entities", [])),
                "sentences_indexed": len(sentences)
            }
        
        except ImportError:
            # Fallback if utils not fully available
            return self._fallback_text_ingest(text, patient_id)
        except Exception as e:
            logger.error(f"Text ingestion failed: {e}")
            return {"status": "error", "error": str(e)}
    
    def _fallback_text_ingest(self, text: str, patient_id: Optional[str]) -> Dict[str, Any]:
        """Fallback text ingestion without full pipeline"""
        # Simple sentence splitting
        sentences = [s.strip() for s in text.split('.') if len(s.strip()) > 20]
        
        try:
            from utils.embed_store import add_texts
            add_texts(sentences, metadata={"patient_id": patient_id or "unknown"})
            
            return {
                "status": "success",
                "patient_id": patient_id,
                "sentences_indexed": len(sentences),
                "note": "Fallback processing used"
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    async def retrieve(self, query: str, patient_id: Optional[str] = None, k: int = 5) -> Dict[str, Any]:
        """
        Retrieve relevant EHR chunks for a query using UnifiedRAGRetriever.

        Args:
            query: Search query
            patient_id: Optional patient filter
            k: Number of results

        Returns:
            Retrieved chunks with metadata
        """
        try:
            from sib.retrieval.unified_rag import get_unified_rag

            rag = get_unified_rag()
            chunks = await rag.retrieve(query, patient_id=patient_id, k=k)
            self.retrieval_count += 1

            return {
                "status": "success",
                "query": query,
                "chunks": rag.to_dict_list(chunks),
                "total_results": len(chunks),
                "context": rag.to_context_string(chunks),
            }

        except Exception as e:
            logger.error(f"Retrieval failed: {e}")
            return {
                "status": "error",
                "query": query,
                "error": str(e),
                "chunks": [],
            }
    
    def get_patient_records(self, patient_id: str) -> List[Dict]:
        """
        Get all records for a patient.
        
        Args:
            patient_id: Patient identifier
            
        Returns:
            List of patient records
        """
        try:
            from utils.embed_store import search_by_metadata
            
            return search_by_metadata({"patient_id": patient_id})
        except ImportError:
            # Return from memory cache if available
            ctx = self.memory.get_patient_context(patient_id)
            if ctx:
                return [{"patient_id": patient_id, "context": ctx}]
            return []
    
    def ingest_batch(self, directory: Optional[str] = None) -> Dict[str, Any]:
        """
        Batch ingest all new EHR files.
        
        Args:
            directory: Optional directory path (default: data/ehr_records)
            
        Returns:
            Batch ingestion results
        """
        try:
            from utils.real_time_ingest import ingest_new_files
            
            result = ingest_new_files()
            
            return {
                "status": result.get("status", "unknown"),
                "total_files": result.get("total_files", 0),
                "ingested": result.get("ingested", 0),
                "skipped": result.get("skipped", 0),
                "failed": result.get("failed", 0)
            }
        
        except Exception as e:
            logger.error(f"Batch ingestion failed: {e}")
            return {"status": "error", "error": str(e)}
    
    def get_ingestion_status(self) -> Dict[str, Any]:
        """Get current ingestion status"""
        try:
            from utils.real_time_ingest import get_ingestion_status
            from utils.embed_store import get_stats
            
            ingest_status = get_ingestion_status()
            index_stats = get_stats()
            
            return {
                **ingest_status,
                **index_stats,
                "botlet_ingestion_count": self.ingestion_count,
                "botlet_retrieval_count": self.retrieval_count
            }
        
        except Exception as e:
            return {
                "error": str(e),
                "botlet_ingestion_count": self.ingestion_count,
                "botlet_retrieval_count": self.retrieval_count
            }
    
    def get_stats(self) -> Dict[str, Any]:
        """Get EHRBotlet statistics"""
        return {
            "ingestion_count": self.ingestion_count,
            "retrieval_count": self.retrieval_count
        }
