// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { describe, expect, it } from "vitest";
import i18n from "~/builder/core/locales/load";
import { ChaiBuilderEditor } from "./chaibuilder-editor";

const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });

describe("ChaiBuilderEditor locale plumbing", () => {
  it("applies translations before changeLanguage and renders locale='es' on first paint without English flash", () => {
    const renderedValues: string[] = [];

    const TestLayout = () => {
      const { t } = useTranslation();
      const label = t("Save");
      const custom = t("Host Custom Block");
      renderedValues.push(label);
      return (
        <div>
          <span data-testid="save-label">{label}</span>
          <span data-testid="custom-label">{custom}</span>
        </div>
      );
    };

    render(
      <QueryClientProvider client={createQueryClient()}>
        <ChaiBuilderEditor
          blocks={[]}
          locale="es"
          translations={{ es: { Save: "Guardar", "Host Custom Block": "Bloque personalizado" } }}
          layout={TestLayout}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("save-label").textContent).toBe("Guardar");
    expect(screen.getByTestId("custom-label").textContent).toBe("Bloque personalizado");
    // Must not flash the English fallback on the initial render pass.
    expect(renderedValues[0]).toBe("Guardar");
  });

  it("re-renders when a translation bundle is added after mount (bindI18nStore: added)", () => {
    const TestLayout = () => {
      const { t } = useTranslation();
      return <span data-testid="late-key">{t("Late Added Key")}</span>;
    };

    render(
      <QueryClientProvider client={createQueryClient()}>
        <ChaiBuilderEditor blocks={[]} locale="es" layout={TestLayout} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("late-key").textContent).toBe("Late Added Key");

    act(() => {
      i18n.addResourceBundle("es", "translation", { "Late Added Key": "Clave agregada tarde" }, true, true);
    });

    expect(screen.getByTestId("late-key").textContent).toBe("Clave agregada tarde");
  });

  it("updates language when locale prop changes", () => {
    const TestLayout = () => {
      const { t } = useTranslation();
      return <span data-testid="save-label">{t("Save")}</span>;
    };

    const queryClient = createQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ChaiBuilderEditor blocks={[]} locale="es" translations={{ es: { Save: "Guardar" } }} layout={TestLayout} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("save-label").textContent).toBe("Guardar");

    rerender(
      <QueryClientProvider client={queryClient}>
        <ChaiBuilderEditor blocks={[]} locale="en" translations={{ es: { Save: "Guardar" } }} layout={TestLayout} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("save-label").textContent).toBe("Save");
  });
});
