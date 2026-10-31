// Geometry follows cell centers, independent of board size or the numbers in each cell.
export function completedBoardLines(cells, size) {
  if (!Number.isInteger(size) || size < 1 || cells.length !== size * size) return [];
  const center = index => (index + 0.5) * 100 / size;
  const line = (indices, x1, y1, x2, y2) => indices.every(index => cells[index].isCovered === true)
    ? [{ x1: center(x1), y1: center(y1), x2: center(x2), y2: center(y2) }] : [];
  const indices = Array.from({ length: size }, (_, index) => index);
  return [
    ...indices.flatMap(row => line(indices.map(column => row * size + column), 0, row, size - 1, row)),
    ...indices.flatMap(column => line(indices.map(row => row * size + column), column, 0, column, size - 1)),
    ...line(indices.map(index => index * (size + 1)), 0, 0, size - 1, size - 1),
    ...line(indices.map(index => (index + 1) * (size - 1)), size - 1, 0, 0, size - 1)
  ];
}

export function renderBoardLines(cells, size) {
  return completedBoardLines(cells, size).map(coordinates => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    for (const [key, value] of Object.entries(coordinates)) line.setAttribute(key, value);
    return line;
  });
}
