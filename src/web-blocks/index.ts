import { registerChaiBlock } from "~/registry";
import { Component as Box, Config as BoxConfig } from "~/web-blocks/box";
import { Component as Button, Config as ButtonConfig } from "~/web-blocks/button";
import { Component as CustomHTML, Config as CustomHTMLConfig } from "~/web-blocks/custom/custom-html";
import { Component as CustomScript, Config as CustomScriptConfig } from "~/web-blocks/custom/custom-script";
import { Component as GlobalBlock, Config as GlobalBlockConfig } from "~/web-blocks/custom/global-block";
import { Component as IconBlock, Config as IconBlockConfig } from "~/web-blocks/custom/icon";
import { PartialBlock, PartialBlockConfig } from "~/web-blocks/custom/partial-block";
import { PageSlot, PageSlotConfig } from "~/web-blocks/custom/page-slot";
import { ChaiSlot, ChaiSlotConfig } from "~/web-blocks/custom/chai-slot";
import { Column, ColumnConfig, Component as Row, Config as RowConfig } from "~/web-blocks/custom/row-col";
import { Component as DividerBlock, Config as DividerBlockConfig } from "~/web-blocks/divider";
import { Component as EmptyBox, Config as EmptyBoxConfig } from "~/web-blocks/empty-box";
import { Component as CheckboxBlock, Config as CheckboxBlockConfig } from "~/web-blocks/form/checkbox";
import { Component as FormBlock, Config as FormBlockConfig } from "~/web-blocks/form/form";
import { Component as FormButtonBlock, Config as FormButtonBlockConfig } from "~/web-blocks/form/form-button";
import { Component as InputBlock, Config as InputBlockConfig } from "~/web-blocks/form/input";
import { Component as LabelBlock, Config as LabelBlockConfig } from "~/web-blocks/form/label";
import { Component as RadioBlock, Config as RadioBlockConfig } from "~/web-blocks/form/radio";
import { Component as SelectBlock, Config as SelectBlockConfig } from "~/web-blocks/form/select";
import { Component as TextAreaBlock, Config as TextAreaBlockConfig } from "~/web-blocks/form/textarea";
import { Component as HeadingBlock, Config as HeadingBlockConfig } from "~/web-blocks/heading";
import { Component as LineBreakBlock, Config as LineBreakBlockConfig } from "~/web-blocks/hidden/line-break";
import "~/web-blocks/hidden/table";
import { Component as ImageBlock, Config as ImageBlockConfig } from "~/web-blocks/image";
import { Component as LinkBlock, Config as LinkBlockConfig } from "~/web-blocks/link";
import { Component as ListBlock, Config as ListBlockConfig } from "~/web-blocks/list";
import { Component as ListItemBlock, Config as ListItemBlockConfig } from "~/web-blocks/listitem";
import { Component as ParagraphBlock, Config as ParagraphBlockConfig } from "~/web-blocks/paragraph";
import { Component as RichTextBlock, Config as RichTextConfig } from "~/web-blocks/rte";
import { Component as SpanBlock, Config as SpanBlockConfig } from "~/web-blocks/span";
import { Config as LayersConfig, Component as TextBlock } from "~/web-blocks/text";
import { Component as VideoBlock, Config as VideoBlockConfig } from "~/web-blocks/video";
import { CollectionItem, CollectionItemConfig } from "./custom/collection-item";
import {
  Repeater,
  RepeaterConfig,
  RepeaterEmptyState,
  RepeaterEmptyStateConfig,
  RepeaterItem,
  RepeaterItemConfig,
} from "./custom/repeater";
/*
 * Register all web blocks.
 * This function should be called  in places where Builder is rendered or pages are rendered.
 * @returns void
 */
const loadWebBlocks = () => {
  registerChaiBlock(Box, BoxConfig);
  registerChaiBlock(EmptyBox, EmptyBoxConfig);
  registerChaiBlock(Button, ButtonConfig);
  registerChaiBlock(HeadingBlock, HeadingBlockConfig);
  registerChaiBlock(ParagraphBlock, ParagraphBlockConfig);
  registerChaiBlock(SpanBlock, SpanBlockConfig);
  registerChaiBlock(RichTextBlock, RichTextConfig);
  registerChaiBlock(LinkBlock, LinkBlockConfig);
  registerChaiBlock(ListBlock, ListBlockConfig);
  registerChaiBlock(ListItemBlock, ListItemBlockConfig);
  registerChaiBlock(IconBlock, IconBlockConfig);
  registerChaiBlock(ImageBlock, ImageBlockConfig);
  registerChaiBlock(VideoBlock, VideoBlockConfig);
  registerChaiBlock(CustomHTML, CustomHTMLConfig);
  registerChaiBlock(CustomScript, CustomScriptConfig);
  registerChaiBlock(TextBlock, LayersConfig);

  // //forms
  registerChaiBlock(FormBlock, FormBlockConfig);
  registerChaiBlock(FormButtonBlock, FormButtonBlockConfig);
  registerChaiBlock(InputBlock, InputBlockConfig);
  registerChaiBlock(CheckboxBlock, CheckboxBlockConfig);
  registerChaiBlock(RadioBlock, RadioBlockConfig);
  registerChaiBlock(SelectBlock, SelectBlockConfig);
  registerChaiBlock(TextAreaBlock, TextAreaBlockConfig);
  registerChaiBlock(LabelBlock, LabelBlockConfig);

  // // hidden
  registerChaiBlock(LineBreakBlock, LineBreakBlockConfig);

  registerChaiBlock(DividerBlock, DividerBlockConfig);
  // // @ts-ignore
  registerChaiBlock(GlobalBlock, GlobalBlockConfig);
  registerChaiBlock(PartialBlock, PartialBlockConfig);
  registerChaiBlock(PageSlot, PageSlotConfig);
  registerChaiBlock(ChaiSlot, ChaiSlotConfig);
  registerChaiBlock(Row, RowConfig);
  registerChaiBlock(Column, ColumnConfig);
  registerChaiBlock(Repeater, RepeaterConfig);
  registerChaiBlock(RepeaterItem, RepeaterItemConfig);
  registerChaiBlock(RepeaterEmptyState, RepeaterEmptyStateConfig);
  registerChaiBlock(CollectionItem, CollectionItemConfig);
};

export { loadWebBlocks };
