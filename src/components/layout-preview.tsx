import { Image as ImageIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { LayoutElement, LayoutPlan } from '@/lib/layout-plan';

function elementText(element: LayoutElement) {
  if (['container', 'card', 'list', 'form', 'divider'].includes(element.kind)) return null;
  if (element.kind === 'image') {
    return <><ImageIcon aria-hidden="true" /><span>{element.text || element.label}</span></>;
  }
  return element.text;
}

export function LayoutPreview({ plan }: { plan: LayoutPlan }) {
  const { width, height } = plan.canvas;
  return (
    <div
      className="generated-canvas"
      role="img"
      aria-label={`Generated layout for ${plan.screenName}`}
      style={{
        aspectRatio: `${width} / ${height}`,
        background: plan.canvas.background,
        color: plan.palette.text,
        fontFamily: plan.typography.fontFamily,
      }}
    >
      {plan.elements.map(element => {
        const fontSize = element.fontSize ?? plan.typography.bodySize;
        const style: CSSProperties = {
          left: `${element.x / width * 100}%`,
          top: `${element.y / height * 100}%`,
          width: `${element.width / width * 100}%`,
          height: `${element.height / height * 100}%`,
          background: element.background ?? 'transparent',
          color: element.foreground ?? plan.palette.text,
          border: element.border ? `1px solid ${element.border}` : '0 solid transparent',
          borderRadius: element.radius ?? 0,
          fontSize: `${fontSize / width * 100}cqw`,
          fontWeight: element.fontWeight ?? 400,
          textAlign: element.align ?? 'left',
          zIndex: element.zIndex,
        };
        return (
          <div key={element.id} className={`generated-element generated-${element.kind}`} style={style} title={element.label}>
            {elementText(element)}
          </div>
        );
      })}
    </div>
  );
}
