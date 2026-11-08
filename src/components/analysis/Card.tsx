import type { ReactNode, Ref } from 'react';

/** A titled section of the analysis page, with optional controls on the right. */
export function Card({
  title,
  note,
  controls,
  children,
  className,
  ref,
}: {
  title: string;
  note?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
  ref?: Ref<HTMLElement>;
}) {
  return (
    <section ref={ref} className={className ? `analysis-card ${className}` : 'analysis-card'}>
      <header className="analysis-card__header">
        <div>
          <h2>{title}</h2>
          {note && <p className="analysis-card__note">{note}</p>}
        </div>
        {controls && <div className="analysis-card__controls">{controls}</div>}
      </header>
      {children}
    </section>
  );
}
