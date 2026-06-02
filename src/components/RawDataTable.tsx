import React from 'react';
import { NormalizedRow } from '../types';
import { formatNumber, formatNumberCompact } from '../utils/format';

interface Props {
	rows: NormalizedRow[];
}

export const RawDataTable: React.FC<Props> = ({ rows }) => {
	if (!rows || rows.length === 0) return <div>No normalized rows to display.</div>;

	return (
		<div style={{ overflowX: 'auto' }}>
			<table style={{ borderCollapse: 'collapse', width: '100%' }}>
				<thead>
					<tr>
						<th>InputLength</th>
						<th>OutputLength</th>
						<th>CachePct</th>
						<th>BatchSize</th>
						<th>Throughput</th>
						<th>UncachedThroughput</th>
						<th>CachedThroughput</th>
						<th>TTFT</th>
						<th>GenSpeed</th>
						<th>RPM</th>
					</tr>
				</thead>
				<tbody>
                    {rows.map((r, i) => (
						<tr key={i}>
						<td>{formatNumber(r.InputLength ?? undefined, 0)}</td>
						<td>{formatNumber(r.OutputLength ?? undefined, 0)}</td>
						<td>{r.CachePct == null ? '-' : `${Math.round((r.CachePct as number) * 100)}%`}</td>
						<td>{formatNumber(r.BatchSize ?? undefined, 0)}</td>
						<td>{r.Throughput == null ? '-' : formatNumberCompact(r.Throughput)}</td>
						<td>{r.UncachedThroughput == null ? '-' : formatNumberCompact(r.UncachedThroughput as number)}</td>
						<td>{r.CachedThroughput == null ? '-' : formatNumberCompact(r.CachedThroughput as number)}</td>
						<td>{r.TTFT == null ? '-' : formatNumber(r.TTFT as number, 1)}</td>
						<td>{r.GenSpeed == null ? '-' : formatNumber(r.GenSpeed as number, 1)}</td>
						<td>{r.RPM == null ? '-' : formatNumber(r.RPM as number, 1)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

export default RawDataTable;
