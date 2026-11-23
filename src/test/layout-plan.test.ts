import { describe, expect, it } from 'vitest';
import { layoutPlanSchema, normalizeLayoutPlan, SCREENSHOT_MAX_BYTES, screenshotFileError } from '@/lib/layout-plan';

const validPlan = {
  screenName: 'Dashboard',
  applicationType: 'Analytics',
  summary: 'A dashboard with a navigation bar and metric cards.',
  confidence: 120,
  canvas: { width: 1200, height: 800, background: '#ffffff' },
  palette: { background: '#ffffff', surface: '#f5f5f5', text: '#202020', mutedText: '#6b6b6b', primary: '#5b5bd6', accent: '#e8e8e8' },
  typography: { fontFamily: 'system-ui', headingSize: 32, bodySize: 16 },
  elements: [{
    id: 'title', kind: 'heading', label: 'Page title', x: -20, y: 20, width: 1400, height: 60,
    text: 'Dashboard', background: null, foreground: '#202020', border: null, radius: null,
    fontSize: 32, fontWeight: 700, align: 'left', zIndex: 1,
  }],
  matchedFeatures: ['Navigation'],
  implementationSteps: ['Build the canvas', 'Add navigation'],
};

describe('screenshot validation', () => {
  it('accepts a PNG at the 8 MB limit', () => {
    expect(screenshotFileError({ type: 'image/png', size: SCREENSHOT_MAX_BYTES })).toBeNull();
  });

  it('rejects unsupported files and images over 8 MB', () => {
    expect(screenshotFileError({ type: 'image/svg+xml', size: 1000 })).toBe('Choose a PNG, JPEG, or WebP screenshot.');
    expect(screenshotFileError({ type: 'image/png', size: SCREENSHOT_MAX_BYTES + 1 })).toBe('Each screenshot must be 8 MB or smaller.');
  });
});

describe('layout plan normalization', () => {
  it('keeps screenshot dimensions and clamps unsafe coordinates and confidence', () => {
    const result = normalizeLayoutPlan(validPlan, { width: 1440, height: 900 });
    expect(result.canvas.width).toBe(1440);
    expect(result.canvas.height).toBe(900);
    expect(result.confidence).toBe(100);
    expect(result.elements[0]?.x).toBe(0);
    expect(result.elements[0]?.width).toBe(1440);
  });

  it('requires nullable element content instead of allowing missing structured fields', () => {
    const invalid = structuredClone(validPlan);
    delete (invalid.elements[0] as Partial<typeof invalid.elements[0]>).text;
    expect(() => layoutPlanSchema.parse(invalid)).toThrow();
  });
});
