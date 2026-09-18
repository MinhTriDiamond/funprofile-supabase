declare module 'ts-ebml' {
  export class Decoder {
    decode(buffer: ArrayBuffer): unknown[];
  }

  export class Reader {
    logging: boolean;
    drop_default_duration: boolean;
    duration: number;
    metadataSize: number;
    metadatas: unknown[];
    cues: unknown[];
    read(element: unknown): void;
    stop(): void;
  }

  export const tools: {
    makeMetadataSeekable(metadata: unknown[], duration: number, cues: unknown[]): ArrayBuffer;
  };
}
