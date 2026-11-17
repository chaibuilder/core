import {
  BorderAllIcon,
  BorderTopIcon,
  DragHandleHorizontalIcon,
  TableIcon,
  ViewHorizontalIcon,
} from "@radix-ui/react-icons";
import { isEmpty } from "lodash-es";
import { createElement } from "react";
import { generateUuid } from "~/builder/core/functions/common-functions";
import { registerChaiBlock, registerChaiBlockProps, stylesProp } from "~/registry";
import { useInnerHtml } from "~/web-blocks/use-inner-html";
import { ChaiBlockComponentProps, ChaiStyles } from "~/types/blocks";
import { ChaiBlock } from "~/types/common";
import EmptySlot from "~/web-blocks/empty-slot";

export type TableProps = {
  styles: ChaiStyles;
};

export type TableHeadProps = {
  styles: ChaiStyles;
};

export type TableBodyProps = {
  styles: ChaiStyles;
};

export type TableRowProps = {
  styles: ChaiStyles;
};

export type TableCellProps = {
  styles: ChaiStyles;
  content: string;
};

// * Components

const TableBlock = (props: ChaiBlockComponentProps<TableProps>) => {
  const { blockProps, children, styles } = props;
  if (!children) {
    return <EmptySlot />;
  }
  return createElement("table", { ...blockProps, ...styles }, children);
};

const TableHeadBlock = (props: ChaiBlockComponentProps<TableHeadProps>) => {
  const { blockProps, children, styles } = props;
  if (!children) {
    return <EmptySlot />;
  }
  return createElement("thead", { ...blockProps, ...styles }, children);
};

const TableBodyBlock = (props: ChaiBlockComponentProps<TableBodyProps>) => {
  const { blockProps, children, styles } = props;
  if (!children) {
    return <EmptySlot />;
  }
  return createElement("tbody", { ...blockProps, ...styles }, children);
};

const TableRowBlock = (props: ChaiBlockComponentProps<TableRowProps>) => {
  const { blockProps, children, styles } = props;
  if (!children) {
    return <EmptySlot />;
  }

  return createElement("tr", { ...blockProps, ...styles }, children);
};

const TableCellBlock = (props: ChaiBlockComponentProps<TableCellProps>) => {
  const { blockProps, children, content, styles } = props;
  const innerHtml = useInnerHtml(content);

  if (!children && isEmpty(content)) {
    return <EmptySlot />;
  }

  if (!children) {
    return createElement("td", {
      ...blockProps,
      ...styles,
      dangerouslySetInnerHTML: innerHtml,
    });
  }
  return createElement("td", { ...blockProps, ...styles }, children);
};

// * REGISTERING TABLE BLOCKS

registerChaiBlock(TableBlock, {
  type: "Table",
  label: "Table",
  category: "core",
  group: "table",
  hidden: true,
  icon: TableIcon,
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp(""),
    },
  }),
  blocks: getDefaultBlocks("Table"),
});

registerChaiBlock(TableHeadBlock, {
  type: "TableHead",
  label: "Table Head",
  category: "core",
  group: "table",
  hidden: true,
  icon: BorderTopIcon,
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp(""),
    },
  }),
  blocks: getDefaultBlocks("TableHead"),
});

registerChaiBlock(TableBodyBlock, {
  type: "TableBody",
  label: "Table Body",
  category: "core",
  group: "table",
  hidden: true,
  icon: BorderAllIcon,
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp(""),
    },
  }),
  blocks: getDefaultBlocks("TableBody"),
});

registerChaiBlock(TableRowBlock, {
  type: "TableRow",
  label: "Table Row",
  category: "core",
  group: "table",
  hidden: true,
  icon: ViewHorizontalIcon,
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp(""),
    },
  }),
  blocks: getDefaultBlocks("TableRow"),
});

registerChaiBlock(TableCellBlock, {
  type: "TableCell",
  label: "Table Cell",
  category: "core",
  group: "table",
  hidden: true,
  icon: DragHandleHorizontalIcon,
  props: registerChaiBlockProps({
    properties: {
      styles: stylesProp(""),
      content: {
        type: "string",
        default: "Heading goes here",
        title: "Content",
        ui: { "ui:widget": "textarea" },
      },
    },
  }),
  blocks: getDefaultBlocks("TableCell"),
  i18nProps: ["content"],
  aiProps: ["content"],
});

export default TableBlock;

/**
 *
 *
 *  Default blocks generator
 *
 *
 */

function getDefaultBlocks(type: string): ChaiBlock[] {
  const td = (id: string, content: string) => ({
    _id: generateUuid(),
    _parent: id,
    _type: "TableCell",
    styles: "#styles:,",
    content: `${type === "TableHead" ? "Table Head" : "Table Cell " + content}`,
  });

  const tr = (id?: string) => {
    const trId = generateUuid();
    const rootBlock: ChaiBlock = {
      _type: "TableRow",
      _id: trId,
      styles: "#styles:,border-b",
    };
    if (id) rootBlock._parent = id;
    return [rootBlock, td(trId, "1"), td(trId, "2"), td(trId, "3")];
  };

  const thead = (id?: string) => {
    const theadId = generateUuid();
    const rootBlock: ChaiBlock = {
      _id: theadId,
      _type: "TableHead",
      styles: "#styles:,font-medium",
    };
    if (id) rootBlock._parent = id;
    return [rootBlock, ...tr(theadId)];
  };

  const tbody = (id?: string) => {
    const tbodyId = generateUuid();
    const rootBlock: ChaiBlock = {
      _id: tbodyId,
      _type: "TableBody",
      styles: "#styles:,",
    };
    if (id) rootBlock._parent = id;
    return [rootBlock, ...tr(tbodyId), ...tr(tbodyId)];
  };

  if (type === "Table") {
    const tableId = generateUuid();
    return [
      {
        _id: tableId,
        _type: "Table",
        styles: "#styles:,w-full text-left text-gray-500 dark:text-gray-400",
      },
      ...thead(tableId),
      ...tbody(tableId),
    ];
  }

  if (type === "TableRow") return tr();
  if (type === "TableHead") return thead();
  if (type === "TableBody") return tbody();

  return [];
}
