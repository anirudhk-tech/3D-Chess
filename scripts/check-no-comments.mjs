import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'src';
const extensions = ['.ts', '.tsx', '.js', '.mjs', '.css'];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (extensions.some((ext) => entry.name.endsWith(ext))) files.push(path);
  }
  return files;
}

function findComments(source) {
  const found = [];
  const templateStack = [];
  let line = 1;
  let i = 0;
  let mode = 'code';
  let quote = '';
  let braceDepth = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '\n') line++;

    if (mode === 'code') {
      if (ch === '/' && next === '/') {
        if (!(
          source.startsWith('///', i) && /^\/\/\/\s*<reference/.test(source.slice(i, i + 40))
        )) {
          found.push({ line, kind: '//' });
        }
        while (i < source.length && source[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        found.push({ line, kind: '/*' });
        i += 2;
        while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
          if (source[i] === '\n') line++;
          i++;
        }
        i += 2;
        continue;
      }
      if (ch === '/' && /[(,=:[!&|?{};]$|^$/.test(source.slice(0, i).trimEnd().slice(-1))) {
        i++;
        let inClass = false;
        while (i < source.length && source[i] !== '\n' && (inClass || source[i] !== '/')) {
          if (source[i] === '\\') i++;
          else if (source[i] === '[') inClass = true;
          else if (source[i] === ']') inClass = false;
          i++;
        }
      } else if (ch === "'" || ch === '"') {
        mode = 'string';
        quote = ch;
      } else if (ch === '`') {
        mode = 'template';
      } else if (ch === '{') {
        braceDepth++;
      } else if (ch === '}') {
        if (templateStack.length > 0 && templateStack[templateStack.length - 1] === braceDepth) {
          templateStack.pop();
          mode = 'template';
        } else {
          braceDepth--;
        }
      }
    } else if (mode === 'string') {
      if (ch === '\\') i++;
      else if (ch === quote || ch === '\n') mode = 'code';
    } else {
      if (ch === '\\') {
        if (next === '\n') line++;
        i++;
      } else if (ch === '`') {
        mode = 'code';
      } else if (ch === '$' && next === '{') {
        templateStack.push(braceDepth);
        mode = 'code';
        i++;
      }
    }
    i++;
  }
  return found;
}

let total = 0;
for (const file of walk(root)) {
  for (const { line, kind } of findComments(readFileSync(file, 'utf8'))) {
    console.error(`${file}:${line} contains a ${kind} comment`);
    total++;
  }
}

if (total > 0) {
  console.error(`${total} comment(s) found`);
  process.exit(1);
}
