import { getDefaultRegistry } from "@rjsf/core";
import { ObjectFieldTemplatePropertyType, ObjectFieldTemplateProps } from "@rjsf/utils";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { get, last, omit, some } from "lodash-es";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { collapsedSettingsGroupsAtom, renderedSettingsGroupsAtom } from "~/builder/atoms/ui";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "~/components/ui/accordion";
import { Button } from "~/components/ui/button";

const DefaultObjectFieldTemplate = getDefaultRegistry().templates.ObjectFieldTemplate;

type Prop = ObjectFieldTemplatePropertyType;
type Group = { kind: "group"; path: string[]; defaultOpen: boolean; props: Prop[]; segments: Segment[] };
type Segment = { kind: "prop"; prop: Prop } | Group;

// Schema key holding the group label at each nesting depth (see `groupProps`).
const GROUP_KEYS = ["group", "subgroup"] as const;
// Schema key holding the group's `defaultOpen`, at the same depths.
const DEFAULT_OPEN_KEYS = ["groupDefaultOpen", "subgroupDefaultOpen"] as const;

// Accordion value of a group. A subgroup label is only unique within its parent, so a
// subgroup is keyed by its whole path; labels are free text but never hold a control char.
const groupId = (path: string[]) => path.join("\u001f");

// Walks props in render order; a group lands where its first member was declared.
// A group whose members are all hidden gets no header — its props render loose.
const toSegments = (properties: Prop[], schema: ObjectFieldTemplateProps["schema"], parent: string[] = []) => {
  const key = GROUP_KEYS[parent.length];
  const segments: Segment[] = [];
  // A Map, not an object: labels are free text, and "constructor" or "__proto__" would hit the prototype.
  const groups = new Map<string, Group>();
  for (const prop of properties) {
    const label = key ? (get(schema, ["properties", prop.name, key]) as string | undefined) : undefined;
    if (!label) {
      segments.push({ kind: "prop", prop });
      continue;
    }
    let group = groups.get(label);
    if (!group) {
      const defaultOpen = get(schema, ["properties", prop.name, DEFAULT_OPEN_KEYS[parent.length]]) !== false;
      group = { kind: "group", path: [...parent, label], defaultOpen, props: [], segments: [] };
      groups.set(label, group);
      segments.push(group);
    }
    group.props.push(prop);
  }
  return segments.flatMap((segment): Segment[] => {
    if (segment.kind === "prop") return [segment];
    if (segment.props.every((prop) => prop.hidden)) return segment.props.map((prop) => ({ kind: "prop", prop }));
    return [{ ...segment, segments: toSegments(segment.props, schema, segment.path) }];
  });
};

const groupIds = (segments: Segment[]): string[] =>
  segments.flatMap((segment) =>
    segment.kind === "group" ? [groupId(segment.path), ...groupIds(segment.segments)] : [],
  );

const closedGroupIds = (segments: Segment[]): string[] =>
  segments.flatMap((segment) =>
    segment.kind === "group"
      ? [...(segment.defaultOpen ? [] : [groupId(segment.path)]), ...closedGroupIds(segment.segments)]
      : [],
  );

// Indexed by depth. Subgroups sit on a primary tint so they read apart from their parent.
const GROUP_CLASSES = [
  {
    item: "overflow-hidden rounded-md border border-border bg-accent/30 shadow-sm",
    trigger:
      "px-3 py-2 text-xs font-semibold text-foreground transition-colors bg-accent/50 hover:bg-accent/80 hover:no-underline focus-visible:bg-accent/60 focus-visible:outline-none data-[state=open]:border-b data-[state=open]:border-border data-[state=open]:bg-accent/50",
  },
  {
    item: "overflow-hidden rounded-md border border-primary/20 bg-primary/5",
    trigger:
      "px-3 py-2 text-xs font-semibold text-foreground transition-colors bg-primary/10 hover:bg-primary/15 hover:no-underline focus-visible:bg-primary/15 focus-visible:outline-none data-[state=open]:border-b data-[state=open]:border-primary/20",
  },
];

