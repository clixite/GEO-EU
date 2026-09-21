/**
 * Prompt-injection and AI-manipulation detection for untrusted text.
 *
 * Used (a) by the readiness analyser to penalise pages that address AI systems,
 * and (b) by the knowledge store to quarantine ingested documents that contain
 * instruction-like strings, so a poisoned web page cannot steer drafting or
 * verification. Detection is deterministic and conservative; findings carry the
 * matched pattern so reviewers can release false positives.
 *
 * Coverage: English plus the most common phrasings in French, German, Dutch,
 * Spanish and Italian; zero-width and soft-hyphen characters are stripped before
 * matching so they cannot split keywords. This is a first line of defence, not a
 * classifier — the deterministic verifier and the human approver remain the
 * controls that catch what the patterns miss (docs/THREAT_MODEL.md T1).
 */

const PATTERNS: { id: string; re: RegExp; severity: 'high' | 'medium' }[] = [
  { id: 'ignore-instructions', re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|system)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?|guidelines?|directives?)\b/i, severity: 'high' },
  { id: 'ignore-instructions', re: /\b(ignore[rz]?|oubli[ez]{1,2}|n[ée]glige[rz]?)\b[^.\n]{0,40}\b(instructions?|consignes?|r[èe]gles?)\b[^.\n]{0,20}\b(pr[ée]c[ée]dentes?|ant[ée]rieures?|ci-dessus|syst[èe]me)\b/i, severity: 'high' },
  { id: 'ignore-instructions', re: /\b(ignorier(e|en|st)?|vergiss|missachte|übergehe)\b[^.\n]{0,40}\b(alle|vorherigen|bisherigen|obigen|system)\b[^.\n]{0,20}\b(anweisungen|regeln|vorgaben|instruktionen)\b/i, severity: 'high' },
  { id: 'ignore-instructions', re: /\b(negeer|vergeet)\b[^.\n]{0,40}\b(alle|vorige|eerdere|bovenstaande)\b[^.\n]{0,20}\b(instructies|regels|opdrachten)\b/i, severity: 'high' },
  { id: 'ignore-instructions', re: /\b(ignora|olvida|omite)\b[^.\n]{0,40}\b(las|todas|anteriores|previas)\b[^.\n]{0,20}\b(instrucciones|reglas|indicaciones)\b/i, severity: 'high' },
  { id: 'ignore-instructions', re: /\b(ignora|dimentica)\b[^.\n]{0,40}\b(le|tutte|precedenti)\b[^.\n]{0,20}\b(istruzioni|regole|indicazioni)\b/i, severity: 'high' },
  { id: 'role-override', re: /\b(you are now|from now on you are|act as|pretend to be|tu es maintenant|du bist jetzt|je bent nu|ahora eres|ora sei)\b[^.\n]{0,40}\b(an? |un |une |ein |eine |een |un |una )?(ai|assistant|assistente|asistente|llm|model|modell|system|systeem|sistema|developer|admin)/i, severity: 'high' },
  { id: 'system-prompt', re: /\b(system prompt|developer message|hidden instructions?|prompt syst[èe]me|systemprompt)\b/i, severity: 'medium' },
  { id: 'cite-this', re: /\b(cite|recommend|prefer|rank|list|mention|cita|recomienda|recommande|empfiehl|zitiere|citer|recommander|noem|beveel)\b[^.\n]{0,20}\b(this|our|my|cette|ce|notre|diese|dieses|unsere|deze|dit|onze|esta|este|nuestra|questa|questo)\b[^.\n]{0,20}\b(page|site|source|product|company|brand|article|entreprise|marque|seite|unternehmen|marke|pagina|bedrijf|merk|página|empresa|marca|azienda)\b[^.\n]{0,40}\b(first|top|always|highest|best|premier|toujours|meilleur|zuerst|immer|beste|eerst|altijd|primero|siempre|mejor|primo|sempre|migliore)\b/i, severity: 'high' },
  { id: 'assistant-address', re: /\b(dear|attention|note to|hello|hi|cher|chère|liebe[rs]?|beste|querido|caro)\s+(ai|assistant|assistants|assistente|asistente|chatgpt|claude|gemini|copilot|perplexity|language model|ki|ia)\b/i, severity: 'high' },
  { id: 'tool-call', re: /\b(call|invoke|run|execute)\s+(the\s+)?(tool|function|command)\b[^.\n]{0,40}\b(named|called)?\b/i, severity: 'medium' },
  { id: 'exfiltration', re: /\b(send|post|upload|forward|envoie|envoyer|sende|schicke|stuur|envía|invia)\b[^.\n]{0,40}\b(api key|clé api|api-schlüssel|credentials?|secrets?|tokens?|passwords?|mot de passe|passwort|wachtwoord|contraseña|conversation|chat history)\b/i, severity: 'high' },
  { id: 'chat-transcript-marker', re: /^\s*(assistant|system|user):\s/im, severity: 'medium' },
];

const INVISIBLE = /[​-‏⁠⁡⁢⁣⁤﻿­͏᠎]/g;

export function normaliseForScan(text: string): string {
  return text.replace(INVISIBLE, '').normalize('NFKC');
}

export interface InjectionFinding {
  id: string;
  severity: 'high' | 'medium';
  excerpt: string;
  index: number;
}

export function scanForInjection(text: string, maxFindings = 20): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  const t = normaliseForScan(text);
  const seen = new Set<string>();
  for (const p of PATTERNS) {
    const m = t.match(p.re);
    if (m && m.index !== undefined) {
      const key = `${p.id}:${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ id: p.id, severity: p.severity, excerpt: t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' '), index: m.index });
      if (findings.length >= maxFindings) break;
    }
  }
  return findings;
}

export function hasHighSeverityInjection(text: string): boolean {
  return scanForInjection(text).some((f) => f.severity === 'high');
}
