const fs = require('fs');

const content = fs.readFileSync('toki-mcp-server.ts', 'utf-8');
const lines = content.split('\n');

let toolCount = 0;
let inTool = false;
let toolStartLine = 0;
let braceDepth = 0;
let currentToolContent = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.includes('server.tool(')) {
    toolCount++;
    inTool = true;
    toolStartLine = i + 1;
    braceDepth = 0;
    currentToolContent = line;
  }
  
  if (inTool) {
    currentToolContent += '\n' + line;
    
    // Count braces
    for (let char of line) {
      if (char === '{' || char === '(') braceDepth++;
      if (char === '}' || char === ')') braceDepth--;
    }
    
    // If we've completed this tool registration, extract info
    if (braceDepth === 0 && inTool && line.includes('async')) {
      // Simple extraction
      const match = currentToolContent.match(/server\.tool\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/);
      if (match) {
        console.log(`Tool ${toolCount}: ${match[1]} (line ${toolStartLine})`);
      }
      inTool = false;
    }
  }
}

console.log(`\nTotal tools found: ${toolCount}`);
