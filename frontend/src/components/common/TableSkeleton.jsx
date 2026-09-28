import React from 'react';

/**
 * Reusable animated table skeleton loader for banking data grids.
 * Mitigates Cumulative Layout Shift (CLS) and provides polished visual feedback.
 *
 * @component
 * @param {Object} props - Component properties.
 * @param {number} [props.rows=5] - Number of skeleton rows to render.
 * @param {number} [props.columns=6] - Number of columns per row.
 * @returns {JSX.Element} Rendered table rows skeleton.
 */
export const TableSkeleton = ({ rows = 5, columns = 6 }) => {
  return (
    <tbody className="divide-y divide-slate-100 bg-white">
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={`skeleton-row-${rIdx}`} className="animate-pulse">
          {Array.from({ length: columns }).map((_, cIdx) => (
            <td key={`skeleton-col-${cIdx}`} className="px-6 py-4 whitespace-nowrap">
              <div
                className={`h-4 bg-slate-200/80 rounded-md ${
                  cIdx === 0
                    ? 'w-16'
                    : cIdx === 1
                    ? 'w-36'
                    : cIdx === columns - 1
                    ? 'w-20 ml-auto'
                    : 'w-24'
                }`}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
};

export default TableSkeleton;
