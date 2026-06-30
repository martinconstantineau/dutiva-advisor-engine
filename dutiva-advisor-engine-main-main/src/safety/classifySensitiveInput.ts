export type SensitivityLevel = 'safe' | 'sensitive' | 'crisis';

export interface SensitivityClassification {
  level: SensitivityLevel;
  reason?: string;
}

const crisisPatterns = [
  /\b(suicid|kill\s+myself|end\s+my\s+life|self[.\-\s]?harm|hurt\s+myself)\b/i,
  /\b(want\s+to\s+die|don'?t\s+want\s+to\s+live|no\s+reason\s+to\s+live)\b/i,
  /\b(threaten|threatened|imminent\s+danger|can'?t\s+stay\s+safe)\b/i,
  // Threats of harm to others — require explicit violence intent, NOT a bare
  // weapon noun. A bare "gun"/"knife"/"weapon" otherwise mis-flags benign HR
  // questions ("is a nail gun regulated for warehouse staff?", "an employee cut
  // themselves with a knife while prepping food") as a crisis and short-circuits
  // all HR guidance into the self-harm hotline response.
  /\bhurt\s+someone\b/i,
  /\b(shoot|stab|kill|attack)\s+(someone|somebody|him|her|them|everyone|people|a\s+(co-?worker|colleague|coworker)|my\s+(co-?worker|colleague|coworker|boss|manager|supervisor|wife|husband|partner|family|kids?|children))\b/i,
  /\b(gun|knife|weapon|firearm)\b[^.?!]{0,30}\b(kill|shoot|stab|murder|attack|threaten)\b/i,
  /\b(kill|shoot|stab|murder|attack|threaten)\b[^.?!]{0,30}\b(gun|knife|weapon|firearm)\b/i,
];

const sensitivePatterns = [
  /\b(sexual\s+harassment|sexual\s+assault|rape|unwanted\s+touching)\b/i,
  /\b(mental\s+health|depression|anxiety|breakdown|crisis)\b/i,
  /\b(addiction|substance\s+abuse|alcohol|drug)\b/i,
  /\b(domestic\s+violence|abuse\s+at\s+home)\b/i,
];

export function classifySensitiveInput(input: string): SensitivityClassification {
  for (const pattern of crisisPatterns) {
    if (pattern.test(input)) {
      return { level: 'crisis', reason: 'Input contains crisis-level language' };
    }
  }
  for (const pattern of sensitivePatterns) {
    if (pattern.test(input)) {
      return { level: 'sensitive', reason: 'Input contains sensitive topic' };
    }
  }
  return { level: 'safe' };
}
