import React from 'react'

export function Table({
  headers = [],
  children,
  emptyMessage = 'No records found',
  isEmpty = false,
  className = '',
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-800 bg-slate-950/40 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <tr>
            {headers.map((h, idx) => (
              <th key={idx} className="py-2.5 px-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
          {isEmpty ? (
            <tr>
              <td colSpan={headers.length || 1} className="py-8 text-center text-xs text-slate-500 font-sans">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  )
}
