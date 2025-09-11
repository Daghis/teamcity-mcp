/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '../jest.config.js' {
  const value: any;
  export default value;
}

declare module '../.eslintrc.js' {
  const value: any;
  export default value;
}

declare module '*/jest.config.js' {
  const value: any;
  export default value;
}

declare module '*/.eslintrc.js' {
  const value: any;
  export default value;
}
