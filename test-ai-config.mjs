#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load DocsGPT configuration
const aiEnginePath = path.join(__dirname, 'ai-engine');
dotenv.config({ path: path.join(aiEnginePath, 'docsgpt.env') });

console.log('🧪 Testing AI Configuration');
console.log('============================');

console.log('\n📋 Environment Variables:');
console.log('AI_PROVIDER:', process.env.AI_PROVIDER);
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : 'Not set');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...` : 'Not set');
console.log('LLM_PROVIDER:', process.env.LLM_PROVIDER);
console.log('LLM_NAME:', process.env.LLM_NAME);

// Test OpenAI API directly
async function testOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    console.log('❌ OpenAI API key not found');
    return;
  }

  try {
    console.log('\n🤖 Testing OpenAI API...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are Dr. Isha, a medical AI assistant. Provide brief, helpful medical information.'
          },
          {
            role: 'user',
            content: 'What are common causes of morning headaches?'
          }
        ],
        max_tokens: 150
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ OpenAI API Response:', data.choices[0].message.content.substring(0, 100) + '...');
      return true;
    } else {
      const error = await response.text();
      console.log('❌ OpenAI API Error:', response.status, error.substring(0, 200));
      return false;
    }
  } catch (error) {
    console.log('❌ OpenAI Network Error:', error.message);
    return false;
  }
}

// Test Gemini API directly  
async function testGemini() {
  if (!process.env.GEMINI_API_KEY) {
    console.log('❌ Gemini API key not found');
    return;
  }

  try {
    console.log('\n🧠 Testing Gemini API...');
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'As Dr. Isha, a medical AI assistant, briefly explain what causes morning headaches.'
          }]
        }],
        generationConfig: {
          maxOutputTokens: 150
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No content';
      console.log('✅ Gemini API Response:', content.substring(0, 100) + '...');
      return true;
    } else {
      const error = await response.text();
      console.log('❌ Gemini API Error:', response.status, error.substring(0, 200));
      return false;
    }
  } catch (error) {
    console.log('❌ Gemini Network Error:', error.message);
    return false;
  }
}

async function runTests() {
  const openaiWorking = await testOpenAI();
  const geminiWorking = await testGemini();
  
  console.log('\n🎯 Summary:');
  console.log('===========');
  console.log('OpenAI:', openaiWorking ? '✅ Working' : '❌ Failed');
  console.log('Gemini:', geminiWorking ? '✅ Working' : '❌ Failed');
  
  if (openaiWorking || geminiWorking) {
    console.log('🟢 At least one AI provider is working - Medical AI should function!');
  } else {
    console.log('🔴 No AI providers working - Check API keys and network connectivity');
  }
}

runTests().catch(console.error);