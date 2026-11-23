import { z } from 'zod';

export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
export const SCREENSHOT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

const color = z.string().nullable();

export const layoutPlanSchema = z.object({
  screenName: z.string(),
  applicationType: z.string(),
  summary: z.string(),
  confidence: z.number(),
  canvas: z.object({
    width: z.number(),
    height: z.number(),
    background: z.string(),
  }),
  palette: z.object({
    background: z.string(),
    surface: z.string(),
    text: z.string(),
    mutedText: z.string(),
    primary: z.string(),
    accent: z.string(),
  }),
  typography: z.object({
    fontFamily: z.string(),
    headingSize: z.number(),
    bodySize: z.number(),
  }),
  elements: z.array(z.object({
    id: z.string(),
    kind: z.enum(['container', 'navigation', 'heading', 'text', 'button', 'input', 'image', 'card', 'list', 'form', 'footer', 'icon', 'divider']),
    label: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    text: z.string().nullable(),
    background: color,
    foreground: color,
    border: color,
    radius: z.number().nullable(),
    fontSize: z.number().nullable(),
    fontWeight: z.number().nullable(),
    align: z.enum(['left', 'center', 'right']).nullable(),
    zIndex: z.number(),
  })),
  matchedFeatures: z.array(z.string()),
  implementationSteps: z.array(z.string()),
});

export type LayoutPlan = z.infer<typeof layoutPlanSchema>;
export type LayoutElement = LayoutPlan['elements'][number];

export function screenshotFileError(file: { type: string; size: number }) {
  if (!SCREENSHOT_MIME_TYPES.includes(file.type as (typeof SCREENSHOT_MIME_TYPES)[number])) {
    return 'Choose a PNG, JPEG, or WebP screenshot.';
  }
  if (file.size <= 0) return 'This file is empty.';
  if (file.size > SCREENSHOT_MAX_BYTES) return 'Each screenshot must be 8 MB or smaller.';
  return null;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const clean = (value: string, fallback: string, maximum: number) => value.trim().slice(0, maximum) || fallback;
const validColor = (value: string | null, fallback: string | null = null) => (
  value && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value.trim()) ? value.trim() : fallback
);

export function normalizeLayoutPlan(input: unknown, expected?: { width: number; height: number }): LayoutPlan {
  const plan = layoutPlanSchema.parse(input);
  const palette = {
    background: validColor(plan.palette.background, '#FFFFFF')!,
    surface: validColor(plan.palette.surface, '#F5F5F5')!,
    text: validColor(plan.palette.text, '#202020')!,
    mutedText: validColor(plan.palette.mutedText, '#6B6B6B')!,
    primary: validColor(plan.palette.primary, '#5B5BD6')!,
    accent: validColor(plan.palette.accent, '#E8E8E8')!,
  };
  const width = expected?.width ?? clamp(Math.round(finite(plan.canvas.width, 1200)), 320, 12000);
  const height = expected?.height ?? clamp(Math.round(finite(plan.canvas.height, 800)), 320, 20000);

  return {
    screenName: clean(plan.screenName, 'Matched screen', 100),
    applicationType: clean(plan.applicationType, 'Application', 100),
    summary: clean(plan.summary, 'A visual reconstruction of the uploaded screenshot.', 800),
    confidence: Math.round(clamp(finite(plan.confidence, 0), 0, 100)),
    canvas: {
      width,
      height,
      background: validColor(plan.canvas.background, palette.background)!,
    },
    palette,
    typography: {
      fontFamily: clean(plan.typography.fontFamily, 'system-ui', 80),
      headingSize: clamp(finite(plan.typography.headingSize, 32), 8, 120),
      bodySize: clamp(finite(plan.typography.bodySize, 16), 6, 64),
    },
    elements: plan.elements.slice(0, 80).map((element, index) => {
      const x = clamp(finite(element.x, 0), 0, width - 1);
      const y = clamp(finite(element.y, 0), 0, height - 1);
      return {
        ...element,
        id: `${clean(element.id, 'element', 60)}-${index + 1}`,
        label: clean(element.label, `Element ${index + 1}`, 120),
        x,
        y,
        width: clamp(finite(element.width, 1), 1, width - x),
        height: clamp(finite(element.height, 1), 1, height - y),
        text: element.text === null ? null : clean(element.text, '', 500),
        background: validColor(element.background),
        foreground: validColor(element.foreground),
        border: validColor(element.border),
        radius: element.radius === null ? null : clamp(finite(element.radius, 0), 0, 100),
        fontSize: element.fontSize === null ? null : clamp(finite(element.fontSize, plan.typography.bodySize), 6, 120),
        fontWeight: element.fontWeight === null ? null : Math.round(clamp(finite(element.fontWeight, 400), 100, 900)),
        zIndex: Math.round(clamp(finite(element.zIndex, index), 0, 100)),
      };
    }),
    matchedFeatures: plan.matchedFeatures.map(feature => clean(feature, '', 180)).filter(Boolean).slice(0, 12),
    implementationSteps: plan.implementationSteps.map(step => clean(step, '', 240)).filter(Boolean).slice(0, 8),
  };
}
