/**
 * Patch README.md for the final integration-readiness polish pass.
 * Run with: node scripts/patchReadme.mjs
 */
import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('README.md', 'utf8');
let changed = 0;

// Detect line ending style used by the file
const useCRLF = content.includes('\r\n');
const NL = useCRLF ? '\r\n' : '\n';

function patch(description, oldStr, newStr) {
  if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    console.log(`✓ ${description}`);
    changed++;
  } else {
    console.warn(`⚠ Skipped (not found): ${description}`);
  }
}

// ─── 1. Add webSearchAllowed to response contract route block ─────────────────
patch(
  'Add webSearchAllowed to response contract route block',
  `    suggestedDocumentsAllowed: boolean;${NL}  };${NL}  jurisdiction: {`,
  `    suggestedDocumentsAllowed: boolean;${NL}    webSearchAllowed: boolean;           // final effective gate: consuming app must check before rendering webSearch${NL}  };${NL}  jurisdiction: {`
);

// ─── 2. Update crisis JSON example to add webSearchAllowed: false ─────────────
patch(
  'Add webSearchAllowed:false to crisis JSON example',
  `    "suggestedDocumentsAllowed": false${NL}  },${NL}  "risk":`,
  `    "suggestedDocumentsAllowed": false,${NL}    "webSearchAllowed": false${NL}  },${NL}  "risk":`
);

// ─── 3. Fix Startpage env block: backtick+env → triple-backtick fenced block ──
// The malformed block: \r\n\r\n`env\r\n...vars...\r\n`\r\n\r\nBecause
{
  const OPEN_MARKER = `\`env${NL}WEB_SEARCH_ENABLED=true`;
  const CLOSE_MARKER = `${NL}\`${NL}`;
  const envBlockStart = content.indexOf(OPEN_MARKER);
  if (envBlockStart < 0) {
    console.warn('⚠ Skipped: Could not find malformed env block start');
  } else {
    const closingIdx = content.indexOf(CLOSE_MARKER, envBlockStart + OPEN_MARKER.length);
    if (closingIdx < 0) {
      console.warn('⚠ Skipped: Could not find closing backtick of env block');
    } else {
      const oldBlock = content.slice(envBlockStart, closingIdx + CLOSE_MARKER.length);
      const newBlock = `\`\`\`env${NL}WEB_SEARCH_ENABLED=true${NL}WEB_SEARCH_PROVIDER=startpage${NL}${NL}# Contracted/approved Startpage API adapter endpoint (required for live calls)${NL}STARTPAGE_BASE_URL=https://your-startpage-adapter-endpoint.example.com${NL}STARTPAGE_API_KEY=your_startpage_api_key${NL}${NL}# Optional tuning${NL}STARTPAGE_TIMEOUT_MS=10000${NL}STARTPAGE_MAX_RESULTS=5${NL}STARTPAGE_REGION=ca${NL}STARTPAGE_LANGUAGE=en${NL}WEB_SEARCH_CACHE_TTL_SECONDS=900${NL}WEB_FETCH_TIMEOUT_MS=10000${NL}\`\`\`${NL}`;
      content = content.replace(oldBlock, newBlock);
      console.log('✓ Fixed Startpage env block to proper fenced code block');
      changed++;
    }
  }
}

// ─── 4. Update webSearchAllowed gate description in Route Rendering Gates ──────
patch(
  'Update webSearchAllowed gate description to final-effective-gate language',
  "`route.webSearchAllowed` controls whether the consuming app may render `webSearch` results. The consuming app must **never carry `webSearch` results from a prior turn** when the current turn's `webSearchAllowed` is `false`. Prior retrieval, workspace, or web search data from a previous turn must never be rendered when the current turn's gates disable it.",
  "`route.webSearchAllowed` is a **final effective rendering gate**, not merely an intent-level eligibility flag. It is `true` only when ALL of the following hold for this specific response: the intent is HR/compliance-eligible; `options.enableWebSearch` was `true` in the request; `WEB_SEARCH_ENABLED=true` globally; the Startpage endpoint and API key are configured; and the query requires current or external information. If global config or the per-request option disables web search, `route.webSearchAllowed` is `false` even for HR-eligible topics. If the query does not require current/external info, `route.webSearchAllowed` is `false`. The public `webSearch` field is present only when `route.webSearchAllowed` is `true` and web search actually ran. The consuming app must **never carry `webSearch` results from a prior turn** when the current turn's `webSearchAllowed` is `false`. Prior retrieval, workspace, or web search data from a previous turn must never be rendered when the current turn's gates disable it."
);

writeFileSync('README.md', content, 'utf8');
console.log(`\nREADME.md written (${changed} changes applied).`);
