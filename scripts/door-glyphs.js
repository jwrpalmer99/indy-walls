export function drawDoorGlyphForSegment(graphics, state, segment, style, deps) {
  if (!deps.isDoorGlyphsEnabled()) return;
  const key = deps.getSegmentKey(segment);
  const tool = deps.getSegmentWallType(state, segment);
  if (tool !== "doors" && tool !== "secret") return;
  if (!Number.isFinite(segment?.a?.x) || !Number.isFinite(segment?.a?.y)
    || !Number.isFinite(segment?.b?.x) || !Number.isFinite(segment?.b?.y)) return;

  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return;

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const center = {
    x: (segment.a.x + segment.b.x) / 2,
    y: (segment.a.y + segment.b.y) / 2
  };
  const size = Math.max(style.endpointSize * 3.8, 40);
  const width = Math.max(style.outlineWidth, 2);
  const wallData = deps.getSegmentWallData(state, key);
  const doorStates = deps.getDoorStates();
  if (wallData?.ds === doorStates.LOCKED) drawFoundryLockedDoorIcon(graphics, center, ux, uy, nx, ny, size, width, style.outlineColor);
  else if (wallData?.ds === doorStates.OPEN) drawFoundryOpenDoorIcon(graphics, center, ux, uy, nx, ny, size, width, style.outlineColor);
  else if (tool === "secret") drawFoundrySecretDoorIcon(graphics, center, ux, uy, nx, ny, size, width, style.outlineColor);
  else drawFoundryDoorIcon(graphics, center, ux, uy, nx, ny, size, width, style.outlineColor);
}

function drawFoundryLockedDoorIcon(graphics, center, ux, uy, nx, ny, size, width, outlineColor) {
  size *= 1.1;
  ux = 1;
  uy = 0;
  nx = 0;
  ny = 1;

  const fillColor = 0xd8d8d4;
  const lineColor = 0xf0f0ec;
  const shadowColor = outlineColor;
  const halfAlong = size * 0.36;
  const bodyCenter = offsetPoint(center, ux, uy, nx, ny, 0, size * 0.16);
  const bodyHalfAlong = halfAlong * 0.92;
  const bodyHalfAcross = size * 0.23;
  const shackleCenter = offsetPoint(center, ux, uy, nx, ny, 0, -size * 0.06);
  const shackleRadiusAlong = halfAlong * 0.78;
  const shackleRadiusAcross = size * 0.28;
  const lineWidth = Math.max(width * 2.2, 3);

  drawOrientedArc(graphics, shackleCenter, ux, uy, nx, ny, shackleRadiusAlong, shackleRadiusAcross, Math.PI, Math.PI * 2, {
    line: shadowColor,
    lineAlpha: 0.55,
    lineWidth: lineWidth + Math.max(width, 2)
  });
  drawOrientedArc(graphics, shackleCenter, ux, uy, nx, ny, shackleRadiusAlong, shackleRadiusAcross, Math.PI, Math.PI * 2, {
    line: lineColor,
    lineAlpha: 0.85,
    lineWidth
  });

  drawOrientedRect(graphics, bodyCenter, ux, uy, nx, ny, bodyHalfAlong, bodyHalfAcross, {
    fill: fillColor,
    fillAlpha: 0.9,
    line: shadowColor,
    lineAlpha: 0.45,
    lineWidth: Math.max(width, 1.5)
  });

  const keyholeTop = offsetPoint(bodyCenter, ux, uy, nx, ny, 0, -bodyHalfAcross * 0.18);
  const keyholeBottom = offsetPoint(bodyCenter, ux, uy, nx, ny, 0, bodyHalfAcross * 0.55);
  graphics.beginFill(0x56595b, 0.85);
  graphics.drawCircle(keyholeTop.x, keyholeTop.y, Math.max(width * 1.8, size * 0.055));
  graphics.endFill();
  graphics.lineStyle(Math.max(width * 1.25, 2), 0x56595b, 0.85);
  graphics.moveTo(keyholeTop.x, keyholeTop.y);
  graphics.lineTo(keyholeBottom.x, keyholeBottom.y);
}

