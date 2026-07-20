/// <reference types="vite/client" />

declare module 'three/webgpu' {
  export const WebGPURenderer: new (params?: {
    canvas?: HTMLCanvasElement;
    antialias?: boolean;
  }) => {
    init: () => Promise<void>;
    setPixelRatio: (n: number) => void;
    setSize: (w: number, h: number) => void;
    render: (scene: unknown, camera: unknown) => void;
    shadowMap: { enabled: boolean; type: unknown };
    outputColorSpace?: unknown;
    toneMapping?: unknown;
    toneMappingExposure?: number;
    setClearColor?: (c: number, a?: number) => void;
    clear?: () => void;
    domElement: HTMLCanvasElement;
  };
}
