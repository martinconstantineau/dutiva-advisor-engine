import { readFileSync, writeFileSync } from 'fs';

let c = readFileSync('README.md', 'utf8');

// Fix: change ```env info string to ```bash (stops markdownlint false-positives on # comments inside block)
const before = c;
c = c.replace(/```env(\r?\n)/g, '```bash$1');

if (c !== before) {
  console.log('Fixed: ```env -> ```bash');
} else {
  console.warn('WARNING: ```env pattern not found');
}

writeFileSync('README.md', c, 'utf8');
console.log('Done.');
