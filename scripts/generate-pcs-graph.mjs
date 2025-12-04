// Script to generate precomputed PCS graph data
// Run with: node scripts/generate-pcs-graph.mjs

/**
 * Necklace generation using the FKM algorithm.
 */
function generateNecklaces(n, k) {
  const output = [];
  const a = new Array(n + 1).fill(0);

  function subGen(t, p) {
    if (t > n) {
      if (n % p === 0) {
        const necklace = a.slice(1, n + 1);
        output.push(necklace);
      }
    } else {
      a[t] = a[t - p];
      subGen(t + 1, p);
      for (let j = a[t - p] + 1; j < k; j++) {
        a[t] = j;
        subGen(t + 1, t);
      }
    }
  }

  subGen(1, 1);
  return output;
}

function getPeriod(necklace) {
  const n = necklace.length;
  for (let p = 1; p <= n; p++) {
    if (n % p === 0) {
      let isPeriod = true;
      for (let i = 0; i < n; i++) {
        if (necklace[i] !== necklace[i % p]) {
          isPeriod = false;
          break;
        }
      }
      if (isPeriod) return p;
    }
  }
  return n;
}

class Pcs12 {
  constructor(pitchClasses = new Set(), order = 0, transpose = 0) {
    this.bits = new Array(12).fill(false);
    for (const pc of pitchClasses) {
      if (pc >= 0 && pc < 12) {
        this.bits[pc] = true;
      }
    }
    this.order = order;
    this.transpose = transpose;
  }

  getK() {
    return this.bits.filter(b => b).length;
  }

  asSet() {
    const set = new Set();
    for (let i = 0; i < 12; i++) {
      if (this.bits[i]) {
        set.add(i);
      }
    }
    return set;
  }

  asSequence() {
    const seq = [];
    for (let i = 0; i < 12; i++) {
      if (this.bits[i]) {
        seq.push(i);
      }
    }
    return seq;
  }

  getIntervalVector() {
    const pitches = this.asSequence();
    const iv = new Array(6).fill(0);
    
    for (let i = 0; i < pitches.length; i++) {
      for (let j = i + 1; j < pitches.length; j++) {
        let interval = Math.abs(pitches[j] - pitches[i]);
        if (interval > 6) interval = 12 - interval;
        if (interval > 0 && interval <= 6) {
          iv[interval - 1]++;
        }
      }
    }
    return iv;
  }

  equals(other) {
    for (let i = 0; i < 12; i++) {
      if (this.bits[i] !== other.bits[i]) {
        return false;
      }
    }
    return true;
  }

  toString() {
    return this.bits.map(b => b ? '1' : '0').join('');
  }
}

function generateAllPcs12() {
  const necklaces = generateNecklaces(12, 2);
  const output = [];
  const orderCount = new Array(12).fill(0);

  necklaces.sort((a, b) => {
    for (let i = a.length - 1; i >= 0; i--) {
      if (a[i] !== b[i]) {
        return b[i] - a[i];
      }
    }
    return 0;
  });

  for (const n of necklaces) {
    const period = getPeriod(n);
    const k = n.filter(x => x === 1).length;

    for (let j = 0; j < period; j++) {
      const pitches = new Set();
      for (let i = 0; i < 12; i++) {
        if (n[i] === 1) {
          pitches.add(((12 - (i + 1)) + j) % 12);
        }
      }
      if (pitches.size > 0) {
        output.push(new Pcs12(pitches, orderCount[k - 1] + 1, j));
      }
    }
    if (k > 0) {
      orderCount[k - 1]++;
    }
  }

  output.push(new Pcs12(new Set(), 1, 0));
  return output;
}

function pcsDifferent(a, b) {
  return !a.equals(b);
}

function pcsCloseIntervalVectors(a, b) {
  const iva = a.getIntervalVector();
  const ivb = b.getIntervalVector();
  
  if (iva.length !== ivb.length) return false;
  
  let diffs = 0;
  for (let i = 0; i < iva.length; i++) {
    if (iva[i] !== ivb[i]) {
      diffs++;
      if (diffs > 2) return false;
    }
  }
  return true;
}

function pcsIVEqRotOrRev(a, b) {
  const iva = a.getIntervalVector();
  const ivb = b.getIntervalVector();
  
  const equivalent = (arr1, arr2) => {
    if (arr1.length !== arr2.length) return false;
    for (let r = 0; r < arr1.length; r++) {
      let match = true;
      for (let i = 0; i < arr1.length; i++) {
        if (arr1[(i + r) % arr1.length] !== arr2[i]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    return false;
  };
  
  const reversed = [...iva].reverse();
  return equivalent(iva, ivb) || equivalent(reversed, ivb);
}

function pcsShareCommonNotes(a, b, minCommon) {
  if (a.getK() !== b.getK()) return false;
  
  const setA = a.asSet();
  const setB = b.asSet();
  
  let common = 0;
  for (const pc of setA) {
    if (setB.has(pc)) {
      common++;
      if (common >= minCommon) return true;
    }
  }
  return false;
}

function pcsRelationAllows(a, b) {
  if (!pcsDifferent(a, b)) return false;
  const close = pcsCloseIntervalVectors(a, b) || pcsIVEqRotOrRev(a, b);
  return close && pcsShareCommonNotes(a, b, 1);
}

// Check if a PCS is consonant (interval vector positions 0 and 5 are 0)
function isConsonant(pcs) {
  const iv = pcs.getIntervalVector();
  return iv[0] === 0;
}

// Main
const allChords = generateAllPcs12();
const tetrads = allChords.filter(pcs => pcs.getK() === 4 && isConsonant(pcs));

console.error('Total PCS:', allChords.length);
console.error('Consonant Tetrads (4 notes):', tetrads.length);

const nodes = tetrads.map(pcs => pcs.toString());

const adjacency = nodes.map(() => []);
for (let i = 0; i < tetrads.length; i++) {
  for (let j = i + 1; j < tetrads.length; j++) {
    if (pcsRelationAllows(tetrads[i], tetrads[j])) {
      adjacency[i].push(j);
      adjacency[j].push(i);
    }
  }
}

console.error('Adjacency computed.');

const data = { nodes, adjacency };

// Write directly to file
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'src', 'pcsGraphData.json');
writeFileSync(outputPath, JSON.stringify(data));
console.error('Written to:', outputPath);
