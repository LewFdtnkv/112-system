export interface IncidentPaginationProps {
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}
