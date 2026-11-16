/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { useAtom } from "jotai";
import { filter, get, has, map } from "lodash-es";
import { useEffect, useMemo } from "react";
import { BuilderStoreProvider, renderInBuilder } from "~/tests/builder/render-in-builder";

type MockDocument = {
  documentElement: {
    classList: {
      add: ReturnType<typeof vi.fn<(className: string) => void>>;
      remove: ReturnType<typeof vi.fn<(className: string) => void>>;
    };
  };
};
import { TAILWIND_THEME_STYLE_ID } from "~/builder/core/components/canvas/IframeInitialContent";
import { getThemeCustomFontFace, getThemeFontsUrls } from "~/builder/core/components/canvas/static/chai-theme-helpers";
import { HeadTags } from "~/builder/core/components/canvas/static/head-tags";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { selectedStylingBlocksAtom } from "~/builder/hooks/use-selected-styling-blocks";
import { chaiThemeValuesAtom } from "~/builder/hooks/use-theme";
import type { ChaiFontBySrc, ChaiFontByUrl } from "~/types";

describe("HeadTags Custom Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useDarkModeEffect", () => {
    it("should add dark class when darkMode is true", () => {
      const mockDoc: MockDocument = {
        documentElement: {
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
          },
        },
      };

      renderHook(
        ({ darkMode, iframeDoc }: { darkMode: boolean; iframeDoc: MockDocument | null }) => {
          useEffect(() => {
            if (darkMode) iframeDoc?.documentElement.classList.add("dark");
            else iframeDoc?.documentElement.classList.remove("dark");
          }, [darkMode, iframeDoc]);
        },
        {
          initialProps: { darkMode: true, iframeDoc: mockDoc },
        },
      );

      expect(mockDoc.documentElement.classList.add).toHaveBeenCalledWith("dark");
      expect(mockDoc.documentElement.classList.remove).not.toHaveBeenCalled();
    });

    it("should remove dark class when darkMode is false", () => {
      const mockDoc: MockDocument = {
        documentElement: {
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
          },
        },
      };

      renderHook(
        ({ darkMode, iframeDoc }: { darkMode: boolean; iframeDoc: MockDocument | null }) => {
          useEffect(() => {
            if (darkMode) iframeDoc?.documentElement.classList.add("dark");
            else iframeDoc?.documentElement.classList.remove("dark");
          }, [darkMode, iframeDoc]);
        },
        {
          initialProps: { darkMode: false, iframeDoc: mockDoc },
        },
      );

      expect(mockDoc.documentElement.classList.remove).toHaveBeenCalledWith("dark");
      expect(mockDoc.documentElement.classList.add).not.toHaveBeenCalled();
    });

    it("should handle null iframeDoc gracefully", () => {
      expect(() => {
        renderHook(
          ({ darkMode, iframeDoc }: { darkMode: boolean; iframeDoc: MockDocument | null }) => {
            useEffect(() => {
              if (darkMode) iframeDoc?.documentElement.classList.add("dark");
              else iframeDoc?.documentElement.classList.remove("dark");
            }, [darkMode, iframeDoc]);
          },
          {
            initialProps: { darkMode: true, iframeDoc: null },
          },
        );
      }).not.toThrow();
    });
  });

  describe("useSelectedStylingBlocksStyles", () => {
    it("should generate styles for selected styling blocks with blue outline when blocks are selected", () => {
      const { result } = renderHook(
        () => {
          const [selectedStylingBlocks, setSelectedStylingBlocks] = useAtom(selectedStylingBlocksAtom);
          const [selectedBlockIds, setSelectedBlockIds] = useAtom(selectedBlockIdsAtom);

          const styles = useMemo(() => {
            return `${map(selectedStylingBlocks, ({ id }: { id: string }) => `[data-style-id="${id}"]`).join(",")}{
                outline: 1px solid ${selectedBlockIds.length > 0 ? "#42a1fc" : "#de8f09"} !important; outline-offset: -1px;
            }`;
          }, [selectedStylingBlocks, selectedBlockIds]);

          return { styles, setSelectedStylingBlocks, setSelectedBlockIds };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setSelectedStylingBlocks([{ id: "block1" }, { id: "block2" }] as any);
        result.current.setSelectedBlockIds(["id1"]);
      });

      expect(result.current.styles).toContain('[data-style-id="block1"]');
      expect(result.current.styles).toContain('[data-style-id="block2"]');
      expect(result.current.styles).toContain("#42a1fc");
    });

    it("should generate styles with orange outline when no blocks are selected", () => {
      const { result } = renderHook(
        () => {
          const [selectedStylingBlocks, setSelectedStylingBlocks] = useAtom(selectedStylingBlocksAtom);
          const [selectedBlockIds] = useAtom(selectedBlockIdsAtom);

          const styles = useMemo(() => {
            return `${map(selectedStylingBlocks, ({ id }: { id: string }) => `[data-style-id="${id}"]`).join(",")}{
                outline: 1px solid ${selectedBlockIds.length > 0 ? "#42a1fc" : "#de8f09"} !important; outline-offset: -1px;
            }`;
          }, [selectedStylingBlocks, selectedBlockIds]);

          return { styles, setSelectedStylingBlocks };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setSelectedStylingBlocks([{ id: "block1" }] as any);
      });

      expect(result.current.styles).toContain("#de8f09");
    });
  });

  describe("useSelectedBlocksStyles", () => {
    it("should generate styles for selected blocks", () => {
      const { result } = renderHook(
        () => {
          const [selectedBlockIds, setSelectedBlockIds] = useAtom(selectedBlockIdsAtom);

          const styles = useMemo(() => {
            return `${map(selectedBlockIds, (id: string) => `[data-block-id="${id}"]`).join(",")}{
                outline: 1px solid #42a1fc !important; outline-offset: -1px;
            }`;
          }, [selectedBlockIds]);

          return { styles, setSelectedBlockIds };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setSelectedBlockIds(["block1", "block2", "block3"]);
      });

      expect(result.current.styles).toContain('[data-block-id="block1"]');
      expect(result.current.styles).toContain('[data-block-id="block2"]');
      expect(result.current.styles).toContain('[data-block-id="block3"]');
      expect(result.current.styles).toContain("#42a1fc");
    });

    it("should handle empty block selection", () => {
      const { result } = renderHook(
        () => {
          const [selectedBlockIds] = useAtom(selectedBlockIdsAtom);

          return useMemo(() => {
            return `${map(selectedBlockIds, (id: string) => `[data-block-id="${id}"]`).join(",")}{
                outline: 1px solid #42a1fc !important; outline-offset: -1px;
            }`;
          }, [selectedBlockIds]);
        },
        { wrapper: BuilderStoreProvider },
      );

      expect(result.current).toBeTruthy();
      expect(result.current).toContain("outline:");
    });

    it("should update styles when selection changes", () => {
      const { result } = renderHook(
        () => {
          const [selectedBlockIds, setSelectedBlockIds] = useAtom(selectedBlockIdsAtom);

          const styles = useMemo(() => {
            return `${map(selectedBlockIds, (id: string) => `[data-block-id="${id}"]`).join(",")}{
                outline: 1px solid #42a1fc !important; outline-offset: -1px;
            }`;
          }, [selectedBlockIds]);

          return { styles, setSelectedBlockIds };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setSelectedBlockIds(["block1"]);
      });

      const firstResult = result.current.styles;
      expect(firstResult).toContain('[data-block-id="block1"]');

      act(() => {
        result.current.setSelectedBlockIds(["block1", "block2"]);
      });

      expect(result.current.styles).toContain('[data-block-id="block2"]');
      expect(result.current.styles).not.toBe(firstResult);
    });
  });

  describe("useThemeFonts", () => {
    it("should filter fonts based on theme heading and body fonts", () => {
      const mockFonts = [
        { family: "Roboto", url: "https://fonts.google.com/roboto" },
        { family: "Open Sans", url: "https://fonts.google.com/opensans" },
        { family: "Arial", url: "https://fonts.google.com/arial" },
      ];

      const { result } = renderHook(
        () => {
          const [chaiTheme, setChaiTheme] = useAtom(chaiThemeValuesAtom);
          const registeredFonts = mockFonts;

          const pickedFonts = useMemo(() => {
            const heading = get(chaiTheme, "fontFamily.heading");
            const body = get(chaiTheme, "fontFamily.body");
            return registeredFonts.filter(
              (font: { family: string }) => font.family === heading || font.family === body,
            );
          }, [chaiTheme, registeredFonts]);

          return { pickedFonts, setChaiTheme };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setChaiTheme({
          fontFamily: {
            heading: "Roboto",
            body: "Open Sans",
          },
        } as any);
      });

      expect(result.current.pickedFonts).toHaveLength(2);
      expect(result.current.pickedFonts[0].family).toBe("Roboto");
      expect(result.current.pickedFonts[1].family).toBe("Open Sans");
    });

    it("should separate URL fonts and custom fonts", () => {
      const mockFonts = [
        { family: "CustomFont", src: ["url(/fonts/custom.woff2)"], fallback: "sans-serif" },
        { family: "GoogleFont", url: "https://fonts.google.com/font", fallback: "sans-serif" },
      ];

      const { result } = renderHook(
        () => {
          const [chaiTheme, setChaiTheme] = useAtom(chaiThemeValuesAtom);
          const registeredFonts = mockFonts;

          const pickedFonts = useMemo(() => {
            const heading = get(chaiTheme, "fontFamily.heading");
            const body = get(chaiTheme, "fontFamily.body");
            return registeredFonts.filter(
              (font: { family: string }) => font.family === heading || font.family === body,
            );
          }, [chaiTheme, registeredFonts]);

          const fonts = useMemo(
            () => getThemeFontsUrls(filter(pickedFonts, (font) => has(font, "url")) as ChaiFontByUrl[]),
            [pickedFonts],
          );

          const customFonts = useMemo(
            () => getThemeCustomFontFace(filter(pickedFonts, (font) => has(font, "src")) as unknown as ChaiFontBySrc[]),
            [pickedFonts],
          );

          return { fonts, customFonts, setChaiTheme };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setChaiTheme({
          fontFamily: {
            heading: "CustomFont",
            body: "GoogleFont",
          },
        } as any);
      });

      expect(result.current.fonts).toHaveLength(1);
      expect(result.current.customFonts).toContain("CustomFont");
    });

    it("should handle empty font list", () => {
      const { result } = renderHook(
        () => {
          const [chaiTheme, setChaiTheme] = useAtom(chaiThemeValuesAtom);
          const registeredFonts: any[] = useMemo(() => [], []);

          const pickedFonts = useMemo(() => {
            const heading = get(chaiTheme, "fontFamily.heading");
            const body = get(chaiTheme, "fontFamily.body");
            return registeredFonts.filter(
              (font: { family: string }) => font.family === heading || font.family === body,
            );
          }, [chaiTheme, registeredFonts]);

          const fonts = useMemo(
            () => getThemeFontsUrls(filter(pickedFonts, (font) => has(font, "url")) as ChaiFontByUrl[]),
            [pickedFonts],
          );

          const customFonts = useMemo(
            () => getThemeCustomFontFace(filter(pickedFonts, (font) => has(font, "src")) as unknown as ChaiFontBySrc[]),
            [pickedFonts],
          );

          return { fonts, customFonts, setChaiTheme };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setChaiTheme({ fontFamily: {} } as any);
      });

      expect(result.current.fonts).toHaveLength(0);
      expect(result.current.customFonts).toBe("");
    });

    it("should update when theme changes", () => {
      const mockFonts = [
        { family: "Font1", url: "url1" },
        { family: "Font2", url: "url2" },
        { family: "Font3", url: "url3" },
      ];

      const { result } = renderHook(
        () => {
          const [chaiTheme, setChaiTheme] = useAtom(chaiThemeValuesAtom);
          const registeredFonts = mockFonts;

          const pickedFonts = useMemo(() => {
            const heading = get(chaiTheme, "fontFamily.heading");
            const body = get(chaiTheme, "fontFamily.body");
            return registeredFonts.filter(
              (font: { family: string }) => font.family === heading || font.family === body,
            );
          }, [chaiTheme, registeredFonts]);

          return { pickedFonts, setChaiTheme };
        },
        { wrapper: BuilderStoreProvider },
      );

      act(() => {
        result.current.setChaiTheme({
          fontFamily: {
            heading: "Font1",
            body: "Font2",
          },
        } as any);
      });

      expect(result.current.pickedFonts).toHaveLength(2);

      act(() => {
        result.current.setChaiTheme({
          fontFamily: {
            heading: "Font3",
            body: "Font3",
          },
        } as any);
      });

      expect(result.current.pickedFonts).toHaveLength(1);
      expect(result.current.pickedFonts[0].family).toBe("Font3");
    });
  });

  describe("site content width", () => {
    let placeholder: HTMLStyleElement;

    beforeEach(() => {
      placeholder = document.createElement("style");
      placeholder.id = TAILWIND_THEME_STYLE_ID;
      document.head.appendChild(placeholder);
    });

    afterEach(() => {
      placeholder.remove();
    });

    it("writes --site-content-width for the chosen layout and follows layout changes", () => {
      const { store } = renderInBuilder(<HeadTags />, { theme: { siteLayout: "narrow", fontFamily: {} } });

      expect(placeholder.textContent).toContain("--site-content-width: 768px");

      act(() => {
        store.set(chaiThemeValuesAtom, { siteLayout: "fluid", fontFamily: {} } as any);
      });

      expect(placeholder.textContent).toContain("--site-content-width: none");
    });
  });
});
