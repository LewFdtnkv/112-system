import type { Page } from "@playwright/test";

/** Simulates the SDK only: selection and draft saving still use the application. */
export async function mockMap(page: Page) {
  await page.route("**/map-config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.SYSTEM112_MAP_CONFIG = { apiKey: "test-map-key" };',
    }),
  );
  await page.route("https://api-maps.yandex.ru/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.ymaps = {
      ready: fn => fn(),
      Map: class {
        constructor(element) {
          this.element = document.createElement('div');
          element.append(this.element);
          this.events = { add: (name, fn) => {
            if (name === 'click') this.element.onclick = () => fn({get: () => [55.7558, 37.6173]});
          }};
          this.geoObjects = { add: () => {} };
          this.element.textContent = 'Тестовая карта';
        }
        setCenter() {}
        destroy() { this.element.onclick = null; this.element.textContent = ''; }
      },
      Placemark: class {
        constructor(point) {
          this.point = point;
          this.geometry = { getCoordinates: () => this.point, setCoordinates: p => { this.point = p; } };
          this.events = { add: () => {} };
        }
      }
    };`,
    }),
  );
}
