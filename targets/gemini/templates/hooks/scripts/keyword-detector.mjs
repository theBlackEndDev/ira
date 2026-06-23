import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

try {
  const input = readFileSync('/dev/stdin', 'utf-8');
  const data = JSON.parse(input);
  const prompt = data.prompt || '';
  const cwd = data.cwd || process.env.GEMINI_PROJECT_DIR || process.cwd();
  const sessionId = data.session_id || 'unknown';

  if (!prompt || typeof prompt !== 'string') {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  // Sanitize: strip XML tags, URLs, code blocks
  let sanitized = prompt
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .trim()
    .toLowerCase();

  // Check for informational intent — questions about keywords should not trigger
  const informationalPatterns = [
    /what\s+is\s+\w+/,
    /how\s+does\s+\w+\s+work/,
    /explain\s+\w+/,
    /tell\s+me\s+about\s+\w+/,
    /describe\s+\w+/,
    /define\s+\w+/,
  ];

  const isInformational = informationalPatterns.some(p => p.test(sanitized));

  // Keyword definitions with patterns
  const keywords = [
    { name: 'CANCEL',        pattern: /\b(cancel|abort|stop|quit|exit)\s+(autopilot|ultrawork|mode)\b/ },
    { name: 'AUTOPILOT',     pattern: /\bautopilot\b/, stateful: true },
    { name: 'ULTRAWORK',     pattern: /\bultrawork\b/, stateful: true },
    { name: 'COUNCIL',       pattern: /\bcouncil\b/ },
    { name: 'RED-TEAM',      pattern: /\bred[\s-]?team\b/ },
    { name: 'RESEARCH',      pattern: /\bresearch\b/ },
    { name: 'ARCHITECT-PLAN', pattern: /\bplan\b/ },
    { name: 'ANALYZE',       pattern: /\banalyze\b/ },
    { name: 'REVIEW',        pattern: /\breview\b/ },
    { name: 'BRAINSTORM',    pattern: /\bbrainstorm\b/ },
    { name: 'ANTI-SLOP',     pattern: /\banti[\s-]?slop\b/ },
    { name: 'BUILD',         pattern: /\bbuild\b/ },
  ];

  // Complexity classification signals
  const complexitySignals = {
    comprehensive: [/full\s+system/, /end[\s-]to[\s-]end/, /comprehensive/, /complete\s+rewrite/, /entire\s+/],
    deep:          [/deep\s+dive/, /thorough/, /detailed\s+analysis/, /investigate/, /debug/],
    standard:      [/create/, /implement/, /add\s+feature/, /update/, /refactor/],
    simple:        [/fix/, /tweak/, /rename/, /typo/, /small\s+change/],
  };

  function classifyComplexity(text) {
    for (const [level, patterns] of Object.entries(complexitySignals)) {
      if (patterns.some(p => p.test(text))) return level;
    }
    return 'standard';
  }

  // Find highest-priority matching keyword
  let matched = null;
  for (const kw of keywords) {
    if (kw.pattern.test(sanitized)) {
      if (isInformational && kw.name !== 'CANCEL') continue;
      matched = kw;
      break;
    }
  }

  if (!matched) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const complexity = classifyComplexity(sanitized);
  const stateDir = join(cwd, '.gira', 'state');

  // Handle cancel
  if (matched.name === 'CANCEL') {
    const modeMatch = sanitized.match(/\b(autopilot|ultrawork)\b/);
    if (modeMatch) {
      const stateFile = join(stateDir, `${modeMatch[1]}-state.json`);
      if (existsSync(stateFile)) {
        writeFileSync(stateFile, JSON.stringify({ active: false, cancelledAt: new Date().toISOString() }));
      }
    }
    console.log(JSON.stringify({
      hookSpecificOutput: {
        additionalContext: `[GIRA KEYWORD: CANCEL] Mode ${modeMatch ? modeMatch[1] : 'unknown'} cancelled by user.`
      }
    }));
    process.exit(0);
  }

  // Create state for stateful modes
  if (matched.stateful) {
    mkdirSync(stateDir, { recursive: true });
    const stateFile = join(stateDir, `${matched.name.toLowerCase()}-state.json`);
    const state = {
      active: true,
      keyword: matched.name,
      sessionId,
      startedAt: new Date().toISOString(),
      iteration: 0,
      maxIterations: 10,
      complexity,
      prompt: prompt.slice(0, 500),
    };
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }

  const output = {
    hookSpecificOutput: {
      additionalContext: `[GIRA KEYWORD: ${matched.name}] Complexity: ${complexity}. Original prompt: "${prompt.slice(0, 200)}"`
    }
  };

  console.log(JSON.stringify(output));
} catch (err) {
  console.log(JSON.stringify({}));
}

process.exit(0);
