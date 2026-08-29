/**
 * Multiplies a column-major 4x4 matrix (the layout vgpu/scene cameras use,
 * m[col * 4 + row]) by a homogeneous point (x, y, z, 1).
 */
export function transformPoint(
  matrix: Float32Array,
  x: number,
  y: number,
  z: number
): { x: number; y: number; z: number; w: number } {
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    w: matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
  };
}

/**
 * Projects a world-space point on the ground plane (y = 0) through a camera's
 * viewProjection matrix into CSS pixel coordinates, matching the card position
 * math in canvas/layout.ts and the WGSL vertex shader in card-common.wgsl.
 */
export function worldToScreen(
  viewProjection: Float32Array,
  worldX: number,
  worldZ: number,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number; visible: boolean } {
  const clip = transformPoint(viewProjection, worldX, 0, worldZ);
  if (clip.w <= 0) return { x: 0, y: 0, visible: false };
  const ndcX = clip.x / clip.w;
  const ndcY = clip.y / clip.w;
  return {
    x: (ndcX * 0.5 + 0.5) * screenWidth,
    y: (1 - (ndcY * 0.5 + 0.5)) * screenHeight,
    visible: true,
  };
}

export interface ScreenCardFrame {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDeg: number;
  readonly visible: boolean;
}

export function worldCardToScreenFrame(
  viewProjection: Float32Array,
  worldX: number,
  worldZ: number,
  cardWidth: number,
  cardHeight: number,
  screenWidth: number,
  screenHeight: number
): ScreenCardFrame {
  const center = worldToScreen(
    viewProjection,
    worldX,
    worldZ,
    screenWidth,
    screenHeight
  );
  const right = worldToScreen(
    viewProjection,
    worldX + cardWidth / 2,
    worldZ,
    screenWidth,
    screenHeight
  );
  const vertical = worldToScreen(
    viewProjection,
    worldX,
    worldZ + cardHeight / 2,
    screenWidth,
    screenHeight
  );
  const visible = center.visible && right.visible && vertical.visible;
  const axisX = { x: right.x - center.x, y: right.y - center.y };
  const axisY = { x: vertical.x - center.x, y: vertical.y - center.y };

  return {
    centerX: center.x,
    centerY: center.y,
    width: Math.hypot(axisX.x, axisX.y) * 2,
    height: Math.hypot(axisY.x, axisY.y) * 2,
    rotationDeg: (Math.atan2(axisX.y, axisX.x) * 180) / Math.PI,
    visible,
  };
}
