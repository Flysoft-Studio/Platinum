declare module "@cronvel/get-pixels" {
    export type ImageType = "png" | "jpg" | "jpeg" | "gif" | "bmp";
    type GetPixelsCallback = (error: Error?, result: any) => void;
    function getPixels(
        input: Buffer | string,
        type: ImageType,
        cb: GetPixelsCallback
    ): void;
    function getPixels(url: string, cb: GetPixelsCallback): void;
    export default getPixels;
}