function drawFoundryOpenDoorIcon(graphics, center, ux, uy, nx, ny, size, width, outlineColor) {
  const fillColor = 0xd8d8d4;
  const lineColor = 0xf0f0ec;
  const hardwareFill = 0x65696c;
  const frameCenter = offsetPoint(center, ux, uy, nx, ny, -size * 0.03, 0);
  const leafCenter = offsetPoint(center, ux, uy, nx, ny, size * 0.25, -size * 0.04);
  const leafHalfAlong = size * 0.15;
  const leafHalfAcross = size * 0.63;

  drawOrientedRect(graphics, frameCenter, ux, uy, nx, ny, size * 0.36, size * 0.5, {
    fill: null,
    line: lineColor,
    lineAlpha: 0.58,
    lineWidth: Math.max(width, 1.5)
  });
  drawOrientedRect(graphics, leafCenter, ux, uy, nx, ny, leafHalfAlong, leafHalfAcross, {
    fill: fillColor,
    fillAlpha: 0.86,
    line: outlineColor,
    lineAlpha: 0.52,
    lineWidth: Math.max(width, 1.5)
  });

  const arrowStart = offsetPoint(center, ux, uy, nx, ny, -size * 0.5, 0);
  const arrowEnd = offsetPoint(center, ux, uy, nx, ny, size * 0.12, 0);
  drawArrow(graphics, arrowStart, arrowEnd, Math.max(width * 2.2, 3), lineColor, 0.88, size * 0.15);

  const knob = offsetPoint(leafCenter, ux, uy, nx, ny, -leafHalfAlong * 0.58, leafHalfAcross * 0.06);
  graphics.beginFill(hardwareFill, 0.8);
  graphics.drawCircle(knob.x, knob.y, Math.max(width * 1.4, size * 0.04));
  graphics.endFill();
}

function drawFoundryDoorIcon(graphics, center, ux, uy, nx, ny, size, width, outlineColor) {
  const bodyFill = 0xd8d8d4;
  const panelFill = 0xf1f1ec;
  const hardwareFill = 0x65696c;
  const halfAlong = size * 0.39;
  const halfAcross = size * 0.68;
  const lineWidth = Math.max(width, 1.5);

  drawOrientedRect(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, {
    fill: bodyFill,
    fillAlpha: 0.96,
    line: outlineColor,
    lineAlpha: 0.9,
    lineWidth: lineWidth + 1
  });

  for (const across of [-halfAcross * 0.42, halfAcross * 0.35]) {
    drawOrientedRect(graphics, offsetPoint(center, ux, uy, nx, ny, 0, across), ux, uy, nx, ny, halfAlong * 0.58, halfAcross * 0.15, {
      fill: panelFill,
      fillAlpha: 0.96,
      line: outlineColor,
      lineAlpha: 0.75,
      lineWidth: Math.max(width * 0.75, 1)
    });
  }

  drawDoorRivets(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, width, hardwareFill);
  drawDoorSideHardware(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, width, outlineColor, hardwareFill);
}

function drawFoundrySecretDoorIcon(graphics, center, ux, uy, nx, ny, size, width, outlineColor) {
  const fillColor = 0xe8e6df;
  const lineColor = 0x8b8f8e;
  const halfAlong = size * 0.36;
  const halfAcross = size * 0.58;
  const radius = halfAlong;
  const baseY = halfAcross;
  const archCenter = {along: 0, across: -halfAcross + radius};
  const points = [
    ...getSecretDoorArchPoints(center, ux, uy, nx, ny, archCenter, radius, -Math.PI, 0, 14),
    offsetPoint(center, ux, uy, nx, ny, halfAlong, baseY),
    offsetPoint(center, ux, uy, nx, ny, -halfAlong, baseY)
  ];
  const lineWidth = Math.max(width, 1.5);

  drawOrientedPolygon(graphics, points, {
    fill: fillColor,
    fillAlpha: 0.9,
    line: outlineColor,
    lineAlpha: 0.65,
    lineWidth: lineWidth + 1
  });
  drawSecretDoorDashedOutline(graphics, center, ux, uy, nx, ny, archCenter, radius, halfAlong, baseY, lineColor, lineWidth);
  drawSecretDoorVerticalLines(graphics, center, ux, uy, nx, ny, halfAlong, baseY, lineColor, Math.max(width * 0.65, 1));
}

