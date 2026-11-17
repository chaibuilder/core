let PRE_IMPORT_HTML_HOOK = async (code: string) => code;

const registerChaiPreImportHtmlHook = (fn: (code: string) => Promise<string>) => {
  PRE_IMPORT_HTML_HOOK = fn;
};

export const runChaiPreImportHtmlHook = async (code: string) => await PRE_IMPORT_HTML_HOOK(code);

export { registerChaiPreImportHtmlHook };
