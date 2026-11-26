import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageRangeDisplayed?: number;
  showPageInput?: boolean;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageRangeDisplayed = 3,
  showPageInput = true,
  className = "",
}: PaginationProps) {
  const { t } = useTranslation();
  const [pageInput, setPageInput] = useState<string>(String(currentPage));

  const pageNumbers = useMemo(() => {
    const range = Math.floor(pageRangeDisplayed / 2);
    let start = Math.max(1, currentPage - range);
    let end = Math.min(totalPages, currentPage + range);

    // Adjust if we're near the beginning or end
    if (end - start + 1 < pageRangeDisplayed) {
      if (start === 1) {
        end = Math.min(totalPages, start + pageRangeDisplayed - 1);
      } else if (end === totalPages) {
        start = Math.max(1, end - pageRangeDisplayed + 1);
      }
    }

    const pages: (number | string)[] = [];

    // Add first page and ellipsis if needed
    if (start > 1) {
      pages.push(1);
      if (start > 2) {
        pages.push("...");
      }
    }

    // Add page numbers in range
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    // Add ellipsis and last page if needed
    if (end < totalPages) {
      if (end < totalPages - 1) {
        pages.push("...");
      }
      pages.push(totalPages);
    }

    return pages;
  }, [currentPage, totalPages, pageRangeDisplayed]);

  const handlePageClick = (page: number) => {
    if (page !== currentPage && page >= 1 && page <= totalPages) {
      onPageChange(page);
      setPageInput(String(page));
    }
  };

  const handlePrevious = () => {
    if (currentPage > 1) {
      handlePageClick(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      handlePageClick(currentPage + 1);
    }
  };

  const handleGoToPage = () => {
    const page = Number(pageInput);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      handlePageClick(page);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleGoToPage();
    }
  };

  if (totalPages <= 1) return null;

  return (
    <div className={`flex flex-wrap items-center justify-center gap-3 ${className}`}>
      <div className="flex items-center gap-2">
        {/* Previous Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevious}
          disabled={currentPage === 1}
          className="px-2 py-1 text-sm hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
          {t("Previous")}
        </Button>

        {/* Page Numbers */}
        <div className="flex items-center gap-2">
          {pageNumbers.map((page, index) => {
            if (page === "...") {
              return (
                <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                  ...
                </span>
              );
            }

            const pageNum = page as number;
            const isActive = pageNum === currentPage;

            return (
              <Button
                key={pageNum}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => handlePageClick(pageNum)}
                className={
                  isActive
                    ? "border-blue-600 bg-blue-600 px-3 py-1 text-sm text-white"
                    : "border px-3 py-1 text-sm hover:bg-muted hover:text-foreground"
                }>
                {pageNum}
              </Button>
            );
          })}
        </div>

        {/* Next Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={currentPage === totalPages}
          className="px-2 py-1 text-sm hover:bg-muted">
          {t("Next")}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Page Input */}
      {showPageInput && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("Go to")}</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(e) => {
              const value = e.target.value.replace(/[^\d]/g, "");
              setPageInput(value);
            }}
            onKeyDown={handleInputKeyDown}
            className="h-8 w-16 px-2 py-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoToPage}
            disabled={pageInput === "" || Number(pageInput) < 1 || Number(pageInput) > totalPages}>
            {t("Go")}
          </Button>
        </div>
      )}
    </div>
  );
}
