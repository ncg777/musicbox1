/**
 * Necklace generation using the FKM algorithm.
 * Generates all unique binary necklaces of length n with k ones.
 */
export function generateNecklaces(n: number, k: number): number[][] {
  const output: number[][] = [];
  const a: number[] = new Array(n + 1).fill(0);

  function subGen(t: number, p: number): void {
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

/**
 * Represents a pitch class set with 12 pitch classes (0-11).
 */
export class Pcs12 {
  private bits: boolean[];
  readonly order: number;
  readonly transpose: number;

  constructor(pitchClasses: Set<number> = new Set(), order: number = 0, transpose: number = 0) {
    this.bits = new Array(12).fill(false);
    for (const pc of pitchClasses) {
      if (pc >= 0 && pc < 12) {
        this.bits[pc] = true;
      }
    }
    this.order = order;
    this.transpose = transpose;
  }

  get(index: number): boolean {
    return this.bits[index] ?? false;
  }

  getK(): number {
    return this.bits.filter(b => b).length;
  }

  asSet(): Set<number> {
    const set = new Set<number>();
    for (let i = 0; i < 12; i++) {
      if (this.bits[i]) {
        set.add(i);
      }
    }
    return set;
  }

  asSequence(): number[] {
    const seq: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (this.bits[i]) {
        seq.push(i);
      }
    }
    return seq;
  }

  getIntervalVector(): number[] {
    const pitches = this.asSequence();
    const iv: number[] = new Array(6).fill(0);
    
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

  rotate(t: number): Pcs12 {
    const newPitches = new Set<number>();
    for (let i = 0; i < 12; i++) {
      if (this.bits[i]) {
        newPitches.add((i + t + 120) % 12);
      }
    }
    return new Pcs12(newPitches, this.order, (this.transpose + t + 12) % 12);
  }

  equals(other: Pcs12): boolean {
    for (let i = 0; i < 12; i++) {
      if (this.bits[i] !== other.bits[i]) {
        return false;
      }
    }
    return true;
  }

  toString(): string {
    return this.bits.map(b => b ? '1' : '0').join('');
  }

  static fromBinaryString(str: string): Pcs12 {
    const set = new Set<number>();
    for (let i = 0; i < str.length && i < 12; i++) {
      if (str[i] === '1') {
        set.add(i);
      }
    }
    return new Pcs12(set);
  }
}

/**
 * Generates all pitch class sets as used in music theory.
 */
export function generateAllPcs12(): Pcs12[] {
  const necklaces = generateNecklaces(12, 2);
  const output: Pcs12[] = [];
  const orderCount: number[] = new Array(12).fill(0);

  // Sort necklaces in reverse order for consistent ordering
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
      const pitches = new Set<number>();
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

  // Add empty set
  output.push(new Pcs12(new Set(), 1, 0));

  return output;
}

function getPeriod(necklace: number[]): number {
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

/**
 * Check if two PCS have different pitch content.
 */
export function pcsDifferent(a: Pcs12, b: Pcs12): boolean {
  return !a.equals(b);
}

/**
 * Check if interval vectors are close (differ by at most 2 positions).
 */
export function pcsCloseIntervalVectors(a: Pcs12, b: Pcs12): boolean {
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

/**
 * Check if interval vectors are equivalent under rotation or reversal.
 */
export function pcsIVEqRotOrRev(a: Pcs12, b: Pcs12): boolean {
  const iva = a.getIntervalVector();
  const ivb = b.getIntervalVector();
  
  const equivalent = (arr1: number[], arr2: number[]): boolean => {
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

/**
 * Check if two PCS share a minimum number of common notes.
 */
export function pcsShareCommonNotes(a: Pcs12, b: Pcs12, minCommon: number): boolean {
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

/**
 * Check if two PCS are allowed to connect in the graph.
 */
export function pcsRelationAllows(a: Pcs12, b: Pcs12): boolean {
  if (!pcsDifferent(a, b)) return false;
  const close = pcsCloseIntervalVectors(a, b) || pcsIVEqRotOrRev(a, b);
  return close && pcsShareCommonNotes(a, b, 1);
}
