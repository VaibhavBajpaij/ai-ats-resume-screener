declare module "pdf-parse/lib/pdf-parse.js" {
  import type { Options, Result } from "pdf-parse";
  const pdfParse: (dataBuffer: Buffer, options?: Options) => Promise<Result>;
  export = pdfParse;
}

