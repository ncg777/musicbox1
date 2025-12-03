/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module './pcsGraphData.json' {
  const data: {
    nodes: string[];
    adjacency: number[][];
  };
  export default data;
}
