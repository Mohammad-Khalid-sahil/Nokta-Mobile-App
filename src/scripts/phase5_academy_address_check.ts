import assert from 'node:assert/strict';
import {
  ACADEMY_ADDRESS,
  isStaleAcademyAddress,
  resolveAcademyAddress
} from '../constants/academyAddress';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

test('canonical English spelling uses Khair Khana', () => {
  assert.match(ACADEMY_ADDRESS.en, /Khair Khana/);
  assert.equal(
    ACADEMY_ADDRESS.en,
    'Afghanistan, Kabul – Khair Khana, First Section'
  );
});

test('Dari and Pashto addresses are set', () => {
  assert.equal(ACADEMY_ADDRESS.fa, 'افغانستان، کابل – حصه اول خیرخانه');
  assert.equal(ACADEMY_ADDRESS.ps, 'افغانستان، کابل – د خیرخانې لومړۍ حصه');
});

test('stale detector catches Tehran/Iran', () => {
  assert.equal(isStaleAcademyAddress('Tehran, Iran'), true);
  assert.equal(isStaleAcademyAddress('تهران، ایران'), true);
  assert.equal(isStaleAcademyAddress(''), true);
  assert.equal(isStaleAcademyAddress(ACADEMY_ADDRESS.en), false);
});

test('resolve backfills empty and stale locales', () => {
  const resolved = resolveAcademyAddress({
    en: 'Tehran, Iran',
    fa: '',
    ps: ACADEMY_ADDRESS.ps
  });
  assert.equal(resolved.en, ACADEMY_ADDRESS.en);
  assert.equal(resolved.fa, ACADEMY_ADDRESS.fa);
  assert.equal(resolved.ps, ACADEMY_ADDRESS.ps);
});

console.log('phase5 academy address checks passed');
