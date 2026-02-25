interface PaginationBarProps {
  /** 0-based page index */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PaginationBar({ page, totalPages, onPageChange }: PaginationBarProps) {
  return (
    <div class="pagination">
      <button
        disabled={page === 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
      >
        Prev
      </button>
      <span>
        Page {page + 1} of {totalPages}
      </span>
      <button
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
      >
        Next
      </button>
    </div>
  );
}
