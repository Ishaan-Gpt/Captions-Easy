/** replaced at build time from package.json */
declare const __CAPTIONSEASY_VERSION__: string | undefined;
/** replaced at build time: true in the browser bundle (no files, no add-ons) */
declare const __CAPTIONSEASY_BROWSER__: boolean | undefined;
export const IS_BROWSER_BUILD: boolean = typeof __CAPTIONSEASY_BROWSER__ === "boolean" ? __CAPTIONSEASY_BROWSER__ : false;
export const VERSION: string = typeof __CAPTIONSEASY_VERSION__ === "string" ? __CAPTIONSEASY_VERSION__ : "0.0.0-dev";
