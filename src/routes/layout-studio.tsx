import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CloudUpload,
  Download,
  Image as ImageIcon,
  Layers3,
  ListChecks,
  LoaderCircle,
  Palette,
  ScanSearch,
  ShieldCheck,
  Trash2,
  Type,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayoutPreview } from '@/components/layout-preview';
import { PageHeading, pageMeta, useUser } from '@/components/lostlink';
import { analyzeScreenshot } from '@/lib/layout.functions';
import type { LayoutPlan } from '@/lib/layout-plan';

export const Route = createFileRoute('/layout-studio')({
  head: () => pageMeta('AI screenshot layout studio', 'Upload application screenshots and turn each one into a visual layout with a structured AI match plan.'),
  component: LayoutStudio,
});

type AnalysisStatus = 'ready' | 'analyzing' | 'done' | 'error';
type StudioItem = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  status: AnalysisStatus;
  plan: LayoutPlan | null;
  error: string | null;
};

function imageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('The image could not be read.'));
    image.src = url;
  });
}

const statusLabel: Record<AnalysisStatus, string> = {
  ready: 'Ready',
  analyzing: 'Analyzing',
  done: 'Matched',
  error: 'Needs attention',
};

function LayoutStudio() {
  const { user, ready } = useUser();
  const analyze = useServerFn(analyzeScreenshot);
  const [items, setItems] = useState<StudioItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const itemsRef = useRef<StudioItem[]>([]);
  const selected = items.find(item => item.id === selectedId) ?? items[0] ?? null;

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => {
    itemsRef.current.forEach(item => URL.revokeObjectURL(item.url));
  }, []);

  async function addFiles(fileList: FileList | File[]) {
    if (processing) return;
    const files = Array.from(fileList);
    if (!files.length) return;
    const accepted: StudioItem[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const { screenshotFileError } = await import('@/lib/layout-plan');
      const validationError = screenshotFileError(file);
      if (validationError) {
        errors.push(`${file.name}: ${validationError}`);
        continue;
      }
      const url = URL.createObjectURL(file);
      try {
        const dimensions = await imageDimensions(url);
        accepted.push({
          id: crypto.randomUUID(),
          file,
          url,
          ...dimensions,
          status: 'ready',
          plan: null,
          error: null,
        });
      } catch {
        URL.revokeObjectURL(url);
        errors.push(`${file.name}: The image could not be read.`);
      }
    }

    if (accepted.length) {
      setItems(current => [...current, ...accepted]);
      setSelectedId(current => current ?? accepted[0]!.id);
    }
    setUploadError(errors.length ? errors.join(' ') : null);
  }

  async function performAnalysis(item: StudioItem) {
    setItems(current => current.map(candidate => candidate.id === item.id
      ? { ...candidate, status: 'analyzing', error: null }
      : candidate));
    const payload = new FormData();
    payload.append('screenshot', item.file);
    payload.append('width', String(item.width));
    payload.append('height', String(item.height));
    try {
      const plan = await analyze({ data: payload });
      setItems(current => current.map(candidate => candidate.id === item.id
        ? { ...candidate, status: 'done', plan, error: null }
        : candidate));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'We could not analyze this screenshot. Try again.';
      setItems(current => current.map(candidate => candidate.id === item.id
        ? { ...candidate, status: 'error', error: message }
        : candidate));
      return false;
    }
  }

  async function analyzeOne(id: string) {
    const item = items.find(candidate => candidate.id === id);
    if (!item || processing) return;
    setProcessing(true);
    await performAnalysis(item);
    setProcessing(false);
  }

  async function analyzeAll() {
    if (processing) return;
    setProcessing(true);
    for (const item of items) {
      if (item.status === 'done') continue;
      const succeeded = await performAnalysis(item);
      if (!succeeded) break;
    }
    setProcessing(false);
  }

  function removeItem(id: string) {
    if (processing) return;
    const target = items.find(item => item.id === id);
    if (target) URL.revokeObjectURL(target.url);
    const remaining = items.filter(item => item.id !== id);
    setItems(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
  }

  function downloadPlan(item: StudioItem) {
    if (!item.plan) return;
    const blob = new Blob([JSON.stringify({ sourceFile: item.file.name, matchPlan: item.plan }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${item.file.name.replace(/\.[^.]+$/, '')}-match-plan.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="content studio-page">
      <PageHeading
        eyebrow="AI screenshot workshop"
        title="Screenshot to interface."
        subtitle="Upload an application screen. Lovable AI maps its visual system into a working layout and a structured match plan."
      />

      {!ready ? (
        <div className="studio-loading"><LoaderCircle className="spin" /> Checking your account…</div>
      ) : !user ? (
        <div className="empty-state studio-auth">
          <span className="empty-icon"><ScanSearch /></span>
          <h2>Sign in to create layouts.</h2>
          <p>Your screenshots stay in this session and are analyzed only when you ask.</p>
          <Button asChild><Link to="/auth">Sign in to open the studio</Link></Button>
        </div>
      ) : (
        <>
          <section className="studio-upload-panel" aria-label="Screenshot uploads">
            <label
              className={`studio-dropzone ${processing ? 'is-disabled' : ''}`}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                if (!processing) void addFiles(event.dataTransfer.files);
              }}
            >
              <span className="studio-upload-icon"><CloudUpload /></span>
              <strong>Drop application screenshots here</strong>
              <span>or choose PNG, JPEG, or WebP files up to 8 MB each</span>
              <span className="studio-browse-label">Choose screenshots</span>
              <input
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={processing}
                aria-label="Upload application screenshots"
                onChange={event => {
                  if (event.target.files) void addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
            <div className="studio-privacy">
              <ShieldCheck size={16} />
              <span>No permanent storage. Each screenshot uses one AI request when analyzed.</span>
            </div>
          </section>

          {uploadError && <p className="studio-error" role="alert"><AlertCircle size={17} />{uploadError}</p>}

          {items.length > 0 && (
            <>
              <div className="studio-toolbar">
                <div>
                  <strong>{items.length} {items.length === 1 ? 'screenshot' : 'screenshots'}</strong>
                  <span>{items.filter(item => item.status === 'done').length} matched</span>
                </div>
                <Button onClick={() => void analyzeAll()} disabled={processing || items.every(item => item.status === 'done')}>
                  {processing ? <LoaderCircle className="spin" /> : <WandSparkles />}
                  {processing ? 'Analyzing…' : items.some(item => item.status === 'done') ? 'Analyze remaining' : 'Analyze all'}
                </Button>
              </div>

              <div className="screenshot-strip" aria-label="Uploaded screenshots">
                {items.map((item, index) => (
                  <button
                    key={item.id}
                    className={`screenshot-tab ${selected?.id === item.id ? 'is-selected' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={selected?.id === item.id}
                  >
                    <span className="screenshot-thumb"><img src={item.url} alt="" /></span>
                    <span className="screenshot-tab-copy">
                      <strong>{index + 1}. {item.file.name}</strong>
                      <span className={`analysis-status is-${item.status}`}>
                        {item.status === 'analyzing' ? <LoaderCircle className="spin" /> : item.status === 'done' ? <CheckCircle2 /> : item.status === 'error' ? <AlertCircle /> : <ImageIcon />}
                        {statusLabel[item.status]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {selected && (
                <section className="studio-result" aria-live="polite">
                  <div className="studio-result-heading">
                    <div>
                      <span className="eyebrow">Selected screenshot</span>
                      <h2>{selected.plan?.screenName ?? selected.file.name}</h2>
                      <p>{selected.width} × {selected.height} pixels · {selected.file.name}</p>
                    </div>
                    <div className="studio-result-actions">
                      {selected.plan && <Button variant="outline" onClick={() => downloadPlan(selected)}><Download />Download plan</Button>}
                      <Button variant="outline" onClick={() => void analyzeOne(selected.id)} disabled={processing}>
                        {selected.status === 'analyzing' ? <LoaderCircle className="spin" /> : <WandSparkles />}
                        {selected.status === 'error' ? 'Retry analysis' : selected.plan ? 'Analyze again' : 'Create match plan'}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${selected.file.name}`} onClick={() => removeItem(selected.id)} disabled={processing}><Trash2 /></Button>
                    </div>
                  </div>

                  {selected.error && <p className="studio-error" role="alert"><AlertCircle size={17} />{selected.error}</p>}

                  <div className="studio-compare-grid">
                    <figure className="studio-figure">
                      <figcaption><span>01</span>Original screenshot</figcaption>
                      <div className="comparison-frame"><img src={selected.url} alt={`Original ${selected.file.name}`} /></div>
                    </figure>
                    <figure className="studio-figure">
                      <figcaption><span>02</span>Matched application layout</figcaption>
                      <div className="comparison-frame generated-frame">
                        {selected.status === 'analyzing' ? (
                          <div className="generated-empty"><LoaderCircle className="spin" /><strong>Reading the interface</strong><span>Mapping hierarchy, spacing, type, and color…</span></div>
                        ) : selected.plan ? (
                          <LayoutPreview plan={selected.plan} />
                        ) : (
                          <div className="generated-empty"><ScanSearch /><strong>Your matched layout appears here</strong><span>Select “Create match plan” to analyze this screenshot.</span></div>
                        )}
                      </div>
                    </figure>
                  </div>

                  {selected.plan && (
                    <div className="match-plan">
                      <div className="match-plan-overview">
                        <div>
                          <span className="eyebrow">Structured match plan</span>
                          <h3>{selected.plan.applicationType}</h3>
                          <p>{selected.plan.summary}</p>
                        </div>
                        <span className="confidence-badge"><Check />{selected.plan.confidence}% visual confidence</span>
                      </div>

                      <div className="plan-detail-grid">
                        <section className="plan-card">
                          <h3><Palette />Visual system</h3>
                          <div className="palette-list">
                            {Object.entries(selected.plan.palette).map(([name, value]) => (
                              <div key={name}><span className="palette-swatch" style={{ background: value }} /><span>{name.replace(/([A-Z])/g, ' $1')}</span><code>{value}</code></div>
                            ))}
                          </div>
                          <div className="type-note"><Type /><span><strong>{selected.plan.typography.fontFamily}</strong>{selected.plan.typography.headingSize}px headings · {selected.plan.typography.bodySize}px body</span></div>
                        </section>

                        <section className="plan-card">
                          <h3><ListChecks />Matched features</h3>
                          <ul className="feature-checklist">
                            {selected.plan.matchedFeatures.map(feature => <li key={feature}><Check />{feature}</li>)}
                          </ul>
                        </section>
                      </div>

                      <section className="plan-card element-inventory">
                        <h3><Layers3 />Component map <span>{selected.plan.elements.length} elements</span></h3>
                        <div className="element-list">
                          {selected.plan.elements.map(element => (
                            <div key={element.id} className="element-row">
                              <span className="element-kind">{element.kind}</span>
                              <strong>{element.label}</strong>
                              <span>{Math.round(element.width)} × {Math.round(element.height)}</span>
                              <span>x {Math.round(element.x)} · y {Math.round(element.y)}</span>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="plan-card implementation-plan">
                        <h3><WandSparkles />Implementation sequence</h3>
                        <ol>{selected.plan.implementationSteps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
                      </section>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
