/// <reference types="vite/client" />

/** App version injected by Vite's `define` from package.json. */
declare const __APP_VERSION__: string

declare module "*.md?raw" {
  const content: string
  export default content
}
