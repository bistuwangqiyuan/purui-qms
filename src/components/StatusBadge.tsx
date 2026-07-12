import type { BatchStatus } from '../../shared/types';
import { STATUS_NAMES } from '../../shared/types';

const COLORS: Record<BatchStatus, string> = {
  pending_inspection: 'blue',
  pending_review: 'amber',
  accepted: 'green',
  rejected_return: 'red',
  rejected_sort: 'red',
  concession: 'violet',
};

export default function StatusBadge({ status }: { status: BatchStatus }) {
  return <span className={`badge ${COLORS[status]}`}>{STATUS_NAMES[status]}</span>;
}
