import React from 'react';
import { NormalizedRow } from '../types';
import { formatNumber, formatNumberCompact } from '../utils/format';

interface Props {
	rows: NormalizedRow[];
}

export const RawDataTable: React.FC<Props> = ({ rows }) => {
	if (!rows || rows.length === 0) return <div>No normalized rows to display.</div>;

	const cellStyle: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' };
	const headerStyle: React.CSSProperties = { ...cellStyle, textAlign: 'left', fontWeight: 700, background: '#fafafa' };

	return (
		<div style={{ overflowX: 'auto' }}>
			<table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 880 }}>
				<thead>
					<tr>
						<th style={headerStyle}>InputLength</th>
						<th style={headerStyle}>OutputLength</th>
						<th style={headerStyle}>CachePct</th>
						<th style={headerStyle}>BatchSize</th>
						<th style={headerStyle}>Throughput</th>
						<th style={headerStyle}>UncachedThroughput</th>
						<th style={headerStyle}>CachedThroughput</th>
						<th style={headerStyle}>TTFT</th>
						<th style={headerStyle}>GenSpeed</th>
						<th style={headerStyle}>RPM</th>
					</tr>
				</thead>
				<tbody>
                    {rows.map((r, i) => (
						<tr key={i}>
						<td style={cellStyle}>{formatNumber(r.InputLength ?? undefined, 0)}</td>
						<td style={cellStyle}>{formatNumber(r.OutputLength ?? undefined, 0)}</td>
						<td style={cellStyle}>{r.CachePct == null ? '-' : `${Math.round((r.CachePct as number) * 100)}%`}</td>
						<td style={cellStyle}>{formatNumber(r.BatchSize ?? undefined, 0)}</td>
						<td style={cellStyle}>{r.Throughput == null ? '-' : formatNumberCompact(r.Throughput)}</td>
						<td style={cellStyle}>{r.UncachedThroughput == null ? '-' : formatNumberCompact(r.UncachedThroughput as number)}</td>
						<td style={cellStyle}>{r.CachedThroughput == null ? '-' : formatNumberCompact(r.CachedThroughput as number)}</td>
						<td style={cellStyle}>{r.TTFT == null ? '-' : formatNumber(r.TTFT as number, 1)}</td>
						<td style={cellStyle}>{r.GenSpeed == null ? '-' : formatNumber(r.GenSpeed as number, 1)}</td>
						<td style={cellStyle}>{r.RPM == null ? '-' : formatNumber(r.RPM as number, 1)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

export default RawDataTable;
