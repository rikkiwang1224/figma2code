const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
const srcSkills = path.join(packageRoot, 'src', 'skills');
const distClaudeSkills = path.join(packageRoot, 'dist', '.claude', 'skills');

if (!fs.existsSync(srcSkills)) {
  console.log('[copy-claude-skills] src/skills not found, skip');
  process.exit(0);
}

fs.mkdirSync(path.dirname(distClaudeSkills), { recursive: true });
fs.cpSync(srcSkills, distClaudeSkills, { recursive: true });
console.log('[copy-claude-skills] copied src/skills to dist/.claude/skills');
