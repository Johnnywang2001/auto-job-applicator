import type { ChatMessage } from '../types';
import { getSettings } from './storage';

const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function sanitizeErrorMessage(text: string): string {
  const truncated = text.slice(0, 200);
  return truncated.replace(/Bearer\s+\S+/gi, '[REDACTED]').replace(/api[_-]?key[=_\s]+\S+/gi, '[REDACTED]');
}

export async function callLLM(messages: ChatMessage[], model?: string): Promise<string> {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error('API key not configured');

  const baseUrl = settings.apiBaseUrl || DEFAULT_BASE_URL;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: model || settings.apiModel,
          messages,
          temperature: 0.3,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error ${response.status}: ${sanitizeErrorMessage(text)}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (e: any) {
      lastError = e;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new Error('API request failed after retries');
}

export async function testApiKey(key?: string): Promise<{ success: boolean; message: string }> {
  try {
    const settings = await getSettings();
    const apiKey = key || settings.apiKey;
    if (!apiKey) return { success: false, message: 'No API key provided' };

    const baseUrl = settings.apiBaseUrl || DEFAULT_BASE_URL;

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: settings.apiModel || 'deepseek-v4-flash',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      })
    });

    if (response.ok) {
      return { success: true, message: 'API key is valid' };
    } else {
      const text = await response.text();
      const msg = text.length > 100 ? text.slice(0, 100) + '...' : text;
      return { success: false, message: `Invalid key: ${sanitizeErrorMessage(msg)}` };
    }
  } catch (e: any) {
    return { success: false, message: `Connection error: ${e.message}` };
  }
}

export async function rankJob(resumeText: string, jobDescription: string): Promise<{ score: number; reason: string }> {
  const prompt = `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nRespond in this exact format:\nScore: X\nReason: [one sentence]`;

  const content = await callLLM(
    [
      { role: 'system', content: 'You are an expert career advisor. Rate how well a candidate\'s resume matches a job description on a scale of 1-10. Be critical but fair. Only return the numeric score and a brief 1-sentence explanation.' },
      { role: 'user', content: prompt }
    ],
    'deepseek-v4-flash'
  );

  const scoreMatch = content.match(/Score:\s*(\d+(?:\.\d+)?)/i);
  const reasonMatch = content.match(/Reason:\s*(.+)/i);

  return {
    score: scoreMatch ? Math.min(10, Math.max(1, parseFloat(scoreMatch[1]))) : 5,
    reason: reasonMatch ? reasonMatch[1].trim() : 'No explanation provided'
  };
}

function extractJSONFromLLM(content: string): string | null {
  let text = content.trim();

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : null;
}

export async function optimizeResume(resumeJSON: any, jobDescription: string): Promise<any> {
  const prompt = `ORIGINAL RESUME:\n${JSON.stringify(resumeJSON, null, 2)}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nRewrite the resume to better align with the job description. Keep all facts truthful. Do not invent experience. Emphasize relevant skills and achievements. Output as structured JSON with keys: name, contact, summary, skills (array), experience (array of {company, title, dates, bullets}), education (array of {institution, degree, dates}).`;

  const content = await callLLM(
    [
      { role: 'system', content: 'You are a professional resume writer. Rewrite resumes to align with job descriptions while keeping all facts truthful.' },
      { role: 'user', content: prompt }
    ],
    'kimi-k2.6'
  );

  try {
    const jsonStr = extractJSONFromLLM(content);
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed.name === 'string' && typeof parsed.summary === 'string' && Array.isArray(parsed.skills)) {
        return parsed;
      }
      console.warn('[AJA] LLM resume output missing required fields, falling back');
    }
  } catch {
    // fallback
  }
  return resumeJSON;
}

export async function generateCoverLetter(resumeText: string, jobDescription: string, company: string, title: string): Promise<string> {
  const prompt = `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nCOMPANY NAME: ${company}\nJOB TITLE: ${title}\n\nWrite a compelling one-page cover letter that opens with enthusiasm for the specific role, connects 2-3 relevant experiences to job requirements, and closes with a call to action.`;

  return await callLLM(
    [
      { role: 'system', content: 'You are a professional cover letter writer.' },
      { role: 'user', content: prompt }
    ],
    'kimi-k2.6'
  );
}