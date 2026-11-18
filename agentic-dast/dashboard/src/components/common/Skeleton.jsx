import React from 'react'

export function Skeleton({ className = 'h-4 w-full', rounded = 'rounded-md' }) {
  return (
    <div
      className={`animate-pulse bg-slate-800/60 border border-slate-700/20 ${rounded} ${className}`}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

export function SkeletonTableRow({ cols = 5 }) {
  return (
    <tr className="animate-pulse border-b border-slate-800/40">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 px-3">
          <Skeleton className="h-3.5 w-full max-w-[120px]" />
        </td>
      ))}
    </tr>
  )
}
