import { ArmIconButton } from "@/shared/ui/arm";
import type { IncidentPaginationProps } from "../types/IncidentPagination";
export function IncidentPagination({
  page,
  pages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: IncidentPaginationProps) {
  return (
    <div className="arm-journal-pagination">
      <label>
        Страница:{" "}
        <select
          aria-label="Страница"
          value={page}
          onChange={(e) => onPageChange(Number(e.target.value))}
        >
          {Array.from({ length: pages }, (_, index) => (
            <option value={index} key={index}>
              {index + 1}
            </option>
          ))}
        </select>
      </label>
      <label>
        Записей на странице:{" "}
        <select
          aria-label="Записей на странице"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {[10, 25, 50].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </select>
      </label>
      <strong>
        {total ? page * pageSize + 1 : 0}-
        {Math.min((page + 1) * pageSize, total)} из {total}
      </strong>
      <ArmIconButton
        icon="left"
        label="Предыдущая страница"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      />
      <ArmIconButton
        icon="right"
        label="Следующая страница"
        disabled={page >= pages - 1}
        onClick={() => onPageChange(page + 1)}
      />
    </div>
  );
}
