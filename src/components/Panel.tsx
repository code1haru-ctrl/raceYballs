import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  eyebrow?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}

export function Panel({
  title,
  eyebrow,
  icon,
  action,
  className = '',
  children,
}: PanelProps) {
  return (
    <section className={`panel p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="mt-1 flex items-center gap-2 font-display text-base font-semibold tracking-tight text-ink">
            {icon}
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}
