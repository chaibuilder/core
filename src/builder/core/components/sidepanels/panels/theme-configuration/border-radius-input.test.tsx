// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BorderRadiusInput from "./border-radius-input";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 10,
    width: 100,
    height: 10,
    toJSON: () => ({}),
  });
  vi.spyOn(Element.prototype, "hasPointerCapture").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const drag = (x: number) => {
  const track = screen.getByRole("slider").parentElement!;
  fireEvent.pointerDown(track, { button: 0, pointerId: 1, clientX: x });
  return track;
};

describe("BorderRadiusInput", () => {
  it("moves the thumb immediately and debounces theme updates during drag", () => {
    const onChange = vi.fn();
    render(<BorderRadiusInput value="4px" onChange={onChange} />);
    const track = drag(20);
    fireEvent.pointerMove(track, { pointerId: 1, clientX: 60 });
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("30");
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("30");
  });

  it("commits the final value on release without a delayed duplicate", () => {
    const onChange = vi.fn();
    render(<BorderRadiusInput value="4px" onChange={onChange} />);
    const track = drag(60);
    fireEvent.pointerUp(track, { pointerId: 1, clientX: 60 });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("30");
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("cancels pending edits when an external value replaces the theme", () => {
    const onChange = vi.fn();
    const { rerender } = render(<BorderRadiusInput value="4px" onChange={onChange} />);
    drag(60);
    rerender(<BorderRadiusInput value="12px" onChange={onChange} />);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("12");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cancels pending edits on unmount", () => {
    const onChange = vi.fn();
    const { unmount } = render(<BorderRadiusInput value="4px" onChange={onChange} />);
    drag(60);
    unmount();
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).not.toHaveBeenCalled();
  });
});
