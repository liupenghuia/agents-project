import test from 'node:test';
import assert from 'node:assert/strict';
import { httpError } from '../src/http.js';
import { normalizeDomainError, rethrowDomainError } from '../src/domain/errors.js';

test('normalizeDomainError preserves httpError instances', () => {
  const original = httpError(422, 'VALIDATION_ERROR', 'bad');
  assert.equal(normalizeDomainError(original), original);
});

test('normalizeDomainError maps known codes and sentinel messages', () => {
  const mapped = normalizeDomainError({ code: 'BLOCKED', message: 'blocked' });
  assert.equal(mapped.status, 403);
  assert.equal(mapped.code, 'BLOCKED');

  const image = normalizeDomainError(new Error('INVALID_IMAGE_REFERENCES'));
  assert.equal(image.status, 422);
  assert.equal(image.code, 'INVALID_IMAGE_REFERENCES');

  const transition = normalizeDomainError(Object.assign(new Error('INVALID_MARKET_TRANSITION'), {
    currentStatus: 'disabled',
  }));
  assert.equal(transition.status, 409);
  assert.match(transition.message, /disabled/);
});

test('rethrowDomainError throws mapped error', () => {
  assert.throws(
    () => rethrowDomainError({ code: 'VALIDATION_ERROR', message: 'x' }),
    (error) => error.status === 422 && error.code === 'VALIDATION_ERROR',
  );
});
