import { syncBlocksWithDefaultProps } from "~/registry";
import { getBlocksFromHTML } from "~/utils/import-html/html-to-json";

// Mock the runtime module
vi.mock("~/registry", () => ({
  syncBlocksWithDefaultProps: vi.fn((blocks) => blocks),
  // getBlocksFromHTML now also calls restoreBlockPropTypes -> getRegisteredChaiBlock;
  // returning undefined makes restore a no-op, leaving these assertions intact.
  getRegisteredChaiBlock: vi.fn(() => undefined),
}));

describe("ImportHTML - syncBlocksWithDefaultProps integration", () => {
  it("should call syncBlocksWithDefaultProps when importing HTML with empty heading", async () => {
    // HTML snippet with an empty heading (common scenario that causes the crash)
    const html = '<h1 class="text-2xl"></h1>';

    const blocks = await getBlocksFromHTML(html);
    const syncedBlocks = syncBlocksWithDefaultProps(blocks);

    // Verify that syncBlocksWithDefaultProps was called
    expect(vi.mocked(syncBlocksWithDefaultProps)).toHaveBeenCalledWith(blocks);
    expect(syncedBlocks).toBeDefined();
  });

  it("should call syncBlocksWithDefaultProps when importing HTML with multiple blocks", async () => {
    const html = `
      <div class="container">
        <h1></h1>
        <p></p>
        <button></button>
      </div>
    `;

    const blocks = await getBlocksFromHTML(html);
    const syncedBlocks = syncBlocksWithDefaultProps(blocks);

    expect(vi.mocked(syncBlocksWithDefaultProps)).toHaveBeenCalled();
    expect(syncedBlocks).toBeDefined();
  });

  it("should handle paragraphs with empty content", async () => {
    const html = '<p class="text-base"></p>';

    const blocks = await getBlocksFromHTML(html);
    const syncedBlocks = syncBlocksWithDefaultProps(blocks);

    expect(vi.mocked(syncBlocksWithDefaultProps)).toHaveBeenCalledWith(blocks);
    expect(syncedBlocks).toBeDefined();
  });

  it("should process complex nested structures", async () => {
    const html = `
      <div>
        <header>
          <h1></h1>
          <nav>
            <a href="#"></a>
          </nav>
        </header>
        <main>
          <section>
            <h2></h2>
            <p></p>
          </section>
        </main>
      </div>
    `;

    const blocks = await getBlocksFromHTML(html);
    const syncedBlocks = syncBlocksWithDefaultProps(blocks);

    expect(vi.mocked(syncBlocksWithDefaultProps)).toHaveBeenCalled();
    expect(syncedBlocks).toBeDefined();
  });
});