function getSecretDoorArchPoints(center, ux, uy, nx, ny, archCenter, radius, startAngle, endAngle, steps) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startAngle + (endAngle - startAngle) * t;
    points.push(offsetPoint(
      center,
      ux,
      uy,
      nx,
      ny,
      archCenter.along + Math.cos(angle) * radius,
      archCenter.across + Math.sin(angle) * radius
    ));
  }
  return points;
}

function drawSecretDoorDashedOutline(graphics, center, ux, uy, nx, ny, archCenter, radius, halfAlong, baseY, color, lineWidth) {
  const path = [
    ...getSecretDoorArchPoints(center, ux, uy, nx, ny, archCenter, radius, -Math.PI, 0, 24),
    offsetPoint(center, ux, uy, nx, ny, halfAlong, baseY),
    offsetPoint(center, ux, uy, nx, ny, -halfAlong, baseY),
    offsetPoint(center, ux, uy, nx, ny, -halfAlong, archCenter.across)
  ];
  drawDashedPolyline(graphics, path, color, lineWidth, 4, 3, true);
}

function drawSecretDoorVerticalLines(graphics, center, ux, uy, nx, ny, halfAlong, baseY, color, lineWidth) {
  graphics.lineStyle(lineWidth, color, 0.65);
  for (const along of [-0.45, -0.15, 0.15, 0.45].map((value) => value * halfAlong)) {
    const top = offsetPoint(center, ux, uy, nx, ny, along, -baseY * 0.55);
    const bottom = offsetPoint(center, ux, uy, nx, ny, along, baseY * 0.88);
    graphics.moveTo(top.x, top.y);
    graphics.lineTo(bottom.x, bottom.y);
  }
}

function drawDoorRivets(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, width, color) {
  const radius = Math.max(width * 0.55, 1.1);
  const alongValues = [-0.72, -0.36, 0, 0.36, 0.72].map((value) => value * halfAlong);
  const acrossValues = [-0.82, 0.82].map((value) => value * halfAcross);
  graphics.beginFill(color, 0.85);
  for (const along of alongValues) {
    for (const across of acrossValues) {
      const point = offsetPoint(center, ux, uy, nx, ny, along, across);
      graphics.drawCircle(point.x, point.y, radius);
    }
  }
  for (const along of [-0.82, 0.82].map((value) => value * halfAlong)) {
    for (const across of [-0.55, -0.28, 0, 0.28, 0.55].map((value) => value * halfAcross)) {
      const point = offsetPoint(center, ux, uy, nx, ny, along, across);
      graphics.drawCircle(point.x, point.y, radius);
    }
  }
  graphics.endFill();
}

function drawDoorSideHardware(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, width, outlineColor, color) {
  const knob = offsetPoint(center, ux, uy, nx, ny, -halfAlong * 0.74, 0);
  const tabAlong = halfAlong * 1.04;
  const tabWidth = halfAlong * 0.12;
  const tabHeight = halfAcross * 0.12;
  const tabCenters = [
    offsetPoint(center, ux, uy, nx, ny, tabAlong, -halfAcross * 0.34),
    offsetPoint(center, ux, uy, nx, ny, tabAlong, halfAcross * 0.28)
  ];

  graphics.beginFill(outlineColor, 0.9);
  graphics.drawCircle(knob.x, knob.y, Math.max(width * 1.55, halfAlong * 0.11));
  graphics.endFill();
  graphics.beginFill(color, 1);
  graphics.drawCircle(knob.x, knob.y, Math.max(width * 0.95, halfAlong * 0.07));
  graphics.endFill();

  for (const tab of tabCenters) {
    drawOrientedRect(graphics, tab, ux, uy, nx, ny, tabWidth, tabHeight, {
      fill: 0xd8d8d4,
      fillAlpha: 0.95,
      line: outlineColor,
      lineAlpha: 0.85,
      lineWidth: Math.max(width * 0.75, 1)
    });
  }
}

