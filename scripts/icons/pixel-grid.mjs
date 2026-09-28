// A small point-sampling rasteriser for the mascot's own element tree, so the
// console's pixel-art welcome is generated from the same drawing as the icons
// and cannot drift from them. It understands exactly what mascot.mjs draws:
// groups with inherited paint, absolute M/L/H/V/C/Q/Z paths, circles and
// rects, filled with the nonzero rule and stroked with round joins and caps.

const CURVE_STEPS = 24;

/** Absolute path data as polylines, one per subpath, with a closed flag. */
export function flattenPath(d) {
  const tokens = d.match(/[MLHVCQZmlhvcqz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const subpaths = [];
  let current = null;
  let x = 0;
  let y = 0;
  let command = "";
  let i = 0;
  const num = () => Number(tokens[i++]);
  const start = (px, py) => {
    current = { points: [[px, py]], closed: false };
    subpaths.push(current);
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
    if (command !== command.toUpperCase()) throw new Error(`Relative path command ${command} is not supported`);
    switch (command) {
      case "M": x = num(); y = num(); start(x, y); command = "L"; break;
      case "L": x = num(); y = num(); current.points.push([x, y]); break;
      case "H": x = num(); current.points.push([x, y]); break;
      case "V": y = num(); current.points.push([x, y]); break;
      case "C": {
        const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
        for (let s = 1; s <= CURVE_STEPS; s += 1) {
          const t = s / CURVE_STEPS;
          const u = 1 - t;
          current.points.push([
            u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          ]);
        }
        x = x3; y = y3;
        break;
      }
      case "Q": {
        const [x1, y1, x2, y2] = [num(), num(), num(), num()];
        for (let s = 1; s <= CURVE_STEPS; s += 1) {
          const t = s / CURVE_STEPS;
          const u = 1 - t;
          current.points.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]);
        }
        x = x2; y = y2;
        break;
      }
      case "Z":
        current.closed = true;
        [x, y] = current.points[0];
        command = "";
        break;
      default:
        throw new Error(`Unexpected path token ${tokens[i]}`);
    }
  }
  return subpaths;
}

function circlePolyline(cx, cy, r) {
  const points = [];
  for (let s = 0; s < 64; s += 1) points.push([cx + r * Math.cos((s / 64) * 2 * Math.PI), cy + r * Math.sin((s / 64) * 2 * Math.PI)]);
  return [{ points, closed: true }];
}

function rectPolyline(x, y, width, height) {
  return [{ points: [[x, y], [x + width, y], [x + width, y + height], [x, y + height]], closed: true }];
}

function inside(subpaths, px, py) {
  let winding = 0;
  for (const { points } of subpaths) {
    for (let k = 0; k < points.length; k += 1) {
      const [ax, ay] = points[k];
      const [bx, by] = points[(k + 1) % points.length];
      const cross = (bx - ax) * (py - ay) - (px - ax) * (by - ay);
      if (ay <= py && by > py && cross > 0) winding += 1;
      else if (ay > py && by <= py && cross < 0) winding -= 1;
    }
  }
  return winding !== 0;
}

function nearLine(subpaths, px, py, radius) {
  const limit = radius * radius;
  for (const { points, closed } of subpaths) {
    const count = closed ? points.length : points.length - 1;
    if (points.length === 1 && (points[0][0] - px) ** 2 + (points[0][1] - py) ** 2 <= limit) return true;
    for (let k = 0; k < count; k += 1) {
      const [ax, ay] = points[k];
      const [bx, by] = points[(k + 1) % points.length];
      const dx = bx - ax;
      const dy = by - ay;
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
      if ((ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2 <= limit) return true;
    }
  }
  return false;
}

/** Paint-ordered shapes: `{ subpaths, fill, stroke, strokeWidth }`. */
export function shapesOf(nodes, inherited = {}) {
  const shapes = [];
  for (const [tag, attrs, children] of nodes) {
    const paint = { ...inherited, ...attrs };
    if (tag === "g") { shapes.push(...shapesOf(children ?? [], paint)); continue; }
    const subpaths = tag === "path" ? flattenPath(attrs.d)
      : tag === "circle" ? circlePolyline(attrs.cx, attrs.cy, attrs.r)
      : tag === "rect" ? rectPolyline(attrs.x, attrs.y, attrs.width, attrs.height)
      : null;
    if (!subpaths) throw new Error(`Unsupported element <${tag}>`);
    shapes.push({
      subpaths,
      fill: paint.fill ?? "#000000",
      stroke: paint.stroke ?? "none",
      strokeWidth: Number(paint["stroke-width"] ?? 1),
    });
  }
  return shapes;
}

/**
 * Sample the drawing into square cells `cellSize` units wide. Each cell takes
 * the majority of `samples`² points (ties go to the earlier palette entry, and
 * 0 is empty); edge rows and columns left empty are trimmed. Returns one
 * string of palette indices per row.
 */
export function pixelGrid(nodes, box, { columns, palette, samples = 4 }) {
  const shapes = shapesOf(nodes);
  const cell = box.width / columns;
  const rows = Math.ceil(box.height / cell);
  const index = (colour) => {
    const at = palette.indexOf(colour);
    if (at < 0) throw new Error(`${colour} is not in the pixel palette`);
    return at + 1;
  };
  const colourAt = (px, py) => {
    let colour = 0;
    for (const shape of shapes) {
      if (shape.fill !== "none" && inside(shape.subpaths, px, py)) colour = index(shape.fill);
      if (shape.stroke !== "none" && nearLine(shape.subpaths, px, py, shape.strokeWidth / 2)) colour = index(shape.stroke);
    }
    return colour;
  };
  const grid = [];
  for (let row = 0; row < rows; row += 1) {
    let line = "";
    for (let column = 0; column < columns; column += 1) {
      const votes = new Array(palette.length + 1).fill(0);
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          votes[colourAt(box.x + (column + (sx + 0.5) / samples) * cell, box.y + (row + (sy + 0.5) / samples) * cell)] += 1;
        }
      }
      line += votes.indexOf(Math.max(...votes));
    }
    grid.push(line);
  }
  const painted = (line) => /[^0]/.test(line);
  const kept = grid.slice(grid.findIndex(painted), grid.findLastIndex(painted) + 1);
  const left = Math.min(...kept.map((line) => line.search(/[^0]/)));
  const right = Math.max(...kept.map((line) => line.length - [...line].reverse().join("").search(/[^0]/)));
  return kept.map((line) => line.slice(left, right));
}
