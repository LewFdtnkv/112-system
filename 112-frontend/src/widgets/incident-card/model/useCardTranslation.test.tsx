import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useCardTranslation } from "./useCardTranslation";

const translate = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/translation/yandex", () => ({
  translateToRussian: translate,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("does not keep an old translation after the source changes or a retry fails", async () => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  translate.mockResolvedValueOnce({
    text: "Нужна помощь",
    detected_language_code: "en",
  });
  const { result } = renderHook(() => useCardTranslation("Help"), { wrapper });
  act(() => result.current.translate());
  await waitFor(() => expect(result.current.translation).toBe("Нужна помощь"));
  act(() => result.current.setSource("Another message"));
  expect(result.current.translation).toBe("");
  expect(result.current.detectedLanguage).toBeUndefined();
  translate.mockRejectedValueOnce(new Error("offline"));
  act(() => result.current.translate());
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.translation).toBe("");
});
