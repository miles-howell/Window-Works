GRID_COLUMNS = 30
GRID_ROWS = 13

CELL_WIDTH_PERCENT = 100 / GRID_COLUMNS
CELL_HEIGHT_PERCENT = 100 / GRID_ROWS


def cell_identifier(row: int, column: int) -> str:
    """Generate a predictable identifier for a grid position."""
    return f"cell-r{row:02d}c{column:02d}"


def grid_to_percentages(
    row: int,
    column: int,
    row_span: int = 1,
    column_span: int = 1,
) -> tuple[float, float, float, float]:
    """Return percentage-based coordinates for a grid position."""

    left = (column - 1) * CELL_WIDTH_PERCENT
    top = (row - 1) * CELL_HEIGHT_PERCENT
    width = max(column_span, 1) * CELL_WIDTH_PERCENT
    height = max(row_span, 1) * CELL_HEIGHT_PERCENT
    return left, top, width, height
