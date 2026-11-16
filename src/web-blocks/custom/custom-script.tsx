import { cn } from "~/builder/core/functions/common-functions";
import { registerChaiBlockProps } from "~/registry";
import { useInnerHtml } from "~/web-blocks/use-inner-html";
import { ChaiBlockComponentProps } from "~/types/blocks";

import { CodeIcon } from "@radix-ui/react-icons";

export type CustomScriptBlockProps = {
  scripts: string;
};

const CustomScript = (props: ChaiBlockComponentProps<CustomScriptBlockProps>) => {
  const { scripts, inBuilder, blockProps } = props;
  const scriptsHtml = useInnerHtml(scripts);

  if (inBuilder)
    return (
      <div {...blockProps}>
        <div className={cn("pointer-events-none flex flex-col items-center justify-center p-2", "")}>
          <div className="h-full w-full rounded bg-gray-200 p-1 dark:bg-gray-800">
            <p className="text-left text-xs text-gray-400">
              Scripts will be only executed in preview and live mode. Place your script at the bottom of the
            </p>
          </div>
        </div>
      </div>
    );
  return <div dangerouslySetInnerHTML={scriptsHtml}></div>;
};

const Config = {
  type: "CustomScript",
  description: "similar to a script element in HTML",
  label: "Custom Script",
  category: "core",
  icon: CodeIcon,
  hidden: true,
  group: "advanced",
  props: registerChaiBlockProps({
    properties: {
      scripts: {
        type: "string",
        title: "Script",
        description:
          'Runs after the visitor first scrolls, taps or presses a key, or 10 s after the page has loaded and gone idle. Add data-load="load" to a <script> that must be visible before that: it then runs at load and costs LCP and INP on phones. See docs/custom-scripts.md.',
        default: "",
        format: "code",
        placeholder: "<script>console.log('Hello, world!');</script>",
      },
    },
  }),
};

export { CustomScript as Component, Config };
