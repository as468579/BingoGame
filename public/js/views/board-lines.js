// Geometry follows cell centers, independent of board size or the numbers in each cell.
export function boardLineDefinitions(size) {
  if (!Number.isInteger(size) || size < 1) return [];
  const center = index => (index + 0.5) * 100 / size;
  const line = (kind, index, indices, x1, y1, x2, y2) => ({ kind, index, indices,
    x1: center(x1), y1: center(y1), x2: center(x2), y2: center(y2) });
  const indices = Array.from({ length: size }, (_, index) => index);
  return [
    ...indices.map(row => line('row', row, indices.map(column => row * size + column), 0, row, size - 1, row)),
    ...indices.map(column => line('column', column, indices.map(row => row * size + column), column, 0, column, size - 1)),
    line('diagonal', 0, indices.map(index => index * (size + 1)), 0, 0, size - 1, size - 1),
    line('diagonal', 1, indices.map(index => (index + 1) * (size - 1)), size - 1, 0, 0, size - 1)
  ];
}

export function completedBoardLines(cells, size) {
  if (cells.length !== size * size) return [];
  return boardLineDefinitions(size).filter(line => line.indices.every(index => cells[index].isCovered === true))
    .map(({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 }));
}

export function renderBoardLines(cells, size) {
  return completedBoardLines(cells, size).map(coordinates => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    for (const [key, value] of Object.entries(coordinates)) line.setAttribute(key, value);
    return line;
  });
}