function drawOrientedRect(graphics, center, ux, uy, nx, ny, halfAlong, halfAcross, {
  fill=null,
  fillAlpha=1,
  line=null,
  lineAlpha=1,
  lineWidth=1
}={}) {
  const points = [
    offsetPoint(center, ux, uy, nx, ny, -halfAlong, -halfAcross),
    offsetPoint(center, ux, uy, nx, ny, halfAlong, -halfAcross),
    offsetPoint(center, ux, uy, nx, ny, halfAlong, halfAcross),
    offsetPoint(center, ux, uy, nx, ny, -halfAlong, halfAcross)
  ];
  if (line !== null) graphics.lineStyle(lineWidth, line, lineAlpha);
  if (fill !== null) graphics.beginFill(fill, fillAlpha);
  drawPolylinePath(graphics, points, true);
  if (fill !== null) graphics.endFill();
}

function drawOrientedPolygon(graphics, points, {
  fill=null,
  fillAlpha=1,
  line=null,
  lineAlpha=1,
  lineWidth=1
}={}) {
  if (!points.length) return;
  if (line !== null) graphics.lineStyle(lineWidth, line, lineAlpha);
  if (fill !== null) graphics.beginFill(fill, fillAlpha);
  drawPolylinePath(graphics, points, true);
  if (fill !== null) graphics.endFill();
}

function drawOrientedArc(graphics, center, ux, uy, nx, ny, radiusAlong, radiusAcross, startAngle, endAngle, {
  line,
  lineAlpha=1,
  lineWidth=1,
  steps=18
}) {
  graphics.lineStyle(lineWidth, line, lineAlpha);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startAngle + (endAngle - startAngle) * t;
    const point = offsetPoint(
      center,
      ux,
      uy,
      nx,
      ny,
      Math.cos(angle) * radiusAlong,
      Math.sin(angle) * radiusAcross
    );
    if (i === 0) graphics.moveTo(point.x, point.y);
    else graphics.lineTo(point.x, point.y);
  }
}

function drawArrow(graphics, start, end, width, color, alpha, headSize) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return;

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const headBase = {
    x: end.x - ux * headSize,
    y: end.y - uy * headSize
  };
  const headHalf = headSize * 0.62;
  const headPoints = [
    end,
    {x: headBase.x + nx * headHalf, y: headBase.y + ny * headHalf},
    {x: headBase.x - nx * headHalf, y: headBase.y - ny * headHalf}
  ];

  graphics.lineStyle(width, color, alpha);
  graphics.moveTo(start.x, start.y);
  graphics.lineTo(headBase.x, headBase.y);
  graphics.beginFill(color, alpha);
  drawPolylinePath(graphics, headPoints, true);
  graphics.endFill();
}

function drawDashedPolyline(graphics, points, color, width, dashLength, gapLength, closed=false) {
  const path = closed && points.length ? [...points, points[0]] : points;
  if (path.length < 2) return;
  graphics.lineStyle(width, color, 0.85);
  for (let i = 0; i < path.length - 1; i++) {
    drawDashedSegment(graphics, path[i], path[i + 1], dashLength, gapLength);
  }
}

function drawDashedSegment(graphics, a, b, dashLength, gapLength) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return;
  const ux = dx / length;
  const uy = dy / length;
  let distance = 0;
  while (distance < length) {
    const start = distance;
    const end = Math.min(distance + dashLength, length);
    graphics.moveTo(a.x + ux * start, a.y + uy * start);
    graphics.lineTo(a.x + ux * end, a.y + uy * end);
    distance += dashLength + gapLength;
  }
}

function offsetPoint(origin, ux, uy, nx, ny, along, across) {
  return {
    x: origin.x + ux * along + nx * across,
    y: origin.y + uy * along + ny * across
  };
}

function drawPolylinePath(graphics, points, closed=false) {
  if (!points.length) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
  if (closed) graphics.lineTo(points[0].x, points[0].y);
}
