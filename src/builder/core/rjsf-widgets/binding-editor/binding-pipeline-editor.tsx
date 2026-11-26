import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BindingExpressionInput } from "~/builder/core/components/binding-popup/expression-input";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { getRegisteredChaiPipes } from "~/registry";
import {
  evaluateBindingExpression,
  getCompatibleChaiPipes,
  isChaiPipeAllowedForUsage,
  isValidBindingTemplate,
  parseChaiPipeLiteral,
  parseBindingExpression,
  serializeBindingPipeline,
  type ChaiBindingUsage,
  type ParsedChaiPipe,
} from "~/render/binding-pipes";
import type { ChaiPipeArgumentDefinition, ChaiPipeLiteral } from "~/types";
import { suggestChaiBindingConversion } from "~/utils/analyze-chai-bindings";

type BindingPipelineEditorProps = {
  expression: string;
  externalData: Record<string, any>;
  locale?: string;
  usage?: ChaiBindingUsage;
  onChange: (expression: string) => void;
  onRemove?: () => void;
};

const stringifyPreview = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const defaultArgument = (argument: ChaiPipeArgumentDefinition): ChaiPipeLiteral => {
  if (argument.default !== undefined) return argument.default;
  if (argument.type === "number") return 0;
  if (argument.type === "boolean") return false;
  return "";
};

const updatePipe = (
  path: string,
  pipes: ParsedChaiPipe[],
  pipeIndex: number,
  pipe: ParsedChaiPipe,
  onChange: (expression: string) => void,
) => {
  const next = pipes.slice();
  next[pipeIndex] = pipe;
  onChange(serializeBindingPipeline(path, next));
};