const renderSegments = (segments: Segment[], t: (key: string) => string) =>
  segments.map((segment) => {
    if (segment.kind === "prop") return <Fragment key={segment.prop.name}>{segment.prop.content}</Fragment>;
    const id = groupId(segment.path);
    const label = last(segment.path) ?? "";
    const classes = GROUP_CLASSES[segment.path.length - 1];
    return (
      <AccordionItem key={`group:${id}`} value={id} className={classes.item}>
        <AccordionTrigger className={classes.trigger}>{label ? t(label) : ""}</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-3 px-3 pb-3 pt-3">
          {renderSegments(segment.segments, t)}
        </AccordionContent>
      </AccordionItem>
    );
  });

const GroupedProperties = (props: ObjectFieldTemplateProps) => {
  const { t } = useTranslation();
  const blockType: string = get(props.registry, "formContext.blockType", "");
  const [collapsedByType, setCollapsedByType] = useAtom(collapsedSettingsGroupsAtom);

  const segments = useMemo(() => toSegments(props.properties, props.schema), [props.properties, props.schema]);
  // Every group and subgroup id; one accordion root holds them all, subgroups included.
  const labels = useMemo(() => groupIds(segments), [segments]);
  const closedByDefault = useMemo(() => closedGroupIds(segments), [segments]);
  const collapsed = get(collapsedByType, blockType, closedByDefault);
  const openLabels = labels.filter((label) => !collapsed.includes(label));

  const setRenderedGroups = useSetAtom(renderedSettingsGroupsAtom);
  // RJSF hands a fresh `properties` array every render; key on the labels' content.
  const renderedKey = JSON.stringify({ labels, closedByDefault });
  useEffect(() => {
    setRenderedGroups((prev) => ({ ...prev, [blockType]: JSON.parse(renderedKey) }));
    return () => setRenderedGroups((prev) => omit(prev, blockType));
  }, [blockType, renderedKey, setRenderedGroups]);

  const setOpenLabels = useCallback(
    (open: string[]) =>
      setCollapsedByType((prev) => ({ ...prev, [blockType]: labels.filter((label) => !open.includes(label)) })),
    [blockType, labels, setCollapsedByType],
  );

  const body = (
    <Accordion
      key="grouped-properties"
      type="multiple"
      value={openLabels}
      onValueChange={setOpenLabels}
      className="flex flex-col gap-2">
      {renderSegments(segments, t)}
    </Accordion>
  );

  // Hand the grouped body to RJSF's default template as its only property, so the
  // <fieldset>, root title, description and additionalProperties Add button still render.
  return (
    <DefaultObjectFieldTemplate
      {...props}
      properties={[{ name: "grouped-properties", content: body, hidden: false }]}
    />
  );
};

/**
 * Expand/collapse-all for a block's settings groups. Lives outside the form so it
 * can sit at the top of the settings panel; renders only while that block's form
 * shows grouped sections, and shares state with the form headers.
 */
export const SettingsGroupsToggle = ({ blockType }: { blockType: string }) => {
  const { t } = useTranslation();
  const [collapsedByType, setCollapsedByType] = useAtom(collapsedSettingsGroupsAtom);
  const { labels, closedByDefault } = get(useAtomValue(renderedSettingsGroupsAtom), blockType, {
    labels: [] as string[],
    closedByDefault: [] as string[],
  });
  if (labels.length === 0) return null;

  const collapsed = get(collapsedByType, blockType, closedByDefault);
  const allOpen = labels.every((label) => !collapsed.includes(label));
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="shrink-0 text-muted-foreground"
      onClick={() => setCollapsedByType((prev) => ({ ...prev, [blockType]: allOpen ? labels : [] }))}>
      {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
      {allOpen ? t("Collapse all") : t("Expand all")}
    </Button>
  );
};

/**
 * Renders root-level props tagged by `groupProps` as accordion sections, with nested
 * `groupProps` as subsections inside them. Nested objects and schemas without groups
 * fall through to RJSF's default template.
 */
const GroupedObjectFieldTemplate = (props: ObjectFieldTemplateProps) => {
  const hasGroups =
    props.idSchema.$id === "root" && some(get(props.schema, "properties", {}), (prop: any) => Boolean(prop?.group));
  return hasGroups ? <GroupedProperties {...props} /> : <DefaultObjectFieldTemplate {...props} />;
};

export default GroupedObjectFieldTemplate;
