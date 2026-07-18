declare module "latex.js" {
  export class HtmlGenerator {
    constructor(options?: { hyphenate?: boolean });
    domFragment(): DocumentFragment;
  }

  export function parse(
    latex: string,
    options?: { generator?: HtmlGenerator },
  ): unknown;

  export class Generator {}
  export class SyntaxError extends Error {}
}
