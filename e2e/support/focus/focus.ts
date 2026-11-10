import { expect, type Locator } from "@playwright/test";

export async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const colors = await locator.evaluate((element) => {
    // Outlines sit outside the element: navigation can have a different
    // surrounding surface from the page background.
    let background = getComputedStyle(document.body).backgroundColor;
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const color = getComputedStyle(parent).backgroundColor;
      if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") {
        background = color;
        break;
      }
    }
    return {
      outline: getComputedStyle(element).outlineColor,
      background,
      width: Number.parseFloat(getComputedStyle(element).outlineWidth),
    };
  });
  const luminance = (color: string) => {
    const channels = color
      .match(/\d+/g)!
      .slice(0, 3)
      .map(Number)
      .map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const light = Math.max(
    luminance(colors.outline),
    luminance(colors.background),
  );
  const dark = Math.min(
    luminance(colors.outline),
    luminance(colors.background),
  );
  expect(colors.width).toBeGreaterThanOrEqual(2);
  expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(3);
}
