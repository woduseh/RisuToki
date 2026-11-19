declare module '*.css?inline' {
  const source: string;
  export default source;
}

declare module '*.css?raw' {
  const source: string;
  export default source;
}

declare module '*.woff2?inline' {
  const dataUri: string;
  export default dataUri;
}
