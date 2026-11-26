// culori v4 不随包提供类型声明，这里只声明本项目用到的部分。
declare module 'culori' {
  export interface CuloriColor {
    mode?: string;
    h?: number;
    s?: number;
    v?: number;
    l?: number;
    r?: number;
    g?: number;
    b?: number;
    a?: number;
    [key: string]: unknown;
  }

  export type ColorInput = string | CuloriColor;

  export function converter(mode: string): (color: ColorInput) => CuloriColor | undefined;
  export function formatHex(color: ColorInput): string | undefined;
  export function parse(color: string): CuloriColor | undefined;
}
