import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { screenshotFileError } from './layout-plan';

export const analyzeScreenshot = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error('Upload a screenshot to analyze.');
    const file = input.get('screenshot');
    if (!(file instanceof File)) throw new Error('Upload a screenshot to analyze.');
    const fileError = screenshotFileError(file);
    if (fileError) throw new Error(fileError);
    const width = Number(input.get('width'));
    const height = Number(input.get('height'));
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || width > 12000 || height > 20000) {
      throw new Error('The screenshot dimensions could not be read.');
    }
    return { file, width, height };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) throw new Error('AI layout analysis is not configured yet.');
    const { analyzeScreenshotLayout } = await import('./ai/layout-analysis.server');
    return analyzeScreenshotLayout({
      apiKey,
      file: data.file,
      width: data.width,
      height: data.height,
    });
  });
