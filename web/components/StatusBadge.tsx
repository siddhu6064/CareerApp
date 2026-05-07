import { STATUS_LABEL, type ApplicationStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
