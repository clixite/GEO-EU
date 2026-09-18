/**
 * Prompt-injection and AI-manipulation detection for untrusted text.
 *
 * Used (a) by the readiness analyser to penalise pages that address AI systems,
 * and (b) by the knowledge store to quarantine ingested documents that contain
 * instruction-like strings, so a poisoned web page cannot steer drafting or
 * verification. Detection is deterministic and conservative; findings carry the
 * matched pattern so reviewers can release false positives.
 */

const PATTERNS: { id: string; re: RegExp; severity: 'high' | 'medium' }[] = [
  { id: 'ignore-instructions', re: /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?)\b/i, severity: 'high' },
  { id: 'role-override', re: /\b(you are now|from now on you are|act as|pretend to be)\b[^.\n]{0,40}\b(an? )?(ai|assistant|llm|model|system|developer|admin)/i, severity: 'high' },
  { id: 'system-prompt', re: /\b(system prompt|developer message|hidden instructions?)\b/i, severity: 'medium' },
  { id: 'cite-this', re: /\b(cite|recommend|prefer|rank|list)\b[^.\n]{0,20}\b(this|our|my)\b[^.\n]{0,20}\b(page|site|source|product|company|brand|article)\b[^.\n]{0,40}\b(first|top|always|highest|best)\b/i, severity: 'high' },
  { id: 'assistant-address', re: /\b(dear|attention|note to|hello)\s+(ai|assistant|chatgpt|claude|gemini|copilot|perplexity|language model)s?\b/i, severity: 'high' },
  { id: 'tool-call', re: /\b(call|invoke|run|execute)\s+(the\s+)?(tool|function|command)\b[^.\n]{0,40}\b(named|called)?\b/i, severity: 'medium' },
  { id: 'exfiltration', re: /\b(send|post|upload|forward)\b[^.\n]{0,40}\b(api key|credentials?|secrets?|tokens?|passwords?|conversation|chat history)\b/i, severity: 'high' },
  { id: 'chat-transcript-marker', re: /^\s*(assistant|system|user):\s/im, severity: 'medium' },
];

export interface InjectionFinding {
  id: string;
  severity: 'high' | 'medium';
  excerpt: string;
  index: number;
}

export function scanForInjection(text: string, maxFindings = 20): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m && m.index !== undefined) {
      findings.push({ id: p.id, severity: p.severity, excerpt: text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' '), index: m.index });
      if (findings.length >= maxFindings) break;
    }
  }
  return findings;
}

export function hasHighSeverityInjection(text: string): boolean {
  return scanForInjection(text).some((f) => f.severity === 'high');
}
