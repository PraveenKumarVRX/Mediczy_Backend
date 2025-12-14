#!/usr/bin/env python3
"""
Tiny-LLaMA Query Script for RAG Agent
Uses llama.cpp Python bindings
"""

import sys
import json
from llama_cpp import Llama

def query_llama(model_path, prompt, max_tokens=200, temperature=0.1, context_size=1024, threads=4):
    """Query Tiny-LLaMA model via llama.cpp"""
    try:
        # Initialize model (CPU only)
        llm = Llama(
            model_path=model_path,
            n_ctx=context_size,
            n_threads=threads,
            n_gpu_layers=0,  # Use CPU only
            verbose=False
        )
        
        # Generate response
        response = llm(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=["User:", "\n\n", "Human:"],
            echo=False
        )
        
        # Extract text
        text = response['choices'][0]['text'].strip()
        
        # Return result
        return {
            'success': True,
            'response': text,
            'tokens_used': response['usage']['total_tokens']
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({
            'success': False,
            'error': 'Usage: query-tinyllama.py <model_path> <prompt> [max_tokens] [temperature]'
        }))
        sys.exit(1)
    
    model_path = sys.argv[1]
    prompt = sys.argv[2]
    max_tokens = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    temperature = float(sys.argv[4]) if len(sys.argv) > 4 else 0.1
    
    result = query_llama(model_path, prompt, max_tokens, temperature)
    print(json.dumps(result))
