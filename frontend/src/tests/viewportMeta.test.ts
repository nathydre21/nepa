import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const INDEX_HTML_PATH = resolve(__dirname, '../../index.html');
const EXPECTED_VIEWPORT_CONTENT =
  'width=device-width, initial-scale=1.0, maximum-scale=5.0';

function getViewportMetaTags(html: string): string[] {
  const matches = html.match(/<meta\s+[^>]*name=["']viewport["'][^>]*>/gi) ?? [];
  return matches;
}

function getViewportContent(tag: string): string | null {
  const match = tag.match(/content=["']([^"']*)["']/i);
  return match ? match[1] : null;
}

describe('frontend/index.html viewport meta tag', () => {
  let html: string;

  beforeAll(() => {
    expect(existsSync(INDEX_HTML_PATH)).toBe(true);
    html = readFileSync(INDEX_HTML_PATH, 'utf-8');
  });

  test('index.html is non-empty', () => {
    expect(html.trim().length).toBeGreaterThan(0);
  });

  test('contains exactly one viewport meta tag', () => {
    const tags = getViewportMetaTags(html);
    expect(tags).toHaveLength(1);
  });

  test('viewport content matches mobile-responsive settings', () => {
    const tags = getViewportMetaTags(html);
    const content = getViewportContent(tags[0]);

    expect(content).not.toBeNull();
    expect(content).not.toBe('');
    expect(content).toBe(EXPECTED_VIEWPORT_CONTENT);
  });

  test('viewport allows pinch zoom (maximum-scale is 5.0, not locked to 1.0)', () => {
    const tags = getViewportMetaTags(html);
    const content = getViewportContent(tags[0]) ?? '';

    expect(content).toContain('maximum-scale=5.0');
    expect(content).not.toContain('maximum-scale=1.0');
    expect(content).not.toContain('user-scalable=no');
  });

  test('handles empty / missing content as failure (edge case)', () => {
    const emptyHtml = '<html><head><meta name="viewport"></head></html>';
    const tags = getViewportMetaTags(emptyHtml);
    expect(tags).toHaveLength(1);
    expect(getViewportContent(tags[0])).toBeNull();

    const blankContentHtml =
      '<html><head><meta name="viewport" content=""></head></html>';
    const blankTags = getViewportMetaTags(blankContentHtml);
    expect(getViewportContent(blankTags[0])).toBe('');
  });

  test('detects duplicate viewport tags as invalid', () => {
    const duplicateHtml = `
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
    `;
    expect(getViewportMetaTags(duplicateHtml).length).toBeGreaterThan(1);
    expect(getViewportMetaTags(html)).toHaveLength(1);
  });
});
