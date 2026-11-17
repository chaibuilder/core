import { ChaiLibrary, ChaiLibraryBlock } from "~/types/chaibuilder-editor-props";

export const createDefaultChaiLibrary = ({
  baseUrl = "https://chaibuilder-sdk.vercel.app",
}: {
  baseUrl?: string;
} = {}) => {
  return {
    name: "Blocks Library",
    description: "",
    getBlocksList: async (_library: ChaiLibrary) => {
      try {
        const response = await fetch(`${baseUrl}/library-blocks/blocks-list.json`);
        if (!response.ok) {
          console.error("Failed to fetch blocks list:", response.status, response.statusText);
          return [];
        }
        const data = (await response.json()) as any[];
        return data.map((block: any) => ({
          ...block,
          preview: block.preview?.startsWith("http") ? block.preview : `${baseUrl}${block.preview}`,
        }));
      } catch (error) {
        console.error("Error fetching blocks list:", error);
        return [];
      }
    },
    getBlock: async ({ block }: { library: ChaiLibrary; block: ChaiLibraryBlock<any> }) => {
      try {
        const response = await fetch(`${baseUrl}/${block.id}.html?raw`);
        if (!response.ok) {
          console.error(
            `Failed to fetch block "${block.id}" from "${baseUrl}/${block.id}.html?raw": ${response.status} ${response.statusText}`,
          );
          return `<!-- Error loading block "${block.id}": ${response.status} ${response.statusText} -->`;
        }
        const data = await response.text();
        return data;
      } catch (error) {
        console.error(`Error fetching block "${block.id}" from "${baseUrl}/${block.id}.html?raw":`, error);
        return `<!-- Error loading block "${block.id}" -->`;
      }
    },
  };
};
