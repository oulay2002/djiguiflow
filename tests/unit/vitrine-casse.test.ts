import { describe, expect, it } from 'vitest';
import { casseDouce } from '@/lib/vitrine/casse';

describe('casseDouce', () => {
  it('adoucit une saisie entièrement en capitales', () => {
    expect(casseDouce('ABIDJAN')).toBe('Abidjan');
    expect(casseDouce('COCODY RIVIERA 2')).toBe('Cocody Riviera 2');
    expect(casseDouce('GRAND-BASSAM')).toBe('Grand-Bassam');
    expect(casseDouce('ÉCOLE')).toBe('École');
  });

  it('laisse intact ce que le marchand a écrit en casse mixte', () => {
    expect(casseDouce('Cocody Riviera 2')).toBe('Cocody Riviera 2');
    expect(casseDouce('II Plateaux')).toBe('II Plateaux');
    expect(casseDouce('abidjan')).toBe('abidjan');
  });

  it('laisse intact un texte sans lettre', () => {
    expect(casseDouce('225')).toBe('225');
    expect(casseDouce('')).toBe('');
  });
});
