import { describe, expect, it } from 'vitest';
import { nextCloneTemplateName } from './meta-sample-templates';

describe('nextCloneTemplateName', () => {
  it('rewrites Meta sample names to a writable vsmart_ name', () => {
    expect(nextCloneTemplateName('jaspers_market_plain_text_v1', [])).toBe(
      'vsmart_market_plain_text_v1',
    );
  });

  it('keeps a custom preferred name when free', () => {
    expect(nextCloneTemplateName('summer_promo', ['other'])).toBe(
      'summer_promo',
    );
  });

  it('suffixes when the preferred name is taken', () => {
    expect(
      nextCloneTemplateName('summer_promo', ['summer_promo', 'summer_promo_v2']),
    ).toBe('summer_promo_v3');
  });
});
