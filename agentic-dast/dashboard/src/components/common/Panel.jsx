import React from 'react'

export function Panel({
  title,
  subtitle,
  icon,
  badge,
  actions,
  children,
  className = '',
  bodyClassName = 'p-5',
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-slate-900/60 shadow-lg backdrop-blur-md transition-all ${className}`}
    >
      {(title || actions || icon) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/50 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400">
                {icon}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight text-white">{title}</h3>
                {badge && <div className="text-xs">{badge}</div>}
              </div>
              {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}
