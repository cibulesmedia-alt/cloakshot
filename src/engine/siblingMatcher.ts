/**
 * Shift+Click Sibling / Column Batching:
 * Given a clicked element inside a table, ARIA grid, or repeating list/card container,
 * finds all structurally matching sibling cells/items in one click without site-specific selectors.
 */

interface PathStep {
  tag: string;
  nthOfType: number;
}

function getRelativePath(ancestor: HTMLElement, target: HTMLElement): PathStep[] | null {
  const steps: PathStep[] = [];
  let current: HTMLElement | null = target;

  while (current && current !== ancestor) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) return null;
    const sameTagSiblings = Array.from(parent.children).filter(
      (child) => child.tagName === current!.tagName,
    );
    const nthOfType = sameTagSiblings.indexOf(current);
    steps.unshift({ tag: current.tagName, nthOfType });
    current = parent;
  }

  return current === ancestor ? steps : null;
}

function resolveRelativePath(ancestor: HTMLElement, steps: PathStep[]): HTMLElement | null {
  let current: HTMLElement = ancestor;
  for (const step of steps) {
    const sameTagChildren = Array.from(current.children).filter(
      (child) => child.tagName === step.tag,
    ) as HTMLElement[];
    const next = sameTagChildren[step.nthOfType];
    if (!next) return null;
    current = next;
  }
  return current;
}

export function findMatchingSiblings(target: HTMLElement): HTMLElement[] {
  // 1. Standard HTML Table Column
  const td = target.closest('td, th') as HTMLTableCellElement | null;
  if (td) {
    const table = td.closest('table');
    if (table) {
      const colIdx = td.cellIndex;
      const innerPath = getRelativePath(td, target);
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const candidateRows = rows.length > 0 ? rows : Array.from(table.querySelectorAll('tr'));
      const matches: HTMLElement[] = [];

      for (const row of candidateRows) {
        const cell = row.children[colIdx] as HTMLElement | undefined;
        if (!cell || cell.tagName === 'TH') continue;
        if (innerPath && innerPath.length > 0) {
          const resolved = resolveRelativePath(cell, innerPath);
          if (resolved) matches.push(resolved);
        } else {
          matches.push(cell);
        }
      }

      if (matches.length > 1) return matches;
    }
  }

  // 2. ARIA Grid / Table Column
  const gridCell = target.closest('[role="gridcell"], [role="cell"]') as HTMLElement | null;
  if (gridCell) {
    const row = gridCell.closest('[role="row"]');
    const grid = gridCell.closest('[role="grid"], [role="table"]');
    if (row && grid) {
      const rowCells = Array.from(row.querySelectorAll<HTMLElement>('[role="gridcell"], [role="cell"]'));
      const colIdx = rowCells.indexOf(gridCell);
      const innerPath = getRelativePath(gridCell, target);

      if (colIdx >= 0) {
        const matches: HTMLElement[] = [];
        const allRows = grid.querySelectorAll('[role="row"]');
        for (const r of allRows) {
          const cells = r.querySelectorAll<HTMLElement>('[role="gridcell"], [role="cell"]');
          const cell = cells[colIdx];
          if (!cell) continue;
          if (innerPath && innerPath.length > 0) {
            const resolved = resolveRelativePath(cell, innerPath);
            if (resolved) matches.push(resolved);
          } else {
            matches.push(cell);
          }
        }
        if (matches.length > 1) return matches;
      }
    }
  }

  // 3. Repeating List / Card Siblings (climb up to 6 levels to find a repeating container)
  let item: HTMLElement | null = target;
  for (let depth = 0; depth < 6 && item && item.parentElement; depth++) {
    const container: HTMLElement = item.parentElement;
    if (container === document.body || container === document.documentElement) break;

    const sameTagSiblings = Array.from(container.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === item!.tagName,
    );

    if (sameTagSiblings.length >= 2) {
      const pathFromItem = getRelativePath(item, target);
      if (pathFromItem) {
        const matches: HTMLElement[] = [];
        for (const sibling of sameTagSiblings) {
          const resolved =
            pathFromItem.length === 0 ? sibling : resolveRelativePath(sibling, pathFromItem);
          if (resolved) matches.push(resolved);
        }
        if (matches.length >= 2) {
          return matches;
        }
      }
    }

    item = container;
  }

  return [target];
}