const ArgumentControl = ({
  definition,
  value,
  onChange,
}: {
  definition: ChaiPipeArgumentDefinition;
  value: ChaiPipeLiteral | undefined;
  onChange: (value: ChaiPipeLiteral) => void;
}) => {
  if (definition.type === "select" || definition.type === "boolean") {
    const options =
      definition.type === "boolean"
        ? [
            { label: "true", value: true },
            { label: "false", value: false },
          ]
        : (definition.options ?? []);
    return (
      <Select
        value={String(value ?? defaultArgument(definition))}
        onValueChange={(next) => onChange(definition.type === "boolean" ? next === "true" : next)}>
        <SelectTrigger aria-label={definition.label ?? definition.name} className="h-7">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={String(option.value)} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      aria-label={definition.label ?? definition.name}
      type={definition.type === "number" ? "number" : "text"}
      value={value == null ? "" : String(value)}
      placeholder={definition.label ?? definition.name}
      className="h-7"
      onChange={(event) => {
        if (definition.type === "number") return onChange(Number(event.target.value || 0));
        if (definition.type === "literal") {
          const literal = parseChaiPipeLiteral(event.target.value);
          return onChange(literal.valid ? literal.value : event.target.value);
        }
        onChange(event.target.value);
      }}
    />
  );
};

export const BindingPipelineEditor = ({
  expression,
  externalData,
  locale = "en",
  usage = "value",
  onChange,
  onRemove,
}: BindingPipelineEditorProps) => {
  const { t } = useTranslation();
  const parsed = useMemo(() => parseBindingExpression(expression), [expression]);
  const evaluation = useMemo(
    () => evaluateBindingExpression(expression, externalData, { locale, usage }),
    [expression, externalData, locale, usage],
  );
  const safeParsed = parsed.kind === "path" || parsed.kind === "pipeline" ? parsed : null;
  const committedPath = safeParsed?.path ?? "";
  // Local draft so intermediate states while typing (`global.`, unknown key) don't
  // rewrite the expression; only a valid plain path commits.
  const [pathDraft, setPathDraft] = useState(committedPath);
  useEffect(() => setPathDraft(committedPath), [committedPath]);
  const pathDraftValid = parseBindingExpression(pathDraft.trim()).kind === "path";
  const compatiblePipes = useMemo(() => {
    if (!evaluation.ok || evaluation.value === undefined) {
      return getRegisteredChaiPipes().filter((pipe) => isChaiPipeAllowedForUsage(pipe, usage));
    }
    return getCompatibleChaiPipes(evaluation.value, usage);
  }, [evaluation, usage]);

  if (!safeParsed) {
    const conversion = suggestChaiBindingConversion(expression);
    const suggestedConversion =
      conversion && isValidBindingTemplate(`{{${conversion}}}`, usage) ? conversion : undefined;
    return (
      <div className="border-destructive/40 bg-destructive/5 text-destructive grid gap-2 rounded-md border p-2 text-[10px]">
        <p>{parsed.kind === "invalid" ? parsed.reason : t("Invalid binding")}</p>
        <div className="flex gap-1">
          {suggestedConversion && (
            <Button type="button" size="xs" onClick={() => onChange(suggestedConversion)}>
              {t("Convert to pipes")}
            </Button>
          )}
          {onRemove && (
            <Button type="button" size="xs" variant="outline" onClick={onRemove}>
              {t("Remove binding")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const movePipe = (from: number, to: number) => {
    if (to < 0 || to >= safeParsed.pipes.length) return;
    const next = safeParsed.pipes.slice();
    const [pipe] = next.splice(from, 1);
    next.splice(to, 0, pipe);
    onChange(serializeBindingPipeline(safeParsed.path, next));
  };

  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <span className="text-muted-foreground text-[10px] font-medium">{t("Data path")}</span>
        <BindingExpressionInput
          value={pathDraft}
          externalData={externalData}
          placeholder="data.path"
          className={`h-7 font-mono text-[11px] ${pathDraftValid ? "" : "border-red-500"}`}
          onValueChange={(next) => {
            setPathDraft(next);
            const trimmed = next.trim();
            if (parseBindingExpression(trimmed).kind === "path") {
              onChange(serializeBindingPipeline(trimmed, safeParsed.pipes));
            }
          }}
        />
      </div>

      <div className="grid gap-1.5">
        {safeParsed.pipes.map((pipe, pipeIndex) => {
          const definition = getRegisteredChaiPipes().find((candidate) => candidate.name === pipe.name);
          if (!definition) return null;
          return (
            <div key={`${pipe.name}-${pipeIndex}`} className="bg-muted/20 grid gap-1 rounded-md border p-2">
              <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{definition.label}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("Move {{label}} up", { label: definition.label })}
                  disabled={pipeIndex === 0}
                  onClick={() => movePipe(pipeIndex, pipeIndex - 1)}>
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("Move {{label}} down", { label: definition.label })}
                  disabled={pipeIndex === safeParsed.pipes.length - 1}
                  onClick={() => movePipe(pipeIndex, pipeIndex + 1)}>
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("Remove {{label}}", { label: definition.label })}
                  onClick={() =>
                    onChange(
                      serializeBindingPipeline(
                        safeParsed.path,
                        safeParsed.pipes.filter((_, index) => index !== pipeIndex),
                      ),
                    )
                  }>
                  <Trash2 />
                </Button>
              </div>
              {definition.description && <p className="text-muted-foreground text-[10px]">{definition.description}</p>}
              {definition.args?.map((argument, argumentIndex) => (
                <label key={argument.name} className="text-muted-foreground grid gap-1 text-[10px]">
                  {argument.label ?? argument.name}
                  <ArgumentControl
                    definition={argument}
                    value={pipe.args[argumentIndex]}
                    onChange={(argumentValue) => {
                      const args = pipe.args.slice();
                      while (args.length <= argumentIndex) {
                        args.push(defaultArgument(definition.args![args.length]));
                      }
                      args[argumentIndex] = argumentValue;
                      updatePipe(safeParsed.path, safeParsed.pipes, pipeIndex, { ...pipe, args }, onChange);
                    }}
                  />
                </label>
              ))}
            </div>
          );
        })}
      </div>

      {safeParsed.pipes.length < 10 && (
        <Select
          onValueChange={(name) => {
            const definition = getRegisteredChaiPipes().find((pipe) => pipe.name === name);
            if (!definition) return;
            const args = (definition.args ?? [])
              .filter((argument) => argument.required || argument.default !== undefined)
              .map(defaultArgument);
            onChange(serializeBindingPipeline(safeParsed.path, [...safeParsed.pipes, { name, args }]));
          }}>
          <SelectTrigger aria-label={t("Add pipe")} className="h-7">
            <span className="text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> {t("Add formatter")}
              </span>
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {compatiblePipes.map((pipe) => (
                <SelectItem key={pipe.name} value={pipe.name}>
                  {pipe.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}

      <div className="bg-muted/20 rounded-md border p-2 text-[10px]">
        <span className="text-muted-foreground font-medium">{t("Preview:")} </span>
        {evaluation.ok ? (
          <span className="break-all">{stringifyPreview(evaluation.value)}</span>
        ) : (
          <span className="text-destructive">{evaluation.reason ?? t("Invalid binding")}</span>
        )}
      </div>
      {onRemove && (
        <Button type="button" size="xs" variant="outline" onClick={onRemove}>
          {t("Remove binding")}
        </Button>
      )}
    </div>
  );
};
