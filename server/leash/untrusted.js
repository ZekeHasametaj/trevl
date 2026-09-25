// Merchant-supplied text (item_details, descriptions) is untrusted input.
// We only ever *read facts* from it and *flag* instructions. It never changes the policy
// and never counts as evidence for approval.

const INJECTION_PATTERNS = [
  { label: 'Aufforderung, Regeln zu ignorieren', re: /\b(ignore|disregard|forget|override|bypass)\b[^.]{0,40}\b(instruction|rule|limit|polic|spending|previous|above|check)/i },
  { label: 'Aufforderung, Regeln zu ignorieren', re: /\b(ignorier|vergiss|übergeh|umgeh)\w*\b[^.]{0,40}\b(anweisung|regel|limit|grenze|vorgabe|prüfung)/i },
  { label: 'Behauptete Vorab-Freigabe', re: /\b(pre-?authori[sz]ed|pre-?approved|already (been )?(approved|authori[sz]ed))\b/i },
  { label: 'Behauptete Vorab-Freigabe', re: /\b(vorab|bereits|schon)\s+(freigegeben|genehmigt|autorisiert|bestätigt)\b/i },
  { label: 'Behauptung, Limits gälten nicht', re: /\b(limits?|rules?|restrictions?)\b[^.]{0,30}\b(do(es)? not|don't|no longer)\s+apply\b/i },
  { label: 'Behauptung, Limits gälten nicht', re: /\b(limit|regel|grenze)\w*\b[^.]{0,30}\b(gilt|gelten)\s+(hier\s+)?nicht\b/i },
  { label: 'Befehl, sofort freizugeben', re: /\b(approve|authori[sz]e|book|confirm|pay)\b[^.]{0,30}\b(immediately|right away|now|without (further )?(check|confirm|verif))/i },
  { label: 'Befehl, sofort freizugeben', re: /\b(sofort|umgehend|direkt)\b[^.]{0,20}\b(freigeben|buchen|bezahlen|genehmigen)\b/i },
  { label: 'Ohne Prüfung / ohne Rückfrage', re: /\bwithout (any )?(further )?(checks?|confirmation|verification|asking)\b/i },
  { label: 'Ohne Prüfung / ohne Rückfrage', re: /\bohne (weitere )?(prüfung|bestätigung|rückfrage|nachfrage)\b/i },
  { label: 'Kunde angeblich nicht erreichbar', re: /\b(cardholder|customer|user|traveller|traveler)\b[^.]{0,20}\b(unavailable|not available|cannot be reached|can't confirm)/i },
  { label: 'Kunde angeblich nicht erreichbar', re: /\b(kunde|karteninhaber|reisende)\w*\b[^.]{0,20}\b(nicht erreichbar|kann nicht bestätigen)/i },
  { label: 'Nachricht an KI-Agenten', re: /\b(note|message|instruction)s?\s+(for|to)\s+(automated|ai|llm|shopping|purchasing|booking)?\s*(purchasing |booking )?(agents?|assistants?|bots?)\b/i },
  { label: 'Nachricht an KI-Agenten', re: /\b(hinweis|anweisung|nachricht)\s+(für|an)\s+(ki|ai|agenten|buchungs-?agenten|assistenten)\b/i },
  { label: 'Rollen-Übernahme (system/assistant)', re: /(^|[\s"'(\[])(system|assistant|developer)\s*(prompt)?\s*:/i },
  { label: 'Aufforderung, Kunde nicht zu fragen', re: /\b(do not|don't|never)\s+(ask|notify|inform|confirm with)\s+(the\s+)?(customer|cardholder|user)/i },
  { label: 'Aufforderung, Kunde nicht zu fragen', re: /\b(frag|informier|benachrichtig)\w*\s+(den\s+)?(kunden|karteninhaber)\s+nicht\b/i },
];

export function scanUntrusted(text) {
  const t = String(text ?? '');
  if (!t.trim()) return { detected: false, findings: [] };
  const findings = [];
  const seen = new Set();
  for (const p of INJECTION_PATTERNS) {
    const m = t.match(p.re);
    if (m && !seen.has(p.label)) {
      seen.add(p.label);
      const i = Math.max(0, m.index - 20);
      const excerpt = t.slice(i, Math.min(t.length, m.index + m[0].length + 30)).trim();
      findings.push({ label: p.label, excerpt: (i > 0 ? '…' : '') + excerpt + (m.index + m[0].length + 30 < t.length ? '…' : '') });
    }
  }
  return { detected: findings.length > 0, findings };
}

// Claims a merchant makes in free text. Reported as "unconfirmed", never used to pass a rule.
const CLAIMS = [
  { key: 'cancellable', label: 'kostenlos stornierbar', re: /\b(free cancell?ation|fully refundable|kostenlos(e)? stornier|gratis stornier|kostenfrei stornier)/i },
  { key: 'non_cancellable', label: 'nicht stornierbar', re: /\b(non-?refundable|no refunds?|nicht stornierbar|keine erstattung|not cancell?able)/i },
  { key: 'breakfast', label: 'Frühstück inbegriffen', re: /\b(breakfast included|inkl\.? frühstück|mit frühstück)/i },
  { key: 'hidden_fee', label: 'Gebühr vor Ort', re: /\b(resort fee|city tax|payable (at|on) (the )?(property|arrival)|vor ort zu zahlen|kurtaxe)/i },
];
export function extractClaims(text) {
  const t = String(text ?? '');
  return CLAIMS.filter(c => c.re.test(t)).map(c => ({ key: c.key, label: c.label }));
}

// Product facts a shop states in its text (size, return window). Viseca: "extract product facts;
// never let that text change the policy". Facts from a text that also contains instructions are discarded.
export function extractProductFacts(text) {
  const t = String(text ?? '');
  if (!t.trim() || scanUntrusted(t).detected) return {};
  const out = {};
  let m;
  if ((m = t.match(/\b(?:size|grösse|größe|gr\.)\s*:?\s*(\d{2}(?:[.,]5)?|XXS|XS|S|M|L|XL|XXL)\b/i))) out.size = m[1].toUpperCase().replace(',', '.');
  if ((m = t.match(/\breturns?\s+(?:are\s+)?(?:accepted\s+)?within\s+(\d{1,3})\s+days?\b/i)) || (m = t.match(/\b(\d{1,3})[- ]day\s+returns?\b/i))
    || (m = t.match(/\brückgabe\s+(?:innerhalb\s+)?(?:von\s+)?(\d{1,3})\s+tage/i)) || (m = t.match(/\b(\d{1,3})\s+tage\s+rückgabe/i))) out.return_days = Number(m[1]);
  if (/\b(final sale|no returns|non-returnable|kein umtausch|nicht umtauschbar)\b/i.test(t)) out.return_days = 0;
  return out;
}
